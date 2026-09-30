import { and, asc, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, schema, sql } from "@/lib/db";
import { config } from "@/lib/config";
import type { AgentCard, Profile, PublicIntro } from "@/lib/analysis/profile";
import {
  actorJsonSchema,
  actorSystem,
  actorUser,
  assessorJsonSchema,
  assessorSystem,
  assessorUser,
  DATE_PROMPT_VERSION,
  validateActor,
  validateAssessment,
  type SavedTurn,
} from "@/lib/agents/prompts";
import { SCENARIO_VERSION, TURNS_PER_DATE, firstSpeakerFor, turnPlan } from "@/lib/agents/scenario";
import { computeScore } from "@/lib/ranking/score";
import { generateJson, withLlmSlot } from "@/lib/llm/client";
import { logEvent, logUsage } from "./log";

type DateRow = typeof schema.dates.$inferSelect;
type ProfileRow = typeof schema.profileVersions.$inferSelect;

export const DATE_OPEN = ["queued", "running", "assessing", "retrying"];

// ---------------- run creation ----------------

export async function createRun(args: {
  kind: "demo" | "visitor";
  slug: string;
  title: string;
  members: { personId: string; profileVersionId: string }[];
  pairs: [number, number][]; // indexes into members; unordered
  firstSpeaker: (i: number, j: number) => "a" | "b"; // relative to (members[i], members[j])
  ownerSessionId?: string | null;
  focusPersonId?: string | null;
  baseRunId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(schema.runs)
      .values({
        slug: args.slug,
        kind: args.kind,
        title: args.title,
        ownerSessionId: args.ownerSessionId ?? null,
        focusPersonId: args.focusPersonId ?? null,
        baseRunId: args.baseRunId ?? null,
        status: "running",
        expectedPairs: args.pairs.length,
        scenarioVersion: SCENARIO_VERSION,
      })
      .returning();
    await tx.insert(schema.runMembers).values(args.members.map((m, i) => ({ runId: run.id, personId: m.personId, profileVersionId: m.profileVersionId, position: i })));
    const rows = args.pairs.map(([i, j]) => {
      // Normalize the unordered pair so (a, b) is stable: a has the smaller person id.
      const [ai, bi] = args.members[i].personId < args.members[j].personId ? [i, j] : [j, i];
      const fs = args.firstSpeaker(i, j); // relative to (i, j)
      const firstIsI = fs === "a";
      const firstPos = firstIsI ? i : j;
      return {
        runId: run.id,
        personAId: args.members[ai].personId,
        personBId: args.members[bi].personId,
        profileAId: args.members[ai].profileVersionId,
        profileBId: args.members[bi].profileVersionId,
        firstSpeaker: (firstPos === ai ? "a" : "b") as "a" | "b",
        scenarioVersion: SCENARIO_VERSION,
        promptVersion: DATE_PROMPT_VERSION,
      };
    });
    for (let k = 0; k < rows.length; k += 100) await tx.insert(schema.dates).values(rows.slice(k, k + 100));
    return run;
  });
}

export function allPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

export async function createCohortRun(slug: string, title: string, members: { personId: string; profileVersionId: string }[]) {
  const n = members.length;
  return createRun({ kind: "demo", slug, title, members, pairs: allPairs(n), firstSpeaker: (i, j) => firstSpeakerFor(i, j, n) });
}

// ---------------- date execution ----------------

type Side = { card: AgentCard; intro: PublicIntro; profile: Profile; personId: string };

async function loadSides(d: DateRow): Promise<{ a: Side; b: Side }> {
  const rows = await db.select().from(schema.profileVersions).where(inArray(schema.profileVersions.id, [d.profileAId, d.profileBId]));
  const byId = new Map(rows.map((r: ProfileRow) => [r.id, r]));
  const mk = (id: string, personId: string): Side => {
    const r = byId.get(id);
    if (!r) throw new Error(`profile version ${id} missing`);
    return { card: r.agentCard as AgentCard, intro: r.publicIntro as PublicIntro, profile: r.profile as Profile, personId };
  };
  return { a: mk(d.profileAId, d.personAId), b: mk(d.profileBId, d.personBId) };
}

async function loadTurns(dateId: string, sides: { a: Side; b: Side }): Promise<SavedTurn[]> {
  const rows = await db.select().from(schema.dateTurns).where(eq(schema.dateTurns.dateId, dateId)).orderBy(asc(schema.dateTurns.turnIndex));
  return rows.map((t) => {
    const side = t.actorPersonId === sides.a.personId ? "a" : "b";
    return { turnIndex: t.turnIndex, speakerName: sides[side].card.firstName, speakerSide: side, action: t.action, utterance: t.utterance, planTitle: t.planTitle, planDetails: t.planDetails };
  });
}

