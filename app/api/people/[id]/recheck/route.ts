import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canDrivePerson } from "@/lib/access";
import { getSession } from "@/lib/session";
import { recheckPerson } from "@/lib/jobs/person";

export const dynamic = "force-dynamic";

// "Check again": re-collect the source that blocked this profile (e.g. an Instagram made public since).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  if (!p || !(await canDrivePerson(p, await getSession()))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = await recheckPerson(id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });
  return NextResponse.json(res);
}
