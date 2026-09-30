import { randomBytes } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeInstagram, normalizeLinkedIn } from "@/lib/sources/urls";
import { logEvent } from "@/lib/jobs/log";

export type CreatePersonResult =
  | { ok: true; personId: string; slug: string; existing: boolean }
  | { ok: false; error: string; field?: "linkedin" | "instagram" };

function baseSlug(s: string) {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "person"
  );
}

export async function createPerson(args: {
  linkedin: string;
  instagram: string;
  origin: "seed" | "visitor";
  sessionId?: string | null;
  submissionKey?: string | null;
}): Promise<CreatePersonResult> {
  const li = normalizeLinkedIn(args.linkedin);
  if (!li.ok) return { ok: false, error: li.error, field: "linkedin" };
  const ig = normalizeInstagram(args.instagram);
  if (!ig.ok) return { ok: false, error: ig.error, field: "instagram" };

  // Deduplicate: the same account pair is analyzed once and reused.
  const [existing] = await db
    .select()
    .from(schema.people)
    .where(and(eq(schema.people.linkedinUrl, li.canonical), eq(schema.people.instagramUrl, ig.canonical)));
  if (existing) return { ok: true, personId: existing.id, slug: existing.slug, existing: true };

  let slug = args.origin === "visitor" ? `${baseSlug(ig.key)}-${randomBytes(3).toString("hex")}` : baseSlug(li.key);
  if (args.origin === "seed") {
    const taken = await db.select({ slug: schema.people.slug }).from(schema.people).where(like(schema.people.slug, `${slug}%`));
    if (taken.some((t) => t.slug === slug)) slug = `${slug}-${taken.length + 1}`;
  }
  const [row] = await db
    .insert(schema.people)
    .values({
      slug,
      linkedinUrl: li.canonical,
      instagramUrl: ig.canonical,
      linkedinSlug: li.key,
      instagramHandle: ig.key,
      origin: args.origin,
      createdBySession: args.sessionId ?? null,
      submissionKey: args.submissionKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const [again] = await db
      .select()
      .from(schema.people)
      .where(and(eq(schema.people.linkedinUrl, li.canonical), eq(schema.people.instagramUrl, ig.canonical)));
    return { ok: true, personId: again.id, slug: again.slug, existing: true };
  }
  await logEvent({ personId: row.id, type: "submitted", payload: { origin: args.origin } });
  return { ok: true, personId: row.id, slug: row.slug, existing: false };
}