async function setDate(id: string, patch: Partial<DateRow>) {
  await db.update(schema.dates).set({ ...patch, updatedAt: new Date() }).where(eq(schema.dates.id, id));
}

export async function advanceDate(dateId: string, opts: { deadline: number; concurrency?: number }): Promise<string> {
  const [d] = await db.select().from(schema.dates).where(eq(schema.dates.id, dateId));
  if (!d || d.status === "completed" || d.status === "failed") return d?.status ?? "missing";
  const sides = await loadSides(d);
  const plan = turnPlan(d.firstSpeaker as "a" | "b");
  const limit = opts.concurrency ?? config.llmConcurrency;
  let turns = await loadTurns(dateId, sides);

  // Resume the next missing turn. A persisted turn is never regenerated.
  while (turns.length < TURNS_PER_DATE) {
    if (Date.now() > opts.deadline - 6000) return "running";
    const slot = plan[turns.length];
    const me = sides[slot.speaker];
    const other = sides[slot.speaker === "a" ? "b" : "a"];
    const own = new Set(me.card.evidence.map((e) => e.id));
    const claimEvidence = new Map(me.profile.claims.map((c) => [c.id, c.evidence] as const));
    const res = await withLlmSlot(limit, () =>
      generateJson({
        kind: "turn",
        refId: `${dateId}:${slot.index}`,
        model: config.dateModel,
        system: actorSystem(me.card, other.intro),
        user: actorUser({ slot, me: me.card, other: other.intro, turns }),
        schemaName: "turn",
        schema: actorJsonSchema,
        validate: (v) => validateActor(v, own, claimEvidence),
        temperature: 0.9,
        maxTokens: 1200,
        maxAttempts: 3,
        deadlineMs: opts.deadline,
        onUsage: logUsage,
      }),
    );
    const o = res.data;
    const inserted = await db
      .insert(schema.dateTurns)
      .values({
        dateId,
        turnIndex: slot.index,
        actorPersonId: me.personId,
        act: slot.act,
        action: o.action,
        utterance: o.utterance,
        evidenceIds: o.evidenceIds,
        reactingTo: o.reactingTo || null,
        planTitle: o.planTitle,
        planDetails: o.planDetails,
        explanation: o.explanation,
        model: res.model,
        latencyMs: res.latencyMs,
      })
      .onConflictDoNothing()
      .returning({ id: schema.dateTurns.id });
    if (inserted.length) {
      await logEvent({ runId: d.runId, dateId, type: "turn", payload: { turnIndex: slot.index, speaker: me.card.firstName, action: o.action, plan: o.planTitle } });
    }
    turns = await loadTurns(dateId, sides);
  }

  if (d.status !== "assessing") await setDate(dateId, { status: "assessing" });

  // Two private assessments, generated independently (neither sees the other's).
  const existing = await db.select().from(schema.assessments).where(eq(schema.assessments.dateId, dateId));
  const done = new Set(existing.map((x) => x.evaluatorId));
  const todo = (["a", "b"] as const).filter((k) => !done.has(sides[k].personId));
  if (Date.now() > opts.deadline - 8000 && todo.length) return "assessing";
  await Promise.all(
    todo.map(async (k) => {
      const me = sides[k];
      const other = sides[k === "a" ? "b" : "a"];
      const otherObserved = other.profile.claims.filter((c) => c.basis === "observed");
      const allowed = new Set<string>([...me.profile.claims.map((c) => `S-${c.id}`), ...otherObserved.map((c) => `O-${c.id}`), ...turns.map((t) => `T${t.turnIndex + 1}`)]);
      const res = await withLlmSlot(limit, () =>
        generateJson({
          kind: "assessment",
          refId: `${dateId}:${me.personId}`,
          model: config.dateModel,
          system: assessorSystem(me.card, other.intro),
          user: assessorUser({ me: me.card, myClaims: me.profile.claims, other: other.intro, otherClaims: otherObserved, turns }),
          schemaName: "assessment",
          schema: assessorJsonSchema,
          validate: (v) => validateAssessment(v, allowed),
          temperature: 0.3,
          maxTokens: 1600,
          maxAttempts: 3,
          deadlineMs: opts.deadline,
          onUsage: logUsage,
        }),
      );
      const a = res.data;
      const ratings = Object.fromEntries(Object.entries(a.dimensions).map(([key, dim]) => [key, dim.rating])) as Parameters<typeof computeScore>[0];
      const score = computeScore(ratings);
      await db
        .insert(schema.assessments)
        .values({
          dateId,
          runId: d.runId,
          evaluatorId: me.personId,
          counterpartId: other.personId,
          dimensions: a.dimensions,
          summary: a.summary,
          strongestConnection: a.strongestConnection,
          concern: a.concern,
          secondDate: a.secondDate,
          score: score.score,
          raw: score.raw,
          coverage: score.coverage,
          model: res.model,
        })
        .onConflictDoNothing();
    }),
  );
  const after = await db.select({ id: schema.assessments.id, score: schema.assessments.score, evaluatorId: schema.assessments.evaluatorId }).from(schema.assessments).where(eq(schema.assessments.dateId, dateId));
  if (after.length >= 2) {
    await setDate(dateId, { status: "completed", completedAt: new Date(), error: null });
    const sa = after.find((x) => x.evaluatorId === sides.a.personId)?.score ?? null;
    const sb = after.find((x) => x.evaluatorId === sides.b.personId)?.score ?? null;
    await logEvent({ runId: d.runId, dateId, type: "date_completed", payload: { a: sides.a.card.firstName, b: sides.b.card.firstName, aToB: sa, bToA: sb } });
    return "completed";
  }
  return "assessing";
}

