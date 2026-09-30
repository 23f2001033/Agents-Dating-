import Link from "next/link";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const PALETTE = ["#315C47", "#A94735", "#8A6A1F", "#3F5E7A", "#6B4E71", "#5E6B3A"];
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length;
  return (
    <span
      className="font-display inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: PALETTE[idx], fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function SourceLinks({ linkedin, instagram, compact = false }: { linkedin: string; instagram: string; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <a href={linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#e3ecf5] px-2.5 py-1 text-xs font-semibold text-[#1d4f7a] hover:ring-1 hover:ring-[#1d4f7a]/40" aria-label="LinkedIn profile">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
        </svg>
        {!compact && "LinkedIn"}
      </a>
      <a href={instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#f7e6ef] px-2.5 py-1 text-xs font-semibold text-[#8a2d5c] hover:ring-1 hover:ring-[#8a2d5c]/40" aria-label="Instagram profile">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
        {!compact && "Instagram"}
      </a>
    </span>
  );
}

export function IdentityBadge({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    cross_linked: ["Cross-linked", "bg-green-soft text-green", "One account links to or names the other."],
    corroborated: ["Corroborated", "bg-green-soft text-green", "Matching name plus two or more consistent self-described details."],
    ambiguous: ["Submitter-confirmed", "bg-terra-soft text-terra", "Identity not established from the sources; the submitter confirmed both accounts are theirs."],
  };
  const [label, cls, title] = map[status] ?? ["Unverified", "bg-line text-muted", ""];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`} title={title}>
      Identity: {label}
    </span>
  );
}

export function QualityBadge({ quality }: { quality: string }) {
  return quality === "two_source" ? (
    <span className="rounded-full bg-green-soft px-2.5 py-1 text-xs font-semibold text-green" title="Substantive material from both LinkedIn and Instagram">
      Two-source analysis
    </span>
  ) : (
    <span className="rounded-full bg-terra-soft px-2.5 py-1 text-xs font-semibold text-terra" title="One source had little usable material">
      Limited profile
    </span>
  );
}

export function ScorePill({ label, value, tone = "ink" }: { label: string; value: number | null | undefined; tone?: "ink" | "green" | "terra" }) {
  const color = tone === "green" ? "text-green" : tone === "terra" ? "text-terra" : "text-ink";
  return (
    <span className="inline-flex flex-col items-center rounded-lg border border-line bg-paper px-3 py-1.5">
      <span className={`font-display text-xl font-semibold ${color}`}>{value == null ? "—" : Math.round(value)}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    </span>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Crumb({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-muted hover:text-ink">
      ← {children}
    </Link>
  );
}
