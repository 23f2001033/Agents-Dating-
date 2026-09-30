import Link from "next/link";
import { Directory } from "@/components/directory";
import { getDemoRun } from "@/lib/access";
import { loadDirectory, runStats } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const run = await getDemoRun();
  if (!run) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-16 text-center">
        <h1 className="font-display text-3xl font-semibold">The demo run is being prepared</h1>
        <p className="mt-3 text-muted">The finished 25-person example appears here once every date has completed and passed the audit.</p>
      </div>
    );
  }
  const [cards, s] = await Promise.all([loadDirectory(run.id), runStats(run.id)]);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-terra">The completed experiment</p>
      <h1 className="font-display mt-1 text-4xl font-semibold">{run.title}</h1>
      <p className="mt-2 max-w-3xl text-muted">
        {s.people} real people, each represented by an agent built only from their public LinkedIn and Instagram. Every agent dated every other agent:{" "}
        <strong className="text-ink">
          {s.completed}/{s.dates} dates
        </strong>
        , {s.turns} turns and {s.assessments} private assessments. Open a profile to see the analysis, then its dates and ranking.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/rankings" className="rounded-full border border-line bg-paper px-3 py-1.5 hover:bg-white">
          Rankings for every person →
        </Link>
        <Link href="/how-it-works" className="rounded-full border border-line bg-paper px-3 py-1.5 hover:bg-white">
          How it works
        </Link>
      </div>
      <Directory cards={cards} />
    </div>
  );
}
