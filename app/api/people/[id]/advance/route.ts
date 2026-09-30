import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canDrivePerson } from "@/lib/access";
import { getSession } from "@/lib/session";
import { advancePerson } from "@/lib/jobs/person";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Serverless "worker tick": performs bounded, persisted work for this person and returns.
// Leases prevent two ticks from doing the same step; every step is saved before the next begins.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  if (!p || !(await canDrivePerson(p, await getSession()))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = await advancePerson(id, { deadline: Date.now() + 270_000 });
  return NextResponse.json(res);
}
