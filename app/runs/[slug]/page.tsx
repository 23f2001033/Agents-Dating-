import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canDriveRun, canViewRun } from "@/lib/access";
import { getSession } from "@/lib/session";
import { RunLive } from "@/components/run-live";
import { RankingView } from "@/components/ranking-view";
import { loadRanking } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.slug, slug));
  const session = await getSession();
  if (!run || !canViewRun(run, session)) notFound();
  const [focus] = run.focusPersonId ? await db.select().from(schema.people).where(eq(schema.people.id, run.focusPersonId)) : [];
  const r = focus ? await loadRanking(run.id, focus.id) : null;
  const name = focus?.displayName ?? "Your agent";
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-terra">Your private dating run</p>
      <h1 className="font-display mt-1 text-4xl font-semibold">{run.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Scope: {name.split(" ")[0]}&apos;s agent dates each of the published demo agents once ({run.expectedPairs} new dates). The original cohort&apos;s 300 dates are not
        re-run and their rankings are unchanged. Only this browser session can see this run.
        {focus && (
          <>
            {" "}
            <Link className="underline" href={`/try/${focus.id}`}>
              View {name.split(" ")[0]}&apos;s profile
            </Link>
          </>
        )}
      </p>
      <div className="mt-5">
        <RunLive runId={run.id} canDrive={canDriveRun(run, session)} />
      </div>
      {r && (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-semibold">Who fits {name.split(" ")[0]} best</h2>
          <RankingView name={name} rows={r.ranked} unranked={r.unranked} completed={r.completed} total={r.total} final={r.completed === r.total && r.total > 0} />
        </section>
      )}
    </div>
  );
}
