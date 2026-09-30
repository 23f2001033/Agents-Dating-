import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canDrivePerson } from "@/lib/access";
import { getSession } from "@/lib/session";
import { logEvent } from "@/lib/jobs/log";

export const dynamic = "force-dynamic";

// The submitter confirms both accounts are theirs. The profile is then labeled
// "Submitter-confirmed" — never shown as a verified identity match.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  if (!p || !(await canDrivePerson(p, await getSession()))) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.status !== "blocked_identity") return NextResponse.json({ error: "Nothing to confirm." }, { status: 409 });
  await db.update(schema.people).set({ identityAttested: true, status: "verifying", statusDetail: null, updatedAt: new Date() }).where(eq(schema.people.id, id));
  await logEvent({ personId: id, type: "identity_attested_by_submitter" });
  return NextResponse.json({ ok: true });
}
