import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canDrivePerson } from "@/lib/access";
import { getSession } from "@/lib/session";
import { retryPerson } from "@/lib/jobs/person";

export const dynamic = "force-dynamic";

// Bounded manual retry: restarts only failed sources/steps and keeps successful work.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  if (!p || !(await canDrivePerson(p, await getSession()))) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.status !== "failed") return NextResponse.json({ error: "Only failed analyses can be retried." }, { status: 409 });
  await retryPerson(id);
  return NextResponse.json({ ok: true });
}