// ---------------- run driver ----------------

export async function claimDates(runId: string, max: number, leaseSecs: number): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    update dates set lease_until = now() + make_interval(secs => ${leaseSecs}),
      status = case when status in ('queued','retrying') then 'running' else status end,
      started_at = coalesce(started_at, now()), updated_at = now()
    where id in (
      select id from dates
      where run_id = ${runId} and status in ('queued','running','assessing','retrying')
        and (lease_until is null or lease_until < now())
      order by created_at, id
      limit ${max}
      for update skip locked)
    returning id`;
  return rows.map((r) => r.id);
}

export async function advanceRun(runId: string, opts: { deadline: number; maxDates?: number; concurrency?: number; leaseSecs?: number }) {
  const leaseSecs = opts.leaseSecs ?? Math.ceil((opts.deadline - Date.now()) / 1000) + 90;
  const ids = await claimDates(runId, opts.maxDates ?? 25, leaseSecs);
  await Promise.all(
    ids.map(async (id) => {
      try {
        await advanceDate(id, { deadline: opts.deadline, concurrency: opts.concurrency });
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        const [d] = await db.select({ attempts: schema.dates.attempts }).from(schema.dates).where(eq(schema.dates.id, id));
        const attempts = (d?.attempts ?? 0) + 1;
        // Deadline/rate-limit exhaustion is not a failure of the date itself.
        const transient = /deadline|rate limited/i.test(msg);
        const failed = !transient && attempts >= 3;
        await setDate(id, { status: failed ? "failed" : "retrying", error: msg, attempts: transient ? attempts - 1 : attempts });
        await logEvent({ runId, dateId: id, type: failed ? "date_failed" : "date_retrying", payload: { error: msg } });
      } finally {
        await db.update(schema.dates).set({ leaseUntil: null }).where(eq(schema.dates.id, id));
      }
    }),
  );
  return refreshRunStatus(runId);
}

export async function runCounts(runId: string) {
  const [c] = await sql<{ total: number; completed: number; failed: number; open: number; turns: number; assessments: number }[]>`
    select
      (select count(*)::int from dates where run_id = ${runId}) as total,
      (select count(*)::int from dates where run_id = ${runId} and status = 'completed') as completed,
      (select count(*)::int from dates where run_id = ${runId} and status = 'failed') as failed,
      (select count(*)::int from dates where run_id = ${runId} and status in ('queued','running','assessing','retrying')) as open,
      (select count(*)::int from date_turns t join dates d on d.id = t.date_id where d.run_id = ${runId}) as turns,
      (select count(*)::int from assessments where run_id = ${runId}) as assessments`;
  return c;
}

export async function refreshRunStatus(runId: string) {
  const c = await runCounts(runId);
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  let status = run.status;
  if (c.open === 0 && c.failed === 0 && c.completed === c.total) status = "completed";
  else if (c.open === 0 && c.failed > 0) status = "partial";
  else status = "running";
  if (status !== run.status) {
    await db.update(schema.runs).set({ status, completedAt: status === "completed" ? new Date() : null }).where(eq(schema.runs.id, runId));
    await logEvent({ runId, type: `run_${status}`, payload: c });
  }
  return { status, ...c };
}

export async function retryDate(dateId: string) {
  await db.update(schema.dates).set({ status: "queued", attempts: 0, error: null, leaseUntil: null, updatedAt: new Date() }).where(and(eq(schema.dates.id, dateId), eq(schema.dates.status, "failed")));
  const [d] = await db.select().from(schema.dates).where(eq(schema.dates.id, dateId));
  if (d) {
    await db.update(schema.runs).set({ status: "running" }).where(eq(schema.runs.id, d.runId));
    await logEvent({ runId: d.runId, dateId, type: "date_manual_retry" });
  }
}

export async function openRunIds(kind?: string) {
  const rows = await db.select({ id: schema.runs.id, kind: schema.runs.kind }).from(schema.runs).where(inArray(schema.runs.status, ["running", "partial"]));
  return rows.filter((r) => !kind || r.kind === kind).map((r) => r.id);
}

export { dsql };
