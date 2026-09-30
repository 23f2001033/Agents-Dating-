import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema, sql } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// Protected: publish a demo run only if the completeness audit passes.
export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { runId } = await params;
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [a] = await sql<{ members: number; dates: number; completed: number; turns: number; assessments: number; per_person_min: number; per_person_max: number }[]>`
    select (select count(*)::int from run_members where run_id = ${runId}) members,
           (select count(*)::int from dates where run_id = ${runId}) dates,
           (select count(*)::int from dates where run_id = ${runId} and status = 'completed') completed,
           (select count(*)::int from date_turns t join dates d on d.id = t.date_id where d.run_id = ${runId}) turns,
           (select count(*)::int from assessments where run_id = ${runId}) assessments,
           (select min(c)::int from (select count(*) c from assessments where run_id = ${runId} group by evaluator_id) x) per_person_min,
           (select max(c)::int from (select count(*) c from assessments where run_id = ${runId} group by evaluator_id) x) per_person_max`;
  const n = a.members;
  const expected = (n * (n - 1)) / 2;
  const ok = a.dates === expected && a.completed === expected && a.turns === expected * 6 && a.assessments === expected * 2 && a.per_person_min === n - 1 && a.per_person_max === n - 1;
  if (!ok) return NextResponse.json({ error: "audit failed", audit: a, expected }, { status: 409 });
  await db.update(schema.runs).set({ published: true, publishedAt: new Date(), status: "completed" }).where(eq(schema.runs.id, runId));
  return NextResponse.json({ published: true, audit: a });
}
