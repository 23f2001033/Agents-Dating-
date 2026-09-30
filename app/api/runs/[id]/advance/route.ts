import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canDriveRun } from "@/lib/access";
import { getSession } from "@/lib/session";
import { advanceRun } from "@/lib/jobs/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Serverless worker tick for a visitor run: claims open dates with leases and resumes each
// from its next missing turn. Safe to call repeatedly or concurrently; progress is persisted per turn.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, id));
  if (!run || !canDriveRun(run, await getSession())) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (run.status === "completed") return NextResponse.json({ status: "completed" });
  const res = await advanceRun(id, { deadline: Date.now() + 250_000, maxDates: 25, concurrency: 12, leaseSecs: 290 });
  return NextResponse.json(res);
}
