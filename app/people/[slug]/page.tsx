import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile-view";
import { canViewPerson, getDemoRun } from "@/lib/access";
import { getSession } from "@/lib/session";
import { loadEvidenceForProfile, loadPersonBySlug, loadPersonDates, loadProfileVersion, toPublicEvidence } from "@/lib/view";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const person = await loadPersonBySlug(slug);
  if (!person) notFound();
  const session = await getSession();
  if (!(await canViewPerson(person, session))) notFound();
  const run = await getDemoRun();
  // Demo members show the exact profile version pinned in the published run.
  let pvId = person.currentProfileId;
  if (run) {
    const [m] = await db.select().from(schema.runMembers).where(and(eq(schema.runMembers.runId, run.id), eq(schema.runMembers.personId, person.id)));
    if (m) pvId = m.profileVersionId;
  }
  const pv = await loadProfileVersion(pvId);
  if (!pv) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-16">
        <h1 className="font-display text-3xl font-semibold">{person.displayName ?? person.slug}</h1>
        <p className="mt-2 text-muted">This profile is not analyzed yet (status: {person.status}).</p>
      </div>
    );
  }
  const evidence = toPublicEvidence(await loadEvidenceForProfile(pv));
  const dates = run ? await loadPersonDates(person.id, run.id) : [];
  const first = (person.displayName ?? person.slug).split(" ")[0];
  return (
    <ProfileView
      person={person}
      pv={pv}
      evidence={evidence}
      footer={
        dates.length > 0 && (
          <section className="mt-6 rounded-2xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">
                {first}&apos;s agent went on {dates.filter((d) => d.status === "completed").length} dates
              </h2>
              <Link href={`/rankings/${person.slug}`} className="rounded-full bg-green px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                See {first}&apos;s ranking →
              </Link>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dates.map((d) => (
                <li key={d.dateId}>
                  <Link href={`/dates/${d.dateId}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:bg-ivory">
                    <span>with {d.counterpartName}</span>
                    <span className="font-mono text-xs text-muted">
                      {d.forward == null ? d.status : `${Math.round(d.forward)} → · ← ${d.reverse == null ? "—" : Math.round(d.reverse)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      }
    />
  );
}
