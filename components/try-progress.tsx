"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Src = { status: string; coverage: Record<string, unknown> | null; error: string | null };
type State = {
  id: string;
  slug: string;
  name: string | null;
  status: string;
  detail: string | null;
  sources: { linkedin: Src; instagram: Src };
  identity: { status?: string; signals: string[] } | null;
  ready: boolean;
  canDrive: boolean;
};

const TERMINAL = ["ready", "blocked_private", "blocked_identity", "insufficient_data", "failed"];

function Row({ label, state, detail }: { label: string; state: "todo" | "doing" | "done" | "error"; detail?: string }) {
  const icon = state === "done" ? "✓" : state === "error" ? "!" : state === "doing" ? "" : "·";
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${state === "done" ? "bg-green text-white" : state === "error" ? "bg-terra text-white" : state === "doing" ? "border-2 border-green" : "bg-line text-muted"}`}
      >
        {state === "doing" ? <span className="pulse-dot h-2 w-2 rounded-full bg-green" /> : icon}
      </span>
      <div>
        <p className="font-medium">{label}</p>
        {detail && <p className="text-sm text-muted">{detail}</p>}
      </div>
    </li>
  );
}

export function TryProgress({ personId }: { personId: string }) {
  const router = useRouter();
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const driving = useRef(false);

  const poll = useCallback(async () => {
    const r = await fetch(`/api/people/${personId}`, { cache: "no-store" });
    if (r.ok) setS(await r.json());
    else setErr("This analysis is not available in your session.");
  }, [personId]);

  // Drive the persisted pipeline with short server ticks while this page is open.
  const drive = useCallback(async () => {
    if (driving.current) return;
    driving.current = true;
    try {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/people/${personId}/advance`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        await poll();
        if (!r.ok || TERMINAL.includes(j.status)) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
    } finally {
      driving.current = false;
    }
  }, [personId, poll]);

  useEffect(() => {
    poll();
    drive();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll, drive]);

  useEffect(() => {
    if (s?.ready) router.refresh();
  }, [s?.ready, router]);

  if (err) return <p className="rounded-lg bg-terra-soft p-4 text-terra">{err}</p>;
  if (!s) return <p className="text-muted">Loading…</p>;

  const srcState = (x: Src): "todo" | "doing" | "done" | "error" => (x.status === "succeeded" ? "done" : x.status === "failed" ? "error" : x.status === "running" ? "doing" : "todo");
  const liCov = s.sources.linkedin.coverage as { aboutChars?: number; experienceCount?: number; educationCount?: number } | null;
  const igCov = s.sources.instagram.coverage as { bio?: boolean; captionsAuthored?: number; excludedNotAuthored?: number; isPrivate?: boolean } | null;
  const verifyState = ["verifying"].includes(s.status) ? "doing" : ["analyzing", "ready"].includes(s.status) ? "done" : ["blocked_identity", "blocked_private", "insufficient_data"].includes(s.status) ? "error" : "todo";

  async function confirm() {
    await fetch(`/api/people/${personId}/confirm`, { method: "POST" });
    await poll();
    drive();
  }
  async function retry() {
    await fetch(`/api/people/${personId}/retry`, { method: "POST" });
    await poll();
    drive();
  }
  // Re-collect the source that blocked this profile (e.g. the Instagram has been made public since).
  async function recheck() {
    setBusy(true);
    setActionMsg(null);
    try {
      const r = await fetch(`/api/people/${personId}/recheck`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setActionMsg(j.error ?? "Could not re-check right now.");
      await poll();
      if (r.ok) drive();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-terra">
        <span className="pulse-dot mr-1 inline-block h-2 w-2 rounded-full bg-terra" /> Live pipeline · status: {s.status}
      </p>
      <ol className="mt-2 divide-y divide-line">
        <Row
          label="LinkedIn — public profile collected"
          state={srcState(s.sources.linkedin)}
          detail={s.sources.linkedin.error ?? (liCov ? `About: ${liCov.aboutChars ?? 0} chars · ${liCov.experienceCount ?? 0} experiences · ${liCov.educationCount ?? 0} education` : "Queued with the scraping provider (Apify)…")}
        />
        <Row
          label="Instagram — bio and recent authored captions"
          state={srcState(s.sources.instagram)}
          detail={s.sources.instagram.error ?? (igCov ? `${igCov.isPrivate ? "PRIVATE account" : "Public account"} · bio ${igCov.bio ? "✓" : "—"} · ${igCov.captionsAuthored ?? 0} authored captions${igCov.excludedNotAuthored ? ` · ${igCov.excludedNotAuthored} posts by other accounts excluded` : ""}` : "Queued with the scraping provider (Apify)…")}
        />
        <Row
          label="Checks — public account and same person"
          state={verifyState}
          detail={
            s.status === "blocked_private"
              ? "Instagram reports this account as private, so it cannot be used."
              : s.identity
                ? `Identity evidence: ${s.identity.status}${s.identity.signals.length ? ` — ${s.identity.signals.slice(0, 3).join("; ")}` : ""}`
                : "Public-state and identity checks run after both sources arrive."
          }
        />
        <Row label="Analysis — evidence-cited profile and agent card" state={s.status === "analyzing" ? "doing" : s.status === "ready" ? "done" : "todo"} detail={(["analyzing", "ready"].includes(s.status) && s.detail) || "The analyst may only cite excerpts that exist in the evidence store."} />
      </ol>

      {s.status === "blocked_identity" && (
        <div className="mt-4 rounded-lg bg-terra-soft p-4 text-sm">
          <p className="font-semibold text-terra">We could not establish that these accounts belong to the same person.</p>
          <p className="mt-1">Neither account links to the other, and we found fewer than two consistent self-described details. If both are yours, you can confirm — the profile will be labeled “Submitter-confirmed”, not verified.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.canDrive && (
              <button onClick={confirm} className="rounded-full bg-green px-4 py-2 font-medium text-white">
                Both accounts are mine — continue
              </button>
            )}
            <Link href="/#try" className="rounded-full border border-line bg-paper px-4 py-2">
              Use different links
            </Link>
          </div>
        </div>
      )}
      {s.status === "blocked_private" && (
        <div className="mt-4 rounded-lg bg-terra-soft p-4 text-sm">
          <p className="text-terra">{s.detail}</p>
          <p className="mt-1">Switched the account to public? Check again — we collect only Instagram again and keep the LinkedIn result.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.canDrive && (
              <button onClick={recheck} disabled={busy} className="rounded-full bg-green px-4 py-2 font-medium text-white disabled:opacity-60">
                {busy ? "Checking…" : "I've made it public — check again"}
              </button>
            )}
            <Link href="/#try" className="rounded-full border border-line bg-paper px-4 py-2">
              Use different links
            </Link>
          </div>
        </div>
      )}
      {s.status === "insufficient_data" && (
        <div className="mt-4 rounded-lg bg-terra-soft p-4 text-sm">
          <p className="text-terra">{s.detail}</p>
          {s.canDrive && (
            <button onClick={recheck} disabled={busy} className="mt-2 rounded-full bg-green px-4 py-2 font-medium text-white disabled:opacity-60">
              {busy ? "Checking…" : "Collect both accounts again"}
            </button>
          )}
        </div>
      )}
      {actionMsg && (
        <p role="alert" className="mt-3 rounded-lg bg-terra-soft px-3 py-2 text-sm text-terra">
          {actionMsg}
        </p>
      )}
      {s.status === "failed" && (
        <div className="mt-4 rounded-lg bg-terra-soft p-4 text-sm">
          <p className="text-terra">{s.detail}</p>
          {s.canDrive && (
            <button onClick={retry} className="mt-2 rounded-full bg-green px-4 py-2 font-medium text-white">
              Retry the failed step
            </button>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Keep this page open — work runs in short saved steps, so reloading or coming back later resumes where it stopped.</p>
    </div>
  );
}

export function StartDating({ personId, firstName }: { personId: string; firstName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-6 rounded-2xl border-2 border-green bg-green-soft p-5 text-center">
      <p className="font-display text-2xl font-semibold">{firstName}&apos;s agent is ready.</p>
      <p className="mt-1 text-sm">It will go on 25 simulated first dates — one with each demo agent — in a private run only you can see.</p>
      {err && <p className="mt-2 text-sm text-terra">{err}</p>}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId }) });
          const j = await r.json();
          if (!r.ok) {
            setErr(j.error ?? "Could not start");
            setBusy(false);
            return;
          }
          router.push(`/runs/${j.slug}`);
        }}
        className="mt-4 rounded-full bg-green px-6 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Starting…" : "Let my agent date →"}
      </button>
    </div>
  );
}
