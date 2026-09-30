import { NextResponse } from "next/server";
import { and, eq, gt, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createPerson } from "@/lib/people";
import { getOrCreateSession } from "@/lib/session";
import { publishedPersonIds } from "@/lib/access";
import { config } from "@/lib/config";
import { normalizeInstagram, normalizeLinkedIn } from "@/lib/sources/urls";
import { RECHECKABLE, recheckPerson } from "@/lib/jobs/person";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { linkedin?: unknown; instagram?: unknown } | null;
  const linkedin = typeof body?.linkedin === "string" ? body.linkedin.slice(0, 300) : "";
  const instagram = typeof body?.instagram === "string" ? body.instagram.slice(0, 300) : "";
  const li = normalizeLinkedIn(linkedin);
  if (!li.ok) return NextResponse.json({ error: li.error, field: "linkedin" }, { status: 400 });
  const ig = normalizeInstagram(instagram);
  if (!ig.ok) return NextResponse.json({ error: ig.error, field: "instagram" }, { status: 400 });

  const session = await getOrCreateSession();

  // Already analyzed pair? Reuse it (no duplicate paid work).
  const [existing] = await db
    .select()
    .from(schema.people)
    .where(and(eq(schema.people.linkedinUrl, li.canonical), eq(schema.people.instagramUrl, ig.canonical)));
  if (!existing) {
    // Persistent quotas (survive restarts): per session per hour, per IP per day, global per day.
    const hourAgo = new Date(Date.now() - 3600_000);
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [{ n: mine }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.people).where(and(eq(schema.people.createdBySession, session.id), gt(schema.people.createdAt, hourAgo)));
    if (mine >= config.quotas.analysesPerSessionHour) {
      return NextResponse.json({ error: `Quota reached: ${config.quotas.analysesPerSessionHour} new analyses per hour per visitor. Please try again later — or explore the finished demo meanwhile.` }, { status: 429 });
    }
    const [{ n: ipCount }] = await db
      .select({ n: dsql<number>`count(*)::int` })
      .from(schema.people)
      .innerJoin(schema.sessions, eq(schema.sessions.id, schema.people.createdBySession))
      .where(and(eq(schema.sessions.ipHash, session.ipHash ?? ""), gt(schema.people.createdAt, dayAgo)));
    if (ipCount >= config.quotas.analysesPerIpDay) return NextResponse.json({ error: "Daily limit reached for this network. Please try again tomorrow." }, { status: 429 });
    const [{ n: today }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.sourceSnapshots).where(gt(schema.sourceSnapshots.createdAt, dayAgo));
    if (today >= config.quotas.dailyScrapeCap * 2) return NextResponse.json({ error: "The site's daily scraping budget is used up. Please try again tomorrow." }, { status: 429 });
  }

  const res = await createPerson({ linkedin, instagram, origin: "visitor", sessionId: session.id, submissionKey: req.headers.get("idempotency-key") });
  if (!res.ok) return NextResponse.json({ error: res.error, field: res.field }, { status: 400 });
  const demoMember = (await publishedPersonIds()).has(res.personId);
  await db.insert(schema.sessionPeople).values({ sessionId: session.id, personId: res.personId }).onConflictDoNothing();
  // Resubmitting a pair that was blocked or failed (e.g. the Instagram was private and is now public)
  // re-collects the blocking source instead of returning the stale result.
  let recheck: { ok: boolean; error?: string } | null = null;
  if (existing && existing.origin === "visitor" && RECHECKABLE.has(existing.status)) {
    recheck = await recheckPerson(existing.id);
  }
  return NextResponse.json({ personId: res.personId, slug: res.slug, existing: res.existing, demoMember, recheck }, { status: 202 });
}
