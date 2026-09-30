"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type RunState = {
  status: string;
  counts: { total: number; completed: number; failed: number; open: number; turns: number; assessments: number };
  dates: { id: string; status: string; counterpart: string; turns: number; forward: number | null; reverse: number | null }[];
};

export function RunLive({ runId, canDrive }: { runId: string; canDrive: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<RunState | null>(null);
  const driving = useRef(false);
  const lastCompleted = useRef(0);

  const poll = useCallback(async () => {
    const r = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as RunState;
    setS(j);
    if (j.counts.completed !== lastCompleted.current) {
      lastCompleted.current = j.counts.completed;
      router.refresh(); // re-render the provisional ranking from saved assessments
    }
  }, [runId, router]);

  const drive = useCallback(async () => {
    if (!canDrive || driving.current) return;
    driving.current = true;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await fetch(`/api/runs/${runId}/advance`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.status === "completed" || j.status === "partial") break;
      }
    } finally {
      driving.current = false;
      poll();
    }
  }, [runId, canDrive, poll]);

  useEffect(() => {
    poll();
    drive();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [poll, drive]);

  if (!s) return <p className="text-muted">Loading run…</p>;
  const done = s.status === "completed";
  const pct = s.counts.total ? Math.round((s.counts.completed / s.counts.total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {done ? (
            <strong className="text-green">All {s.counts.total} dates complete.</strong>
          ) : (
            <span className="text-terra">
              <span className="pulse-dot mr-1 inline-block h-2 w-2 rounded-full bg-terra" /> Live agent run — {s.counts.completed}/{s.counts.total} dates done · {s.counts.turns} turns ·{" "}
              {s.counts.assessments} assessments
            </span>
          )}
        </p>
        <p className="font-mono text-sm">{pct}%</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-line">
        <div className="h-2 rounded-full bg-green transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {s.dates
          .slice()
          .sort((a, b) => a.counterpart.localeCompare(b.counterpart))
          .map((d) => (
            <li key={d.id}>
              <Link href={`/dates/${d.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-ivory">
                <span className="truncate">with {d.counterpart}</span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {d.status === "completed" ? `${Math.round(d.forward ?? 0)} → ← ${Math.round(d.reverse ?? 0)}` : d.status === "failed" ? "failed" : d.turns < 6 ? `turn ${d.turns}/6` : "assessing"}
                </span>
              </Link>
            </li>
          ))}
      </ul>
      {!done && canDrive && <p className="mt-3 text-xs text-muted">Keep this page open while the agents date. Every turn is saved; reloading resumes exactly where it stopped.</p>}
    </div>
  );
}
