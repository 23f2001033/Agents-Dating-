"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EvidenceChips, EvidenceProvider, type Ev } from "@/components/evidence";
import { HeartBurst } from "@/components/hearts";

export type RoomSide = {
  key: "a" | "b";
  personId: string;
  name: string;
  firstName: string;
  slug: string;
  oneLiner: string;
  interests: string[];
  linkedinUrl: string;
  instagramUrl: string;
};
export type RoomTurn = {
  turnIndex: number;
  actor: "a" | "b";
  act: string;
  action: string;
  utterance: string;
  evidenceIds: string[];
  planTitle: string | null;
  planDetails: string | null;
  explanation: string;
  reactingTo: string | null;
  createdAt: string;
  model: string;
};
export type RoomAssessment = {
  evaluator: "a" | "b";
  score: number | null;
  coverage: number;
  secondDate: string;
  summary: string;
  strongestConnection: string;
  concern: string;
  dimensions: Record<string, { rating: number | null; rationale: string; refs: string[] }>;
};
export type RoomData = {
  dateId: string;
  status: string;
  error: string | null;
  firstSpeaker: "a" | "b";
  runSlug: string;
  runKind: string;
  completedAt: string | null;
  a: RoomSide;
  b: RoomSide;
  turns: RoomTurn[];
  assessments: RoomAssessment[];
  evidence: Record<string, Ev>; // keys "a:L3" / "b:I7"
  scenario: { title: string; complication: string };
};

const ACTS = [
  { key: "meet", label: "Meet", hint: "Grounded openers" },
  { key: "plan", label: "Plan", hint: "Negotiate a real plan" },
  { key: "adapt", label: "Adapt", hint: "Outdoor part unavailable" },
];
const DIMS: [string, string][] = [
  ["interest_alignment", "Interest alignment · 30%"],
  ["priority_alignment", "Priorities & lifestyle · 25%"],
  ["reciprocity", "Conversational reciprocity · 25%"],
  ["plan_negotiation", "Plan negotiation · 20%"],
];
const ACTION_STYLE: Record<string, string> = {
  ask: "bg-[#e3ecf5] text-[#1d4f7a]",
  answer: "bg-green-soft text-green",
  propose: "bg-[#f3ead3] text-gold",
  clarify: "bg-[#ece6f3] text-[#5b3f7a]",
  adapt: "bg-[#e0efe9] text-[#2a6a55]",
  decline: "bg-terra-soft text-terra",
};

function Initials({ name, tone }: { name: string; tone: "a" | "b" }) {
  const t = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span className={`font-display inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${tone === "a" ? "bg-green" : "bg-terra"}`} aria-hidden="true">
      {t}
    </span>
  );
}

