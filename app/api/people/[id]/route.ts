import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canViewPerson } from "@/lib/access";
import { getSession } from "@/lib/session";
import { latestSnapshots } from "@/lib/jobs/person";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  if (!p || !(await canViewPerson(p, await getSession()))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const snaps = await latestSnapshots(id);
  const events = await db.select().from(schema.events).where(eq(schema.events.personId, id)).orderBy(desc(schema.events.id)).limit(12);
  const src = (s: typeof snaps.linkedin) => (s ? { status: s.status, coverage: s.coverage, error: s.error, fetchedAt: s.fetchedAt } : { status: "queued", coverage: null, error: null, fetchedAt: null });
  const identity = p.identity as { status?: string; signals?: { detail: string }[]; nameMatch?: string } | null;
  return NextResponse.json(
    {
      id: p.id,
      slug: p.slug,
      name: p.displayName,
      status: p.status,
      detail: p.statusDetail,
      linkedinUrl: p.linkedinUrl,
      instagramUrl: p.instagramUrl,
      sources: { linkedin: src(snaps.linkedin), instagram: src(snaps.instagram) },
      identity: identity ? { status: identity.status, nameMatch: identity.nameMatch, signals: identity.signals?.map((s) => s.detail) ?? [] } : null,
      ready: p.status === "ready" && Boolean(p.currentProfileId),
      events: events.map((e) => ({ type: e.type, at: e.createdAt, payload: e.payload })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
