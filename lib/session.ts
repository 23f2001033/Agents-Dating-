import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Anonymous visitor sessions: an opaque random token in a Secure, HttpOnly, SameSite cookie.
// Only a salted hash of the token is stored, so a database read never yields a usable session.
const COOKIE = "ss_session";
const TTL_DAYS = 7;

export type Session = typeof schema.sessions.$inferSelect;

function hash(value: string) {
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? "dev-secret"}:${value}`).digest("hex");
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return hash(`ip:${ip}`);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [s] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, hash(token)), gt(schema.sessions.expiresAt, new Date())));
  return s ?? null;
}

// Route handlers only (cookies can be set there, not during Server Component rendering).
export async function getOrCreateSession(): Promise<Session> {
  const existing = await getSession();
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url");
  const [s] = await db
    .insert(schema.sessions)
    .values({ tokenHash: hash(token), ipHash: await clientIpHash(), expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000) })
    .returning();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_DAYS * 86_400,
  });
  return s;
}

export function isAdmin(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  const given = req.headers.get("x-admin-secret");
  return Boolean(secret && given && given.length === secret.length && createHash("sha256").update(given).digest("hex") === createHash("sha256").update(secret).digest("hex"));
}