export function DateRoom({ initial, live, driveRunId = null }: { initial: RoomData; live: boolean; driveRunId?: string | null }) {
  const [data, setData] = useState<RoomData>(initial);
  const finished = data.status === "completed";
  const [shown, setShown] = useState<number>(live || !finished ? initial.turns.length : initial.turns.length);
  const [playing, setPlaying] = useState(false);

  // Live mode: poll the persisted date until it completes.
  useEffect(() => {
    if (!live || finished) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/dates/${data.dateId}`, { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as RoomData;
        setData(j);
        setShown(j.turns.length);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [live, finished, data.dateId]);

  // The run's owner watching a live date keeps the run advancing (short persisted server ticks).
  useEffect(() => {
    if (!live || finished || !driveRunId) return;
    let stop = false;
    (async () => {
      for (let i = 0; i < 12 && !stop; i++) {
        const r = await fetch(`/api/runs/${driveRunId}/advance`, { method: "POST" }).catch(() => null);
        const j = r ? await r.json().catch(() => ({})) : {};
        if (!r?.ok || j.status === "completed" || j.status === "partial") break;
      }
    })();
    return () => {
      stop = true;
    };
  }, [live, finished, driveRunId]);

  // Replay: reveal saved turns one by one (no fake typing, no new inference).
  useEffect(() => {
    if (!playing) return;
    if (shown >= data.turns.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 600 : 2600);
    return () => clearTimeout(t);
  }, [playing, shown, data.turns.length]);

  const replay = useCallback(() => {
    setShown(0);
    setPlaying(true);
  }, []);

  const visible = data.turns.slice(0, shown);
  const currentAct = visible.length ? visible[visible.length - 1].act : "meet";
  const plans = visible.filter((t) => t.planTitle);
  const plan = plans[plans.length - 1];
  const side = (k: "a" | "b") => (k === "a" ? data.a : data.b);
  const showVerdicts = finished && shown >= data.turns.length;
  const byEval = useMemo(() => Object.fromEntries(data.assessments.map((a) => [a.evaluator, a])), [data.assessments]);
  const liveLabel = live && !finished;

  return (
    <EvidenceProvider evidence={data.evidence}>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {liveLabel ? (
                <span className="text-terra">
                  <span className="pulse-dot mr-1 inline-block h-2 w-2 rounded-full bg-terra" /> Live agent run
                </span>
              ) : finished ? (
                <>Replay of a completed date · recorded {data.completedAt ? new Date(data.completedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}</>
              ) : (
                <>Date status: {data.status}</>
              )}
            </p>
            <h1 className="font-display mt-1 text-3xl font-semibold">
              {data.a.firstName}&apos;s agent <span className="text-muted">×</span> {data.b.firstName}&apos;s agent
            </h1>
          </div>
          {finished && (
            <div className="flex gap-2">
              <button onClick={replay} className="rounded-full bg-green px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                ▶ Replay
              </button>
              <button onClick={() => setPlaying((p) => !p)} disabled={shown >= data.turns.length && !playing} className="rounded-full border border-line bg-paper px-4 py-2 text-sm disabled:opacity-40">
                {playing ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setShown(data.turns.length);
                }}
                className="rounded-full border border-line bg-paper px-4 py-2 text-sm"
              >
                Show all
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[230px_1fr_230px]">
          {(["a", "b"] as const).map((k, i) => {
            const s = side(k);
            return (
              <aside key={k} className={`h-fit rounded-2xl border border-line bg-paper p-4 ${i === 1 ? "lg:order-3" : "lg:order-1"}`}>
                <div className="flex items-center gap-3">
                  <Initials name={s.name} tone={k} />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted">Agent for</p>
                    <Link href={`/people/${s.slug}`} className="font-display text-lg font-semibold hover:underline">
                      {s.name}
                    </Link>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">{s.oneLiner}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Sourced interests</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {s.interests.slice(0, 4).map((x, j) => (
                    <li key={j}>• {x}</li>
                  ))}
                </ul>
                {data.firstSpeaker === k && <p className="mt-3 text-xs text-muted">Opens the date (speaking order is balanced across the cohort).</p>}
              </aside>
            );
          })}

          <section className="lg:order-2">
            <div className="rounded-2xl border border-line bg-paper p-4">
              <div className="grid grid-cols-3 gap-2">
                {ACTS.map((a, i) => {
                  const idx = ACTS.findIndex((x) => x.key === currentAct);
                  const state = i < idx ? "done" : i === idx ? "active" : "todo";
                  return (
                    <div key={a.key} className={`rounded-lg border px-3 py-2 text-center ${state === "active" ? "border-green bg-green-soft" : state === "done" ? "border-line bg-ivory" : "border-dashed border-line"}`}>
                      <p className="text-sm font-semibold">
                        {i + 1}. {a.label}
                      </p>
                      <p className="text-[11px] text-muted">{a.hint}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm">
                <span className="font-semibold">Scenario:</span> {data.scenario.title}.{" "}
                {currentAct === "adapt" && (
                  <span className="fade-in rounded bg-terra-soft px-1.5 py-0.5 text-terra">
                    Complication: {data.scenario.complication}
                  </span>
                )}
              </p>
            </div>

            <ol className="mt-4 space-y-3" aria-live="polite">
              {visible.map((t) => {
                const s = side(t.actor);
                const right = t.actor === "b";
                return (
                  <li key={t.turnIndex} className={`fade-in flex gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
                    <Initials name={s.name} tone={t.actor} />
                    <div className={`max-w-[88%] rounded-2xl border p-3.5 ${right ? "border-[#dcc7ea] bg-[#f7f0fc]" : "border-[#f5c2d3] bg-[#fff0f5]"}`}>
                      <p className={`flex flex-wrap items-center gap-2 text-xs text-muted ${right ? "justify-end" : ""}`}>
                        <span className="font-semibold text-ink">{s.firstName}&apos;s agent</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_STYLE[t.action] ?? "bg-line"}`}>{t.action}</span>
                        <span>
                          T{t.turnIndex + 1} · {t.act}
                        </span>
                      </p>
                      <p className="mt-1.5 text-left text-[15px] leading-relaxed">{t.utterance}</p>
                      <p className="mt-2 text-left text-xs text-muted">
                        <span className="font-semibold">Why this move:</span> {t.explanation}
                        <EvidenceChips ns={t.actor} ids={t.evidenceIds} person={s.name} />
                      </p>
                    </div>
                  </li>
                );
              })}
              {liveLabel && (
                <li className="flex items-center gap-2 text-sm text-muted">
                  <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-terra" />
                  {data.turns.length < 6
                    ? `${(data.turns.length % 2 === 0 ? side(data.firstSpeaker) : side(data.firstSpeaker === "a" ? "b" : "a")).firstName}'s agent is choosing turn ${data.turns.length + 1} of 6…`
                    : "Both agents are privately assessing the date…"}
                </li>
              )}
              {data.status === "failed" && <li className="rounded-lg bg-terra-soft p-3 text-sm text-terra">This date failed after retries: {data.error}. No score was fabricated.</li>}
            </ol>

            <div className="mt-4 rounded-2xl border border-dashed border-green/40 bg-[#fff5f8] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-green">♥ Proposed plan</p>
              {plan ? (
                <div key={plan.turnIndex} className="fade-in">
                  <p className="font-display mt-1 text-lg font-semibold">{plan.planTitle}</p>
                  <p className="text-sm">{plan.planDetails}</p>
                  <p className="mt-1 text-xs text-muted">
                    Last changed in T{plan.turnIndex + 1} by {side(plan.actor).firstName}&apos;s agent · {plans.length} plan change{plans.length === 1 ? "" : "s"} so far
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">No plan proposed yet.</p>
              )}
            </div>
          </section>
        </div>

        <HeartBurst fire={showVerdicts && data.assessments.some((x) => x.secondDate === "yes")} />
        {showVerdicts && (
          <div className="fade-in mt-8 grid gap-5 md:grid-cols-2">
            {(["a", "b"] as const).map((k) => {
              const a = byEval[k];
              const me = side(k);
              const other = side(k === "a" ? "b" : "a");
              if (!a) return null;
              return (
                <article key={k} className="rounded-2xl border border-line bg-paper p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Private verdict</p>
                  <h2 className="font-display text-xl font-semibold">
                    {me.firstName}&apos;s agent about {other.firstName}
                  </h2>
                  <div className="mt-3 flex items-end gap-4">
                    <p className="font-display text-5xl font-semibold text-green">{a.score == null ? "—" : Math.round(a.score)}</p>
                    <div className="pb-1 text-sm">
                      <p>Simulated fit /100</p>
                      <p className="text-muted">Evidence coverage {Math.round(a.coverage * 100)}%</p>
                    </div>
                    <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${a.secondDate === "yes" ? "bg-green-soft text-green" : a.secondDate === "no" ? "bg-terra-soft text-terra" : "bg-[#f3ead3] text-gold"}`}>
                      Second date: {a.secondDate}
                    </span>
                  </div>
                  <p className="mt-3 text-[15px] italic">“{a.summary}”</p>
                  <ul className="mt-3 space-y-2">
                    {DIMS.map(([key, label]) => {
                      const d = a.dimensions[key];
                      return (
                        <li key={key} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{label}</span>
                            <span className="font-mono text-xs">{d?.rating == null ? "unknown" : `${d.rating}/4`}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-line">
                            <div className={`h-1.5 rounded-full ${d?.rating == null ? "" : d.rating >= 3 ? "bg-green" : d.rating >= 2 ? "bg-gold" : "bg-terra"}`} style={{ width: d?.rating == null ? 0 : `${(d.rating / 4) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted">{d?.rationale}</p>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-sm">
                    <span className="font-semibold text-green">Strongest connection:</span> {a.strongestConnection}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold text-terra">Concern / unknown:</span> {a.concern}
                  </p>
                  <Link href={data.runKind === "demo" ? `/rankings/${me.slug}` : `/runs/${data.runSlug}`} className="mt-4 inline-block text-sm font-medium text-green underline">
                    See {me.firstName}&apos;s full ranking →
                  </Link>
                </article>
              );
            })}
          </div>
        )}
        {finished && byEval.a && byEval.b && showVerdicts && (
          <p className="mt-4 text-center text-sm text-muted">
            Mutual fit = the lower of the two: <strong className="text-ink">{Math.round(Math.min(byEval.a.score ?? 0, byEval.b.score ?? 0))}</strong> — one agent&apos;s enthusiasm can&apos;t erase the
            other&apos;s hesitation. Each agent assessed independently and never saw the other&apos;s verdict.
          </p>
        )}
      </div>
    </EvidenceProvider>
  );
}
