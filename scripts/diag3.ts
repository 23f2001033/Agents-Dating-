import "dotenv/config";
import { eq, asc, inArray } from "drizzle-orm";
import { db, schema, sql } from "../lib/db";
import { assessorUser, assessorSystem, type SavedTurn } from "../lib/agents/prompts";
import type { AgentCard, Profile, PublicIntro } from "../lib/analysis/profile";
async function main() {
  const id = process.argv[2];
  const [d] = await db.select().from(schema.dates).where(eq(schema.dates.id, id));
  const pvs = await db.select().from(schema.profileVersions).where(inArray(schema.profileVersions.id, [d.profileAId, d.profileBId]));
  const A = pvs.find((p) => p.id === d.profileAId)!, B = pvs.find((p) => p.id === d.profileBId)!;
  const rows = await db.select().from(schema.dateTurns).where(eq(schema.dateTurns.dateId, id)).orderBy(asc(schema.dateTurns.turnIndex));
  const turns: SavedTurn[] = rows.map((t) => { const side = t.actorPersonId === d.personAId ? "a" : "b"; return { turnIndex: t.turnIndex, speakerName: ((side === "a" ? A : B).agentCard as AgentCard).firstName, speakerSide: side, action: t.action, utterance: t.utterance, planTitle: t.planTitle, planDetails: t.planDetails }; });
  const u = assessorUser({ me: A.agentCard as AgentCard, myClaims: (A.profile as Profile).claims, other: B.publicIntro as PublicIntro, otherClaims: (B.profile as Profile).claims.filter((c) => c.basis === "observed"), turns });
  const s = assessorSystem(A.agentCard as AgentCard, B.publicIntro as PublicIntro);
  console.log("system chars:", s.length, "| user chars:", u.length, "| approx tokens:", Math.round((s.length + u.length) / 4));
  const i = u.indexOf("FULL TRANSCRIPT:");
  console.log(u.slice(i, i + 700));
  await sql.end();
}
main();
