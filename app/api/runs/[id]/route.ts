import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canViewRun } from "@/lib/access";
import { getSession } from "@/lib/session";
import { runCounts } from "@/lib/jobs/run";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, id));
  if (!run || !canViewRun(run, await getSession())) return NextResponse.json({ error: "not found" }, { status: 404 });
  const counts = await runCounts(id);
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const events = await db.select().from(schema.events).where(eq(schema.events.runId, id)).orderBy(desc(schema.events.id)).limit(20);
  const dates = await db.select().from(schema.dates).where(eq(schema.dates.runId, id));
  const ids = [...new Set(dates.flatMap((d) => [d.personAId, d.personBId]))];
  const people = ids.length ? await db.select({ id: schema.people.id, name: schema.people.displayName, slug: schema.people.slug }).from(schema.people).where(inArray(schema.people.id, ids)) : [];
  const turns = dates.length
    ? await db.select({ dateId: schema.dateTurns.dateId }).from(schema.dateTurns).where(inArray(schema.dateTurns.dateId, dates.map((d) => d.id)))
    : [];
  const as = dates.length ? await db.select().from(schema.assessments).where(inArray(schema.assessments.dateId, dates.map((d) => d.id))) : [];
  const focus = run.focusPersonId;
  return NextResponse.json(
    {
      id: run.id,
      slug: run.slug,
      status: run.status,
      counts,
      dates: dates.map((d) => {
        const other = d.personAId === focus ? d.personBId : d.personAId;
        return {
          id: d.id,
          status: d.status,
          counterpart: people.find((p) => p.id === other)?.name ?? "",
          turns: turns.filter((t) => t.dateId === d.id).length,
          forward: as.find((a) => a.dateId === d.id && a.evaluatorId === focus)?.score ?? null,
          reverse: as.find((a) => a.dateId === d.id && a.evaluatorId === other)?.score ?? null,
        };
      }),
      events: events.filter((e) => e.id > after).map((e) => ({ id: e.id, type: e.type, payload: e.payload, at: e.createdAt })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
