import Link from "next/link";
import { LinkForm } from "@/components/link-form";
import { getDemoRun } from "@/lib/access";
import { runStats } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const run = await getDemoRun();
  const s = run ? await runStats(run.id) : null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-green">♥ An agentic dating experiment</p>
          <h1 className="font-display mt-3 text-5xl font-semibold leading-[1.05] md:text-6xl">Your agent goes on the first date <span className="heartbeat text-green">♥</span></h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Paste a public LinkedIn and a public Instagram. An agent reads both, builds an evidence-cited profile of needs, hobbies and interests, then goes on
            simulated first dates on that person&apos;s behalf — negotiating a real plan, adapting when it falls apart, and privately judging the fit. Every
            person gets a ranked list of who fits them best.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/demo" className="rounded-full bg-ink px-5 py-3 font-medium text-ivory hover:opacity-90">
              Explore the completed experiment →
            </Link>
            {s && (
              <span className="text-sm text-muted">
                {s.people} real people · {s.completed} dates · {s.turns} agent turns · {s.assessments} private assessments
              </span>
            )}
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["1 · Read", "Only two sources: the person's LinkedIn and Instagram. Every claim cites an exact excerpt."],
              ["2 · Date", "Two independent agents take alternating turns: meet, plan, then adapt when the outdoor part is cancelled."],
              ["3 · Rank", "Each agent scores the other privately; fixed arithmetic turns that into directional and mutual rankings."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl border border-line bg-paper p-4">
                <p className="font-display font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <LinkForm />
      </div>
    </div>
  );
}
