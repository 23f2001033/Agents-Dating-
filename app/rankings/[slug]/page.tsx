import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonSelect } from "@/components/person-select";
import { RankingView } from "@/components/ranking-view";
import { getDemoRun } from "@/lib/access";
import { loadPersonBySlug, loadRanking, runMembersList } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function RankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const run = await getDemoRun();
  if (!run) notFound();
  const person = await loadPersonBySlug(slug);
  if (!person) notFound();
  const members = await runMembersList(run.id);
  if (!members.some((m) => m.id === person.id)) notFound();
  const r = await loadRanking(run.id, person.id);
  const name = person.displayName ?? person.slug;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-terra">Who fits {name.split(" ")[0]} best</p>
          <h1 className="font-display mt-1 text-4xl font-semibold">
            <Link href={`/people/${person.slug}`} className="hover:underline">
              {name}
            </Link>
            &apos;s ranking
          </h1>
        </div>
        <PersonSelect people={members.map((m) => ({ slug: m.slug, name: m.name ?? m.slug }))} current={person.slug} base="/rankings" />
      </div>
      <RankingView name={name} rows={r.ranked} unranked={r.unranked} completed={r.completed} total={r.total} final={r.completed === r.total && r.total > 0} />
    </div>
  );
}
