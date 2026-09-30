import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Session } from "@/lib/session";

type Person = typeof schema.people.$inferSelect;
type Run = typeof schema.runs.$inferSelect;

// The published demo run (the finished example). Newest published demo wins.
export async function getDemoRun(): Promise<Run | null> {
  const [run] = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.kind, "demo"), eq(schema.runs.published, true)))
    .orderBy(desc(schema.runs.publishedAt))
    .limit(1);
  return run ?? null;
}

export async function publishedPersonIds(): Promise<Set<string>> {
  const rows = await db
    .select({ personId: schema.runMembers.personId })
    .from(schema.runMembers)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.runMembers.runId))
    .where(eq(schema.runs.published, true));
  return new Set(rows.map((r) => r.personId));
}

export async function canViewPerson(person: Person, session: Session | null): Promise<boolean> {
  if ((await publishedPersonIds()).has(person.id)) return true;
  if (!session) return false;
  if (person.createdBySession === session.id) return true;
  const [grant] = await db
    .select()
    .from(schema.sessionPeople)
    .where(and(eq(schema.sessionPeople.sessionId, session.id), eq(schema.sessionPeople.personId, person.id)));
  return Boolean(grant);
}

// Mutations on a person (advance, confirm identity, retry) require the submitting session.
export async function canDrivePerson(person: Person, session: Session | null): Promise<boolean> {
  if (!session || person.origin !== "visitor") return false;
  if (person.createdBySession === session.id) return true;
  const [grant] = await db
    .select()
    .from(schema.sessionPeople)
    .where(and(eq(schema.sessionPeople.sessionId, session.id), eq(schema.sessionPeople.personId, person.id)));
  return Boolean(grant);
}

export function canViewRun(run: Run, session: Session | null): boolean {
  if (run.published) return true;
  return Boolean(session && run.ownerSessionId === session.id);
}

export function canDriveRun(run: Run, session: Session | null): boolean {
  return Boolean(session && run.kind === "visitor" && run.ownerSessionId === session.id);
}

export async function runIdsContainingPerson(personId: string, runIds: string[]) {
  if (!runIds.length) return [];
  const rows = await db
    .select({ runId: schema.runMembers.runId })
    .from(schema.runMembers)
    .where(and(eq(schema.runMembers.personId, personId), inArray(schema.runMembers.runId, runIds)));
  return rows.map((r) => r.runId);
}
