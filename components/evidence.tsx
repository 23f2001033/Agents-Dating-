"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Ev = {
  id: string;
  platform: string;
  field: string;
  label: string;
  excerpt: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
};

type Meta = { basis?: string; claim?: string; person?: string };
type Ctx = { evidence: Record<string, Ev>; open: (key: string, meta?: Meta) => void };
const EvidenceCtx = createContext<Ctx | null>(null);

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

// Evidence keys are namespaced as `${ns}:${localId}` so two people's L3 never collide (date room).
export function EvidenceProvider({ evidence, children }: { evidence: Record<string, Ev>; children: React.ReactNode }) {
  const [state, setState] = useState<{ ev: Ev; meta: Meta } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const open = useCallback(
    (key: string, meta: Meta = {}) => {
      const ev = evidence[key];
      if (!ev) return;
      lastFocus.current = document.activeElement as HTMLElement;
      setState({ ev, meta });
    },
    [evidence],
  );
  const close = useCallback(() => {
    setState(null);
    lastFocus.current?.focus();
  }, []);
  useEffect(() => {
    if (!state) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <EvidenceCtx.Provider value={{ evidence, open }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={close}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="ev-title"
            className="fade-in h-full w-full max-w-md overflow-y-auto border-l border-line bg-paper p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Evidence {state.ev.id} · {state.ev.platform === "linkedin" ? "LinkedIn" : "Instagram"}
                </p>
                <h2 id="ev-title" className="font-display mt-1 text-xl">
                  {state.ev.label}
                </h2>
              </div>
              <button ref={closeRef} onClick={close} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-ivory" aria-label="Close evidence">
                Close
              </button>
            </div>
            {state.meta.claim && (
              <div className="mt-4 rounded-lg bg-ivory p-3 text-sm">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${state.meta.basis === "tentative" ? "bg-terra-soft text-terra" : "bg-green-soft text-green"}`}>
                  {state.meta.basis === "tentative" ? "Tentative interpretation" : state.meta.basis === "observed" ? "Observed in source" : "Cited by the agent"}
                </span>
                {state.meta.claim}
              </div>
            )}
            <blockquote className="mt-4 whitespace-pre-wrap border-l-4 border-green pl-4 text-[15px] leading-relaxed">{state.ev.excerpt}</blockquote>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Source</dt>
              <dd>
                <a href={state.ev.url} target="_blank" rel="noopener noreferrer" className="break-all text-green underline">
                  {state.ev.url}
                </a>
              </dd>
              <dt className="text-muted">Field</dt>
              <dd>{state.ev.field}</dd>
              {state.ev.publishedAt && (
                <>
                  <dt className="text-muted">Posted</dt>
                  <dd>{fmt(state.ev.publishedAt)}</dd>
                </>
              )}
              <dt className="text-muted">Collected</dt>
              <dd>{fmt(state.ev.collectedAt)}</dd>
            </dl>
            <p className="mt-6 text-xs text-muted">
              Verbatim excerpt from the person&apos;s own public account (contact details removed). The agent may only cite IDs that exist in this evidence store.
            </p>
          </aside>
        </div>
      )}
    </EvidenceCtx.Provider>
  );
}

export function EvidenceChips({ ns, ids, basis, claim, person }: { ns: string; ids: string[]; basis?: string; claim?: string; person?: string }) {
  const ctx = useContext(EvidenceCtx);
  if (!ctx || !ids.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const ev = ctx.evidence[`${ns}:${id}`];
        if (!ev) return null;
        const li = ev.platform === "linkedin";
        return (
          <button
            key={id}
            type="button"
            onClick={() => ctx.open(`${ns}:${id}`, { basis, claim, person })}
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none ${li ? "bg-[#e3ecf5] text-[#1d4f7a]" : "bg-[#f7e6ef] text-[#8a2d5c]"} hover:ring-1 hover:ring-ink/30`}
            aria-label={`Open evidence ${id} from ${li ? "LinkedIn" : "Instagram"}`}
            title={ev.label}
          >
            {id}
          </button>
        );
      })}
    </span>
  );
}
