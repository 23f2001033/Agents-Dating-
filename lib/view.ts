import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db, schema, sql } from "@/lib/db";
import type { AgentCard, Profile, PublicIntro } from "@/lib/analysis/profile";
import type { IdentityResult } from "@/lib/sources/identity";
import { rankFor, type RankedRow } from "@/lib/ranking/score";

export type Person = typeof schema.people.$inferSelect;
export type ProfileVersion = typeof schema.profileVersions.$inferSelect;
export type EvidenceRow = typeof schema.evidence.$inferSelect;
export type Assessment = typeof schema.assessments.$inferSelect;
export type Turn = typeof schema.dateTurns.$inferSelect;
export type Run = typeof schema.runs.$inferSelect;

export type Coverage = {
  line: string;
  linkedin: { headline: boolean; about: boolean; aboutChars: number; experienceCount: number; educationCount: number; extraSections: string[]; substantive: boolean };
  instagram: { bio: boolean; captionsAuthored: number; excludedNotAuthored: number; postsReturned: number; substantive: boolean };
  collectedAt?: { linkedin?: string; instagram?: string };
};

export type DirectoryCard = {
  personId: string;
  slug: string;
  name: string;
  oneLiner: string;
  interests: string[];
  linkedinUrl: string;
  instagramUrl: string;
  quality: string;
  identity: string;
  claims: number;
};

export async function loadDirectory(runId: string): Promise<DirectoryCard[]> {
  const rows = await db
    .select({ m: schema.runMembers, p: schema.people, pv: schema.profileVersions })
    .from(schema.runMembers)
    .innerJoin(schema.people, eq(schema.people.id, schema.runMembers.personId))
    .innerJoin(schema.profileVersions, eq(schema.profileVersions.id, schema.runMembers.profileVersionId))
    .where(eq(schema.runMembers.runId, runId))
    .orderBy(asc(schema.people.displayName));
  return rows.map(({ p, pv }) => {
    const profile = pv.profile as Profile;
    return {
      personId: p.id,
      slug: p.slug,
      name: p.displayName ?? p.slug,
      oneLiner: profile.oneLiner,
      interests: profile.claims.filter((c) => (c.category === "interest" || c.category === "hobby") && c.basis === "observed").slice(0, 3).map((c) => shortLabel(c.text)),
      linkedinUrl: p.linkedinUrl,
      instagramUrl: p.instagramUrl,
      quality: pv.quality,
      identity: (p.identity as IdentityResult | null)?.status ?? "unknown",
      claims: profile.claims.length,
    };
  });
}

// Turn a claim sentence into a short chip label ("Runs long distances on Sundays" → first ~5 words).
export function shortLabel(text: string): string {
  const t = text.replace(/^(has|is|was|actively|professionally|regularly|frequently|often|enjoys|loves|likes)\s+/i, "").replace(/[.;:]$/, "");
  const words = t.split(/\s+/);
  return words.length <= 6 ? t : words.slice(0, 6).join(" ") + "…";
}

export async function loadPersonBySlug(slug: string) {
  const [person] = await db.select().from(schema.people).where(eq(schema.people.slug, slug));
  return person ?? null;
}

export async function loadProfileVersion(id: string | null | undefined) {
  if (!id) return null;
  const [pv] = await db.select().from(schema.profileVersions).where(eq(schema.profileVersions.id, id));
  return pv ?? null;
}

export async function loadEvidenceForProfile(pv: ProfileVersion): Promise<EvidenceRow[]> {
  return db
    .select()
    .from(schema.evidence)
    .where(inArray(schema.evidence.snapshotId, [pv.linkedinSnapshotId, pv.instagramSnapshotId]))
    .orderBy(asc(schema.evidence.platform), asc(schema.evidence.collectedAt));
}

export type PublicEvidence = {
  id: string;
  platform: string;
  field: string;
  label: string;
  excerpt: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
};

export function toPublicEvidence(rows: EvidenceRow[]): Record<string, PublicEvidence> {
  const out: Record<string, PublicEvidence> = {};
  for (const e of rows) {
    out[e.localId] = {
      id: e.localId,
      platform: e.platform,
      field: e.field,
      label: e.label,
      excerpt: e.excerpt,
      url: e.url,
      publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
      collectedAt: e.collectedAt.toISOString(),
    };
  }
  return out;
}

export type DateListItem = {
  dateId: string;
  counterpartId: string;
  counterpartSlug: string;
  counterpartName: string;
  status: string;
  forward: number | null;
  reverse: number | null;
};

export async function loadPersonDates(personId: string, runId: string): Promise<DateListItem[]> {
  const rows = await db
    .select()
    .from(schema.dates)
    .where(and(eq(schema.dates.runId, runId), or(eq(schema.dates.personAId, personId), eq(schema.dates.personBId, personId))));
  if (!rows.length) return [];
  const others = rows.map((d) => (d.personAId === personId ? d.personBId : d.personAId));
  const people = await db.select().from(schema.people).where(inArray(schema.people.id, others));
  const byId = new Map(people.map((p) => [p.id, p]));
  const as = await db.select().from(schema.assessments).where(inArray(schema.assessments.dateId, rows.map((d) => d.id)));
  return rows
    .map((d) => {
      const other = d.personAId === personId ? d.personBId : d.personAId;
      const p = byId.get(other)!;
      return {
        dateId: d.id,
        counterpartId: other,
        counterpartSlug: p.slug,
        counterpartName: p.displayName ?? p.slug,
        status: d.status,
        forward: as.find((a) => a.dateId === d.id && a.evaluatorId === personId)?.score ?? null,
        reverse: as.find((a) => a.dateId === d.id && a.evaluatorId === other)?.score ?? null,
      };
    })
    .sort((x, y) => (y.forward ?? -1) - (x.forward ?? -1));
}

