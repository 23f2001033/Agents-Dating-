import Link from "next/link";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const steps: [string, string][] = [
  ["1. Two links in", "A visitor pastes a public LinkedIn /in/ URL and a public Instagram account URL. We validate hosts and paths (no lookalike domains, no post links) and never fetch arbitrary URLs ourselves."],
  ["2. Collection", "Apify actors fetch only those two accounts: harvestapi/linkedin-profile-scraper (headline, about, experience, education, volunteering, honors…) and apify/instagram-profile-scraper (bio, public/private flag, 12 latest posts). Runs are started asynchronously; their IDs are saved so a crash resumes the same paid collection."],
  ["3. Boundary & identity", "We keep only the person's own content: other accounts' collab posts, comments, recommendations, follower counts and contact details are dropped. Private Instagram accounts are blocked. The two accounts must be cross-linked, or match by name plus two consistent self-described details; otherwise the visitor must confirm and the profile is labeled so."],
  ["4. Analysis", "Every excerpt becomes an immutable evidence item (L1…, I1…). Kimi K2.6 writes claims — interests, hobbies, priorities, lifestyle, needs, communication style — each labeled observed or tentative and citing evidence IDs. The server rejects claims whose IDs don't exist and filters sensitive inferences (relationship status, orientation, religion, health, ethnicity, gendered pronouns)."],
  ["5. The date", "Two independent agents (Qwen3.8 Flash) alternate six turns over three acts: Meet, Plan, Adapt — with a shared scenario ('a first date with two hours available') and complication ('the outdoor portion is unavailable'). Each call produces exactly one agent's turn from its own card, the other agent's public intro and the saved transcript. Actions: ask, answer, propose, clarify, adapt, decline."],
  ["6. Private verdicts", "After the date, each agent privately rates the other on interest alignment (30%), priority & lifestyle alignment (25%), conversational reciprocity (25%) and plan negotiation (20%) — 0–4 or unknown, each with a rationale and claim/turn references. Neither sees the other's verdict."],
  ["7. Deterministic ranking", "raw = 25·Σ(w·r)/K and index = 50 + K·(raw − 50), where K is the weight of known dimensions (evidence coverage). Unknown is not zero. A→B and B→A are kept separately; mutual fit is their minimum. Ranking order: directional desc → mutual → coverage → stable id. No model ever writes a rank."],
  ["8. Durable jobs without a worker server", "Everything is persisted in Postgres as a resumable state machine: people (submitted → collecting → verifying → analyzing → ready), dates (queued → running → assessing → completed) with leases and unique (date, turn) keys, so retries never duplicate turns and a restart resumes at the next missing turn. On Vercel, short server ticks advance the work while the page is open; the 300-date demo was run by the same code from a CLI worker."],
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-terra">How it works</p>
      <h1 className="font-display mt-1 text-4xl font-semibold">Profile evidence → agent conversation → two perspectives → ranking</h1>
      <ol className="mt-6 space-y-4">
        {steps.map(([t, d]) => (
          <li key={t} className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="font-display text-lg font-semibold">{t}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl border border-line bg-paper p-5 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Limits and ethics</h2>
        <p className="mt-1 text-muted">
          This is a clearly labeled simulation. The real people did not participate or consent to a date, and nothing implies they are single or interested. We never
          infer gender, orientation, ethnicity, religion, health, relationship status or attractiveness, and never filter pairs by inferred gender — all pairs are
          compared on simulated conversational and lifestyle fit. Scores are design heuristics, not validated measurements. Visitor submissions stay private to the
          submitting browser session. Removal requests: <a className="underline" href={config.ownerContactUrl}>open an issue</a>.
        </p>
        <p className="mt-3">
          <Link href="/demo" className="font-medium text-green underline">
            Explore the finished experiment →
          </Link>
        </p>
      </div>
    </div>
  );
}
