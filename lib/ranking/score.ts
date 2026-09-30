// Deterministic, explainable scoring. No model ever produces a rank or a final score.
//   K        = sum of weights of known dimensions  ("evidence coverage", not a probability)
//   raw      = 25 × Σ(weight × rating) / K         (0–100)
//   index    = 50 + K × (raw − 50)                 (shrinks incomplete assessments toward neutral)
// Unknown is not zero. Constants are design heuristics, not validated measurements.

export const WEIGHTS = {
  interest_alignment: 0.3,
  priority_alignment: 0.25,
  reciprocity: 0.25,
  plan_negotiation: 0.2,
} as const;

export type DimKey = keyof typeof WEIGHTS;
export type Ratings = Record<DimKey, number | null>;

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

export function computeScore(ratings: Ratings): { score: number | null; raw: number | null; coverage: number } {
  let K = 0;
  let sum = 0;
  for (const key of Object.keys(WEIGHTS) as DimKey[]) {
    const r = ratings[key];
    if (r === null || r === undefined) continue;
    if (!Number.isFinite(r) || r < 0 || r > 4) throw new Error(`rating out of range for ${key}: ${r}`);
    K += WEIGHTS[key];
    sum += WEIGHTS[key] * r;
  }
  K = round2(K);
  if (K === 0) return { score: null, raw: null, coverage: 0 };
  const raw = (25 * sum) / K;
  const score = 50 + K * (raw - 50);
  return { score: round1(score), raw: round1(raw), coverage: K };
}

export type RankInput = {
  counterpartId: string;
  dateId: string;
  status: string; // date status
  forward: { score: number | null; coverage: number } | null; // me → them
  reverse: { score: number | null; coverage: number } | null; // them → me
};

export type RankedRow = RankInput & { rank: number | null; mutual: number | null };

export function mutualFit(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return Math.min(a, b);
}

// Sort: forward index desc → mutual fit desc → evidence coverage desc → stable person id.
// Only completed dates with a known forward index are ranked; others are listed as pending/failed/unknown.
export function rankFor(rows: RankInput[]): { ranked: RankedRow[]; unranked: RankedRow[] } {
  const withMutual = rows.map((r) => ({ ...r, rank: null as number | null, mutual: mutualFit(r.forward?.score, r.reverse?.score) }));
  const eligible = withMutual.filter((r) => r.status === "completed" && r.forward?.score != null);
  const rest = withMutual.filter((r) => !(r.status === "completed" && r.forward?.score != null));
  eligible.sort((x, y) => {
    const f = (y.forward!.score ?? 0) - (x.forward!.score ?? 0);
    if (f) return f;
    const m = (y.mutual ?? -1) - (x.mutual ?? -1);
    if (m) return m;
    const c = (y.forward!.coverage ?? 0) - (x.forward!.coverage ?? 0);
    if (c) return c;
    return x.counterpartId < y.counterpartId ? -1 : x.counterpartId > y.counterpartId ? 1 : 0;
  });
  eligible.forEach((r, i) => (r.rank = i + 1));
  return { ranked: eligible, unranked: rest };
}