export type DateSide = {
  person: Person;
  pv: ProfileVersion;
  card: AgentCard;
  intro: PublicIntro;
  profile: Profile;
  evidence: Record<string, PublicEvidence>;
};

export async function loadDate(dateId: string) {
  const [d] = await db.select().from(schema.dates).where(eq(schema.dates.id, dateId));
  if (!d) return null;
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, d.runId));
  const people = await db.select().from(schema.people).where(inArray(schema.people.id, [d.personAId, d.personBId]));
  const pvs = await db.select().from(schema.profileVersions).where(inArray(schema.profileVersions.id, [d.profileAId, d.profileBId]));
  const mk = async (personId: string, pvId: string): Promise<DateSide> => {
    const pv = pvs.find((x) => x.id === pvId)!;
    return {
      person: people.find((p) => p.id === personId)!,
      pv,
      card: pv.agentCard as AgentCard,
      intro: pv.publicIntro as PublicIntro,
      profile: pv.profile as Profile,
      evidence: toPublicEvidence(await loadEvidenceForProfile(pv)),
    };
  };
  const [a, b] = await Promise.all([mk(d.personAId, d.profileAId), mk(d.personBId, d.profileBId)]);
  const turns = await db.select().from(schema.dateTurns).where(eq(schema.dateTurns.dateId, dateId)).orderBy(asc(schema.dateTurns.turnIndex));
  const assessments = await db.select().from(schema.assessments).where(eq(schema.assessments.dateId, dateId));
  return { date: d, run, a, b, turns, assessments };
}

export type RankingRow = RankedRow & {
  counterpartSlug: string;
  counterpartName: string;
  counterpartOneLiner: string;
  forwardAssessment: Assessment | null;
  reverseAssessment: Assessment | null;
};

export async function loadRanking(runId: string, personId: string) {
  const dates = await db
    .select()
    .from(schema.dates)
    .where(and(eq(schema.dates.runId, runId), or(eq(schema.dates.personAId, personId), eq(schema.dates.personBId, personId))));
  const ids = dates.map((d) => d.id);
  const as = ids.length ? await db.select().from(schema.assessments).where(inArray(schema.assessments.dateId, ids)) : [];
  const others = dates.map((d) => (d.personAId === personId ? d.personBId : d.personAId));
  const people = others.length ? await db.select().from(schema.people).where(inArray(schema.people.id, others)) : [];
  const members = await db.select().from(schema.runMembers).where(eq(schema.runMembers.runId, runId));
  const pvs = members.length ? await db.select().from(schema.profileVersions).where(inArray(schema.profileVersions.id, members.map((m) => m.profileVersionId))) : [];
  const oneLinerOf = (pid: string) => {
    const m = members.find((x) => x.personId === pid);
    const pv = pvs.find((x) => x.id === m?.profileVersionId);
    return (pv?.profile as Profile | undefined)?.oneLiner ?? "";
  };
  const inputs = dates.map((d) => {
    const other = d.personAId === personId ? d.personBId : d.personAId;
    const f = as.find((a) => a.dateId === d.id && a.evaluatorId === personId) ?? null;
    const r = as.find((a) => a.dateId === d.id && a.evaluatorId === other) ?? null;
    return {
      counterpartId: other,
      dateId: d.id,
      status: d.status,
      forward: f ? { score: f.score, coverage: f.coverage } : null,
      reverse: r ? { score: r.score, coverage: r.coverage } : null,
    };
  });
  const { ranked, unranked } = rankFor(inputs);
  const decorate = (row: RankedRow): RankingRow => {
    const p = people.find((x) => x.id === row.counterpartId)!;
    return {
      ...row,
      counterpartSlug: p.slug,
      counterpartName: p.displayName ?? p.slug,
      counterpartOneLiner: oneLinerOf(p.id),
      forwardAssessment: as.find((a) => a.dateId === row.dateId && a.evaluatorId === personId) ?? null,
      reverseAssessment: as.find((a) => a.dateId === row.dateId && a.evaluatorId === row.counterpartId) ?? null,
    };
  };
  return {
    ranked: ranked.map(decorate),
    unranked: unranked.map(decorate),
    total: dates.length,
    completed: dates.filter((d) => d.status === "completed").length,
  };
}

export async function runMembersList(runId: string) {
  return db
    .select({ id: schema.people.id, slug: schema.people.slug, name: schema.people.displayName, position: schema.runMembers.position })
    .from(schema.runMembers)
    .innerJoin(schema.people, eq(schema.people.id, schema.runMembers.personId))
    .where(eq(schema.runMembers.runId, runId))
    .orderBy(asc(schema.people.displayName));
}

export async function runStats(runId: string) {
  const [c] = await sql<{ people: number; dates: number; completed: number; turns: number; assessments: number }[]>`
    select (select count(*)::int from run_members where run_id = ${runId}) as people,
           (select count(*)::int from dates where run_id = ${runId}) as dates,
           (select count(*)::int from dates where run_id = ${runId} and status = 'completed') as completed,
           (select count(*)::int from date_turns t join dates d on d.id = t.date_id where d.run_id = ${runId}) as turns,
           (select count(*)::int from assessments where run_id = ${runId}) as assessments`;
  return c;
}
