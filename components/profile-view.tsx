import { EvidenceChips, EvidenceProvider, type Ev } from "@/components/evidence";
import { Avatar, IdentityBadge, QualityBadge, Section, SourceLinks } from "@/components/ui";
import type { Claim, Profile, AgentCard } from "@/lib/analysis/profile";
import type { IdentityResult } from "@/lib/sources/identity";
import type { Coverage, Person, ProfileVersion, PublicEvidence } from "@/lib/view";

const CAT_LABEL: Record<string, string> = {
  interest: "Interests",
  hobby: "Hobbies",
  priority: "Priorities & values",
  lifestyle: "Lifestyle signals",
  need: "Needs",
  communication: "Communication style",
  background: "Background",
};

function ClaimItem({ c, ns }: { c: Claim; ns: string }) {
  return (
    <li className="flex gap-2 py-1.5 text-[15px] leading-snug">
      <span
        className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.basis === "observed" ? "bg-green-soft text-green" : "bg-terra-soft text-terra"}`}
        title={c.basis === "observed" ? "Directly supported by the person's own words" : "A labeled hypothesis beyond what is literally stated"}
      >
        {c.basis}
      </span>
      <span>
        {c.text}
        <EvidenceChips ns={ns} ids={c.evidence} basis={c.basis} claim={c.text} />
      </span>
    </li>
  );
}

function ClaimGroup({ title, claims, ns, empty }: { title: string; claims: Claim[]; ns: string; empty?: string }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {claims.length ? (
        <ul className="mt-1">
          {claims.map((c) => (
            <ClaimItem key={c.id} c={c} ns={ns} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{empty ?? "Nothing supported by the sources."}</p>
      )}
    </div>
  );
}

export function ProfileView({ person, pv, evidence, footer }: { person: Person; pv: ProfileVersion; evidence: Record<string, PublicEvidence>; footer?: React.ReactNode }) {
  const profile = pv.profile as Profile;
  const card = pv.agentCard as AgentCard;
  const coverage = pv.coverage as Coverage;
  const identity = person.identity as (IdentityResult & { attested?: boolean }) | null;
  const ns = "p";
  const evMap: Record<string, Ev> = Object.fromEntries(Object.entries(evidence).map(([k, v]) => [`${ns}:${k}`, v]));
  const by = (cats: string[]) => profile.claims.filter((c) => cats.includes(c.category));
  const needs = by(["need"]);
  const liCount = Object.values(evidence).filter((e) => e.platform === "linkedin").length;
  const igCount = Object.values(evidence).filter((e) => e.platform === "instagram").length;
  const name = person.displayName ?? person.slug;

  return (
    <EvidenceProvider evidence={evMap}>
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <Avatar name={name} size={72} />
          <div className="flex-1">
            <h1 className="font-display text-4xl font-semibold leading-tight">{name}</h1>
            <p className="mt-1 text-lg text-muted">{profile.oneLiner}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SourceLinks linkedin={person.linkedinUrl} instagram={person.instagramUrl} />
              <QualityBadge quality={pv.quality} />
              {identity && <IdentityBadge status={identity.attested ? "ambiguous" : identity.status} />}
            </div>
            <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-muted">
              <strong className="text-ink">Source coverage:</strong> {coverage.line} · {liCount} LinkedIn + {igCount} Instagram evidence items ·
              analyzed by {pv.model}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-paper p-5">
          <p className="font-display text-lg leading-relaxed">{profile.overview}</p>
          <p className="mt-2 text-xs text-muted">
            Grounded in <EvidenceChips ns={ns} ids={profile.overviewEvidence.slice(0, 8)} claim="Overview" />
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Section title="What the sources say" aside={<span className="text-xs text-muted">click a code to see the exact excerpt</span>}>
              <ClaimGroup title={CAT_LABEL.interest} claims={by(["interest"])} ns={ns} />
              <ClaimGroup title={CAT_LABEL.hobby} claims={by(["hobby"])} ns={ns} />
              <ClaimGroup title={CAT_LABEL.priority} claims={by(["priority"])} ns={ns} />
              <ClaimGroup title={CAT_LABEL.lifestyle} claims={by(["lifestyle"])} ns={ns} />
              <ClaimGroup title={CAT_LABEL.communication} claims={by(["communication"])} ns={ns} />
              <ClaimGroup title={CAT_LABEL.background} claims={by(["background"])} ns={ns} />
            </Section>
            <Section title="Needs">
              <p className={`rounded-lg px-3 py-2 text-sm ${profile.needsStated ? "bg-green-soft text-green" : "bg-terra-soft text-terra"}`}>
                {profile.needsStated ? "Some needs are explicitly stated in the sources." : profile.needsNote}
              </p>
              <ClaimGroup title="Stated needs and tentative agent hypotheses" claims={needs} ns={ns} empty="The agent did not form any need hypotheses from these sources." />
            </Section>
          </div>
          <div className="space-y-6">
            <Section title="How the agent will approach a date">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Conversation starters</h3>
              <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-[15px]">
                {profile.starters.map((s, i) => (
                  <li key={i}>
                    {s.text}
                    <EvidenceChips ns={ns} ids={s.evidence} claim={s.text} basis="tentative" />
                  </li>
                ))}
              </ol>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Date ideas it may suggest (simulation preferences)</h3>
              <ul className="mt-1 space-y-1.5 text-[15px]">
                {profile.dateIdeas.map((d, i) => (
                  <li key={i}>
                    • {d.idea}
                    <EvidenceChips ns={ns} ids={d.evidence} claim={d.idea} basis="tentative" />
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Its private objective</h3>
              <p className="mt-1 text-sm">
                Explore fit and reduce uncertainty for {card.firstName} — not to win or flatter. It separates “{card.firstName}&apos;s sources say…” from “for this
                date I&apos;d suggest…”, cites evidence, and admits what the profiles don&apos;t say.
              </p>
            </Section>
            <Section title="Unknowns the agent will explore">
              <ul className="space-y-2 text-[15px]">
                {profile.unknowns.map((u, i) => (
                  <li key={i}>
                    <span className="font-medium">{u.question}</span>
                    <span className="block text-sm text-muted">{u.why}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Source agreement & limits">
              {profile.sourceAgreement && <p className="text-sm">{profile.sourceAgreement}</p>}
              <p className="mt-2 text-sm text-muted">{profile.limitations}</p>
              {identity && identity.signals?.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Why we believe both accounts are the same person</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {identity.signals.map((s, i) => (
                      <li key={i}>{s.detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          </div>
        </div>

        <details className="mt-6 rounded-2xl border border-line bg-paper p-5">
          <summary className="cursor-pointer font-display text-lg font-semibold">All evidence ({liCount + igCount} excerpts)</summary>
          <ul className="mt-3 divide-y divide-line">
            {Object.values(evidence).map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <span className={`mr-2 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${e.platform === "linkedin" ? "bg-[#e3ecf5] text-[#1d4f7a]" : "bg-[#f7e6ef] text-[#8a2d5c]"}`}>{e.id}</span>
                <span className="text-muted">{e.label}:</span> {e.excerpt.length > 280 ? e.excerpt.slice(0, 280) + "…" : e.excerpt}{" "}
                <a className="text-green underline" href={e.url} target="_blank" rel="noopener noreferrer">
                  source
                </a>
              </li>
            ))}
          </ul>
        </details>
        {footer}
      </div>
    </EvidenceProvider>
  );
}
