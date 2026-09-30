import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canViewPerson } from "@/lib/access";
import { getSession } from "@/lib/session";
import { ProfileView } from "@/components/profile-view";
import { StartDating, TryProgress } from "@/components/try-progress";
import { loadEvidenceForProfile, loadProfileVersion, toPublicEvidence } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function TryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [person] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  const session = await getSession();
  if (!person || !(await canViewPerson(person, session))) notFound();
  const pv = person.status === "ready" ? await loadProfileVersion(person.currentProfileId) : null;
  if (pv) {
    const evidence = toPublicEvidence(await loadEvidenceForProfile(pv));
    const first = (person.displayName ?? "Your").split(" ")[0];
    return (
      <>
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <p className="rounded-lg bg-green-soft px-4 py-2 text-sm text-green">Fresh analysis complete — built live from the two links you submitted.</p>
        </div>
        <ProfileView person={person} pv={pv} evidence={evidence} footer={<StartDating personId={person.id} firstName={first} />} />
      </>
    );
  }
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-terra">Your agent is reading</p>
      <h1 className="font-display mt-1 text-3xl font-semibold">Collecting two public sources</h1>
      <p className="mt-1 break-all text-sm text-muted">
        {person.linkedinUrl} · {person.instagramUrl}
      </p>
      <div className="mt-5">
        <TryProgress personId={person.id} />
      </div>
    </div>
  );
}
