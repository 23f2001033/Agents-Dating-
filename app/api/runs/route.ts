import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq, gt, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canViewPerson, getDemoRun } from "@/lib/access";
import { getOrCreateSession } from "@/lib/session";
import { createRun } from "@/lib/jobs/run";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Create (or reuse) the visitor's isolated comparison run: their agent × every published demo agent.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { personId?: string } | null;
  const personId = typeof body?.personId === "string" ? body.personId : "";
  if (!/^[0-9a-f-]{36}$/.test(personId)) return NextResponse.json({ error: "Missing person." }, { status: 400 });
  const session = await getOrCreateSession();
  const [person] = await db.select().from(schema.people).where(eq(schema.people.id, personId));
  if (!person || !(await canViewPerson(person, session))) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (person.status !== "ready" || !person.currentProfileId) return NextResponse.json({ error: "This profile is not ready yet." }, { status: 409 });
  const demo = await getDemoRun();
  if (!demo) return NextResponse.json({ error: "The demo cohort is not published yet." }, { status: 409 });

  // Idempotent: one comparison run per session and person.
  const [existing] = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.ownerSessionId, session.id), eq(schema.runs.focusPersonId, personId), eq(schema.runs.baseRunId, demo.id)));
  if (existing) return NextResponse.json({ runId: existing.id, slug: existing.slug, existing: true });

  const hourAgo = new Date(Date.now() - 3600_000);
  const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.runs).where(and(eq(schema.runs.ownerSessionId, session.id), gt(schema.runs.createdAt, hourAgo)));
  if (n >= config.quotas.runsPerSessionHour) return NextResponse.json({ error: `Quota reached: ${config.quotas.runsPerSessionHour} dating runs per hour per visitor.` }, { status: 429 });
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [{ calls }] = await db.select({ calls: dsql<number>`count(*)::int` }).from(schema.llmUsage).where(gt(schema.llmUsage.createdAt, dayAgo));
  if (calls >= config.quotas.dailyLlmCallCap) return NextResponse.json({ error: "The site's daily model budget is used up. Please try again tomorrow." }, { status: 429 });

  // Freeze the demo's pinned profile versions; exclude self if this person is already in the demo.
  const members = await db.select().from(schema.runMembers).where(eq(schema.runMembers.runId, demo.id));
  const others = members.filter((m) => m.personId !== personId).sort((a, b) => a.position - b.position);
  const list = [{ personId, profileVersionId: person.currentProfileId }, ...others.map((m) => ({ personId: m.personId, profileVersionId: m.profileVersionId }))];
  const run = await createRun({
    kind: "visitor",
    slug: `visit-${randomBytes(5).toString("hex")}`,
    title: `${person.displayName ?? "Your agent"} × the ${others.length} demo agents`,
    members: list,
    pairs: others.map((_, j) => [0, j + 1] as [number, number]),
    firstSpeaker: (_i, j) => (j % 2 === 0 ? "a" : "b"), // alternate who opens, so the visitor opens about half
    ownerSessionId: session.id,
    focusPersonId: personId,
    baseRunId: demo.id,
  });
  return NextResponse.json({ runId: run.id, slug: run.slug, existing: false }, { status: 201 });
}
