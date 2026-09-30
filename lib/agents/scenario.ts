// One cohort-wide scenario and complication keep every pair's conditions comparable.
// These are simulation conditions, not facts about the people.

export const SCENARIO_VERSION = "scenario-v1";

export const SCENARIO = {
  title: "A first date with two hours available",
  complication: "The outdoor portion is unavailable.",
};

export type ActKey = "meet" | "plan" | "adapt";

export const ACTS: { key: ActKey; label: string; goal: string; suggested: string[] }[] = [
  {
    key: "meet",
    label: "Meet",
    goal: "Open the date. Introduce your person through one grounded detail, respond to the other agent, and explore one of the other person's sourced interests.",
    suggested: ["ask", "answer"],
  },
  {
    key: "plan",
    label: "Plan",
    goal: "Propose and negotiate an actual hypothetical plan for the two hours (what, where, why it suits both). Explain preferences; it is fine to counter-propose or decline part of a plan.",
    suggested: ["propose", "clarify", "answer", "decline"],
  },
  {
    key: "adapt",
    label: "Adapt",
    goal: `Complication: ${"The outdoor portion is unavailable."} Revise the plan, or if the plan was already indoors, discuss how to use the remaining time. Show whether your person's side can adapt.`,
    suggested: ["adapt", "propose", "clarify", "decline"],
  },
];

export const ACTIONS = ["ask", "answer", "propose", "clarify", "adapt", "decline"] as const;
export type Action = (typeof ACTIONS)[number];

export const TURNS_PER_DATE = 6;

export type TurnSlot = { index: number; speaker: "a" | "b"; act: ActKey; actNumber: number; speakerTurn: number };

export function turnPlan(firstSpeaker: "a" | "b"): TurnSlot[] {
  const second = firstSpeaker === "a" ? "b" : "a";
  return Array.from({ length: TURNS_PER_DATE }, (_, i) => ({
    index: i,
    speaker: i % 2 === 0 ? firstSpeaker : second,
    act: ACTS[Math.floor(i / 2)].key,
    actNumber: Math.floor(i / 2) + 1,
    speakerTurn: Math.floor(i / 2) + 1,
  }));
}

// Balanced first-speaker assignment for a full cohort (circulant orientation of the complete graph):
// with n = 25, every person opens exactly 12 of their 24 dates.
export function firstSpeakerFor(posA: number, posB: number, n: number): "a" | "b" {
  const [lo, hi] = posA < posB ? [posA, posB] : [posB, posA];
  const d = hi - lo;
  const loFirst = d <= Math.floor((n - 1) / 2);
  const firstPos = loFirst ? lo : hi;
  return firstPos === posA ? "a" : "b";
}
