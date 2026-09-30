import type { RoomData, RoomSide } from "@/components/date-room";
import { SCENARIO } from "@/lib/agents/scenario";
import { loadDate, shortLabel, type DateSide } from "@/lib/view";

export async function roomData(dateId: string): Promise<{ data: RoomData; runId: string; runPublished: boolean; ownerSessionId: string | null } | null> {
  const loaded = await loadDate(dateId);
  if (!loaded) return null;
  const { date, run, a, b, turns, assessments } = loaded;
  const side = (key: "a" | "b", s: DateSide): RoomSide => ({
    key,
    personId: s.person.id,
    name: s.person.displayName ?? s.person.slug,
    firstName: s.card.firstName,
    slug: s.person.slug,
    oneLiner: s.profile.oneLiner,
    interests: s.intro.interests.map((i) => shortLabel(i.text)),
    linkedinUrl: s.person.linkedinUrl,
    instagramUrl: s.person.instagramUrl,
  });
  // Only evidence actually cited in turns is shipped to the browser.
  const cited = new Set(turns.flatMap((t) => (t.evidenceIds as string[]).map((id) => `${t.actorPersonId === a.person.id ? "a" : "b"}:${id}`)));
  const evidence: RoomData["evidence"] = {};
  for (const [ns, s] of [["a", a], ["b", b]] as const) {
    for (const [id, ev] of Object.entries(s.evidence)) if (cited.has(`${ns}:${id}`)) evidence[`${ns}:${id}`] = ev;
  }
  const data: RoomData = {
    dateId: date.id,
    status: date.status,
    error: date.error,
    firstSpeaker: date.firstSpeaker as "a" | "b",
    runSlug: run.slug,
    runKind: run.kind,
    completedAt: date.completedAt ? date.completedAt.toISOString() : null,
    a: side("a", a),
    b: side("b", b),
    turns: turns.map((t) => ({
      turnIndex: t.turnIndex,
      actor: t.actorPersonId === a.person.id ? "a" : "b",
      act: t.act,
      action: t.action,
      utterance: t.utterance,
      evidenceIds: t.evidenceIds as string[],
      planTitle: t.planTitle,
      planDetails: t.planDetails,
      explanation: t.explanation,
      reactingTo: t.reactingTo,
      createdAt: t.createdAt.toISOString(),
      model: t.model,
    })),
    assessments: assessments.map((x) => ({
      evaluator: x.evaluatorId === a.person.id ? "a" : "b",
      score: x.score,
      coverage: x.coverage,
      secondDate: x.secondDate,
      summary: x.summary,
      strongestConnection: x.strongestConnection,
      concern: x.concern,
      dimensions: x.dimensions as RoomData["assessments"][number]["dimensions"],
    })),
    evidence,
    scenario: SCENARIO,
  };
  return { data, runId: run.id, runPublished: run.published, ownerSessionId: run.ownerSessionId };
}
