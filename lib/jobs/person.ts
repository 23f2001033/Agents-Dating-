import { and, desc, eq, inArray, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { config } from "@/lib/config";
import { getDatasetItems, getRun, startActorRun, TERMINAL_FAIL, ProviderError } from "@/lib/sources/apify";
import {
  contentHash,
  instagramCoverage,
  instagramEvidence,
  linkedinCoverage,
  linkedinEvidence,
  normalizeInstagram,
  normalizeLinkedIn,
  type EvidenceDraft,
  type InstagramNormalized,
  type LinkedInNormalized,
} from "@/lib/sources/normalize";
import { checkIdentity, type IdentityResult } from "@/lib/sources/identity";
import {
  ANALYZER_PROMPT_VERSION,
  ANALYZER_SYSTEM,
  analyzerJsonSchema,
  analyzerUserPrompt,
  buildAgentCard,
  buildPublicIntro,
  validateProfile,
} from "@/lib/analysis/profile";
import { generateJson, withLlmSlot } from "@/lib/llm/client";
import { logEvent, logUsage } from "./log";

export const PERSON_TERMINAL = new Set(["ready", "blocked_private", "blocked_identity", "insufficient_data", "failed"]);
type Person = typeof schema.people.$inferSelect;
type Snapshot = typeof schema.sourceSnapshots.$inferSelect;

const LI_PROVIDER = () => `apify:${config.apifyLinkedinActor}`;
const IG_PROVIDER = () => `apify:${config.apifyInstagramActor}`;

async function setStatus(id: string, status: string, detail: string | null = null, extra: Partial<Person> = {}) {
  await db.update(schema.people).set({ status, statusDetail: detail, updatedAt: new Date(), ...extra }).where(eq(schema.people.id, id));
  return status;
}

export async function latestSnapshots(personId: string) {
  const rows = await db
    .select()
    .from(schema.sourceSnapshots)
    .where(eq(schema.sourceSnapshots.personId, personId))
    .orderBy(desc(schema.sourceSnapshots.createdAt));
  return {
    linkedin: rows.find((r) => r.platform === "linkedin") ?? null,
    instagram: rows.find((r) => r.platform === "instagram") ?? null,
  };
}

async function claimPerson(id: string, leaseSecs = 150): Promise<Person | null> {
  const [p] = await db
    .update(schema.people)
    .set({ leaseUntil: dsql`now() + make_interval(secs => ${leaseSecs})` })
    .where(and(eq(schema.people.id, id), or(isNull(schema.people.leaseUntil), lt(schema.people.leaseUntil, dsql`now()`))))
    .returning();
  return p ?? null;
}

// ---------------- collection ----------------

async function startCollection(p: Person, snap: Snapshot) {
  const run =
    snap.platform === "linkedin"
      ? await startActorRun(config.apifyLinkedinActor, { profileScraperMode: "Profile details no email ($4 per 1k)", queries: [p.linkedinUrl] }, { timeoutSecs: 240 })
      : await startActorRun(config.apifyInstagramActor, { usernames: [p.instagramHandle] }, { timeoutSecs: 240 });
  await db
    .update(schema.sourceSnapshots)
    .set({ status: "running", providerRunId: run.id, providerDatasetId: run.defaultDatasetId, startedAt: new Date(), attempts: snap.attempts + 1, error: null })
    .where(eq(schema.sourceSnapshots.id, snap.id));
  await logEvent({ personId: p.id, type: "source_started", payload: { platform: snap.platform } });
}

type Processed =
  | { ok: true; normalized: LinkedInNormalized | InstagramNormalized; raw: unknown; coverage: Record<string, unknown> }
  | { ok: false; error: string; raw: unknown };

function processLinkedIn(p: Person, items: unknown[]): Processed {
  const slug = p.linkedinSlug.toLowerCase();
  const recs = items as Record<string, unknown>[];
  // Map records by returned identity, never by array position.
  const match =
    recs.find((r) => String(r.publicIdentifier ?? "").toLowerCase() === slug) ??
    recs.find((r) => String(r.linkedinUrl ?? "").toLowerCase().includes(`/in/${slug}`)) ??
    recs.find((r) => String(r.originalQuery ?? (r.query as string) ?? "").toLowerCase().includes(`/in/${slug}`));
  if (!match) return { ok: false, error: "LinkedIn returned no public profile for this link.", raw: items };
  if (match.error || (!match.firstName && !match.headline)) {
    return { ok: false, error: `LinkedIn profile could not be read (${String(match.error ?? "empty profile")}).`, raw: match };
  }
  const li = normalizeLinkedIn(match, p.linkedinUrl);
  return { ok: true, normalized: li, raw: match, coverage: linkedinCoverage(li) };
}

function processInstagram(p: Person, items: unknown[]): Processed {
  const recs = items as Record<string, unknown>[];
  const match = recs.find((r) => String(r.username ?? "").toLowerCase() === p.instagramHandle);
  if (!match) {
    const err = recs.find((r) => r.error);
    return { ok: false, error: err ? `Instagram: ${String(err.errorDescription ?? err.error)}` : "Instagram account not found.", raw: items };
  }
  if (match.error) return { ok: false, error: `Instagram: ${String(match.errorDescription ?? match.error)}`, raw: match };
  const ig = normalizeInstagram(match, p.instagramHandle);
  return { ok: true, normalized: ig, raw: match, coverage: instagramCoverage(ig) };
}

async function stepCollect(p: Person, deadline: number): Promise<string | "waiting"> {
  let snaps = await latestSnapshots(p.id);
  for (const platform of ["linkedin", "instagram"] as const) {
    if (!snaps[platform]) {
      await db.insert(schema.sourceSnapshots).values({ personId: p.id, platform, provider: platform === "linkedin" ? LI_PROVIDER() : IG_PROVIDER() });
    }
  }
  snaps = await latestSnapshots(p.id);
  for (const snap of [snaps.linkedin!, snaps.instagram!]) {
    if (snap.status === "pending") await startCollection(p, snap);
  }
  snaps = await latestSnapshots(p.id);
  const running = [snaps.linkedin!, snaps.instagram!].filter((s) => s.status === "running");
  const waitSecs = Math.max(0, Math.min(25, Math.floor((deadline - Date.now() - 12_000) / 1000)));
  await Promise.all(
    running.map(async (snap) => {
      const run = await getRun(snap.providerRunId!, waitSecs);
      if (run.status === "SUCCEEDED") {
        const items = await getDatasetItems(run.defaultDatasetId);
        const res = snap.platform === "linkedin" ? processLinkedIn(p, items) : processInstagram(p, items);
        if (res.ok) {
          await db
            .update(schema.sourceSnapshots)
            .set({ status: "succeeded", rawPayload: res.raw as object, normalized: res.normalized as object, coverage: res.coverage, contentHash: contentHash(res.normalized), fetchedAt: new Date(), error: null })
            .where(eq(schema.sourceSnapshots.id, snap.id));
          await logEvent({ personId: p.id, type: "source_completed", payload: { platform: snap.platform, coverage: res.coverage } });
        } else {
          await db.update(schema.sourceSnapshots).set({ status: "failed", rawPayload: res.raw as object, error: res.error, fetchedAt: new Date() }).where(eq(schema.sourceSnapshots.id, snap.id));
          await logEvent({ personId: p.id, type: "source_failed", payload: { platform: snap.platform, error: res.error } });
        }
      } else if (TERMINAL_FAIL.has(run.status)) {
        const retry = snap.attempts < 3; // at most two automatic retries per external step
        await db
          .update(schema.sourceSnapshots)
          .set({ status: retry ? "pending" : "failed", error: `provider run ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}` })
          .where(eq(schema.sourceSnapshots.id, snap.id));
        await logEvent({ personId: p.id, type: retry ? "source_retrying" : "source_failed", payload: { platform: snap.platform, providerStatus: run.status } });
      }
    }),
  );
  snaps = await latestSnapshots(p.id);
  const li = snaps.linkedin!;
  const ig = snaps.instagram!;
  if (li.status === "failed" || ig.status === "failed") {
    const which = [li.status === "failed" && `LinkedIn: ${li.error}`, ig.status === "failed" && `Instagram: ${ig.error}`].filter(Boolean).join(" · ");
    return setStatus(p.id, "failed", which);
  }
  if (li.status === "succeeded" && ig.status === "succeeded") return setStatus(p.id, "verifying");
  return "waiting";
}

// ---------------- verification ----------------

async function stepVerify(p: Person): Promise<string> {
  const snaps = await latestSnapshots(p.id);
  const li = snaps.linkedin!.normalized as LinkedInNormalized;
  const ig = snaps.instagram!.normalized as InstagramNormalized;
  const publicState = { isPrivate: ig.isPrivate, basis: "provider visibility field `private`", checkedAt: new Date().toISOString() };
  const displayName = li.fullName || ig.fullName || p.instagramHandle;
  if (ig.isPrivate) {
    await logEvent({ personId: p.id, type: "blocked_private" });
    return setStatus(p.id, "blocked_private", "This Instagram account is private. Only public Instagram accounts can be used.", { publicState, displayName });
  }
  const identity: IdentityResult & { attested?: boolean } = checkIdentity(li, ig);
  if (identity.status === "ambiguous") {
    if (p.origin === "seed" || !p.identityAttested) {
      await logEvent({ personId: p.id, type: "identity_ambiguous", payload: { nameMatch: identity.nameMatch, signals: identity.signals.length } });
      return setStatus(p.id, "blocked_identity", "We could not establish that these accounts belong to the same person.", { publicState, identity, displayName });
    }
    identity.attested = true;
  }
  const liCov = linkedinCoverage(li);
  const igCov = instagramCoverage(ig);
  if (!liCov.headline && !liCov.about && liCov.experienceCount === 0 && !igCov.bio && igCov.captionsAuthored === 0) {
    return setStatus(p.id, "insufficient_data", "Neither account has enough public content to analyze.", { publicState, identity, displayName });
  }
  await logEvent({ personId: p.id, type: "identity_checked", payload: { status: identity.status, attested: Boolean(identity.attested), signals: identity.signals.map((s) => s.detail) } });
  return setStatus(p.id, "analyzing", null, { publicState, identity, displayName });
}

// ---------------- analysis ----------------

export function coverageLine(liCov: ReturnType<typeof linkedinCoverage>, igCov: ReturnType<typeof instagramCoverage>): string {
  const li = [liCov.headline && "headline", liCov.about && `about (${liCov.aboutChars} chars)`, `${liCov.experienceCount} experiences`, liCov.educationCount && `${liCov.educationCount} education`, ...liCov.extraSections].filter(Boolean).join(", ");
  const ig = [igCov.bio && "bio", `${igCov.captionsAuthored} authored captions`, igCov.excludedNotAuthored ? `${igCov.excludedNotAuthored} posts by other accounts excluded` : null].filter(Boolean).join(", ");
  return `LinkedIn: ${li}. Instagram: ${ig}.`;
}

async function stepAnalyze(p: Person, deadline: number): Promise<string> {
  const snaps = await latestSnapshots(p.id);
  const liSnap = snaps.linkedin!;
  const igSnap = snaps.instagram!;
  const li = liSnap.normalized as LinkedInNormalized;
  const ig = igSnap.normalized as InstagramNormalized;
  const drafts: EvidenceDraft[] = [...linkedinEvidence(li), ...instagramEvidence(ig)];
  const collected = (s: Snapshot) => s.fetchedAt ?? new Date();
  // Evidence rows are immutable and keyed by snapshot, so re-running is idempotent.
  await db
    .insert(schema.evidence)
    .values(
      drafts.map((e) => {
        const snap = e.platform === "linkedin" ? liSnap : igSnap;
        return { id: `${snap.id}:${e.localId}`, snapshotId: snap.id, personId: p.id, localId: e.localId, platform: e.platform, field: e.field, label: e.label, excerpt: e.excerpt, url: e.url, publishedAt: e.publishedAt ? new Date(e.publishedAt) : null, collectedAt: collected(snap) };
      }),
    )
    .onConflictDoNothing();

  const liCov = linkedinCoverage(li);
  const igCov = instagramCoverage(ig);
  const name = li.fullName || ig.fullName || p.instagramHandle;
  const ids = new Set(drafts.map((d) => d.localId));
  await logEvent({ personId: p.id, type: "analysis_started", payload: { evidenceItems: drafts.length } });
  try {
    const res = await withLlmSlot(config.llmConcurrency, () =>
      generateJson({
        kind: "profile",
        refId: p.id,
        model: config.profileModel,
        system: ANALYZER_SYSTEM,
        user: analyzerUserPrompt({ name, linkedinUrl: p.linkedinUrl, instagramUrl: p.instagramUrl, coverageLine: coverageLine(liCov, igCov), evidence: drafts }),
        schemaName: "profile",
        schema: analyzerJsonSchema,
        validate: (v) => validateProfile(v, ids),
        temperature: 0.4,
        maxTokens: 6000,
        maxAttempts: 3,
        deadlineMs: deadline,
        onUsage: logUsage,
      }),
    );
    const profile = res.data;
    const card = buildAgentCard(p.id, name, li.headline || ig.biography.split("\n")[0] || "", profile, drafts);
    const intro = buildPublicIntro(card, profile);
    const [{ v }] = await db
      .select({ v: dsql<number>`coalesce(max(${schema.profileVersions.version}), 0)` })
      .from(schema.profileVersions)
      .where(eq(schema.profileVersions.personId, p.id));
    const quality = liCov.substantive && igCov.substantive ? "two_source" : "limited";
    const [pv] = await db
      .insert(schema.profileVersions)
      .values({
        personId: p.id,
        version: Number(v) + 1,
        linkedinSnapshotId: liSnap.id,
        instagramSnapshotId: igSnap.id,
        profile,
        agentCard: card,
        publicIntro: intro,
        coverage: { linkedin: liCov, instagram: igCov, line: coverageLine(liCov, igCov), collectedAt: { linkedin: liSnap.fetchedAt, instagram: igSnap.fetchedAt } },
        quality,
        model: res.model,
        promptVersion: ANALYZER_PROMPT_VERSION,
      })
      .returning();
    await logEvent({ personId: p.id, type: "profile_ready", payload: { claims: profile.claims.length, quality, model: res.model } });
    return setStatus(p.id, "ready", null, { currentProfileId: pv.id, displayName: name });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await logEvent({ personId: p.id, type: "analysis_failed", payload: { error: msg } });
    const [{ n }] = await db
      .select({ n: dsql<number>`count(*)::int` })
      .from(schema.events)
      .where(and(eq(schema.events.personId, p.id), eq(schema.events.type, "analysis_failed")));
    if (Number(n) >= 3) return setStatus(p.id, "failed", `Analysis failed: ${msg}`);
    await setStatus(p.id, "analyzing", `Analysis attempt failed; will retry (${msg.slice(0, 120)})`);
    return "waiting";
  }
}

// ---------------- driver ----------------

export async function advancePerson(personId: string, opts: { deadline: number }): Promise<{ claimed: boolean; status?: string; error?: string }> {
  const p = await claimPerson(personId);
  if (!p) return { claimed: false };
  let status = p.status;
  try {
    for (let guard = 0; guard < 8 && !PERSON_TERMINAL.has(status) && Date.now() < opts.deadline - 4000; guard++) {
      const fresh = (await db.select().from(schema.people).where(eq(schema.people.id, personId)))[0];
      if (status === "submitted") {
        status = await setStatus(p.id, "collecting");
        await logEvent({ personId: p.id, type: "collection_started" });
      } else if (status === "collecting") {
        const r = await stepCollect(fresh, opts.deadline);
        if (r === "waiting") break;
        status = r;
      } else if (status === "verifying") {
        status = await stepVerify(fresh);
      } else if (status === "analyzing") {
        const r = await stepAnalyze(fresh, opts.deadline);
        if (r === "waiting") break;
        status = r;
      } else break;
    }
    return { claimed: true, status };
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : (e as Error).message;
    console.error("advancePerson error", personId, msg);
    await logEvent({ personId, type: "step_error", payload: { error: msg.slice(0, 300) } });
    return { claimed: true, status, error: msg };
  } finally {
    await db.update(schema.people).set({ leaseUntil: null }).where(eq(schema.people.id, personId));
  }
}

// Manual retry of a failed person: restart only the failed sources; keep successful work.
export async function retryPerson(personId: string) {
  const snaps = await latestSnapshots(personId);
  const failed = [snaps.linkedin, snaps.instagram].filter((s): s is Snapshot => !!s && s.status === "failed");
  if (failed.length) {
    await db.insert(schema.sourceSnapshots).values(failed.map((s) => ({ personId, platform: s.platform, provider: s.provider })));
  }
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, personId));
  const next = failed.length ? "collecting" : p.currentProfileId ? "ready" : "verifying";
  await setStatus(personId, next, null);
  await logEvent({ personId, type: "manual_retry", payload: { restarted: failed.map((s) => s.platform) } });
}

export async function unfinishedPeople(ids?: string[]) {
  const rows = await db
    .select({ id: schema.people.id, status: schema.people.status })
    .from(schema.people)
    .where(ids?.length ? inArray(schema.people.id, ids) : undefined);
  return rows.filter((r) => !PERSON_TERMINAL.has(r.status)).map((r) => r.id);
}
