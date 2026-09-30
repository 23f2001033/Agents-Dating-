import Link from "next/link";
import { Avatar } from "@/components/ui";
import type { RankingRow } from "@/lib/view";

function fit(v: number | null | undefined) {
  return v == null ? "—" : String(Math.round(v));
}

export function RankingView({ name, rows, unranked, completed, total, final }: { name: string; rows: RankingRow[]; unranked: RankingRow[]; completed: number; total: number; final: boolean }) {
  const first = name.split(" ")[0];
  const top = rows.slice(0, 3);
  return (
    <div>
      <p className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${final ? "bg-green-soft text-green" : "bg-terra-soft text-terra"}`}>
        {final ? "Final" : "Provisional"} · {completed}/{total} dates completed{final ? "" : " — incomplete pairs are excluded from ordering"}
      </p>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        <strong className="text-ink">Directional fit</strong> is {first}&apos;s agent&apos;s private score for that person (the ranking order).{" "}
        <strong className="text-ink">Reverse fit</strong> is that person&apos;s agent&apos;s score for {first}. <strong className="text-ink">Mutual</strong> is the lower of the two.
        Scores are simulated fit out of 100 — not a probability of love.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {top.map((r) => (
          <article key={r.dateId} className="fade-in rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center gap-3">
              <span className="font-display text-3xl font-semibold text-terra">#{r.rank}</span>
              <Avatar name={r.counterpartName} size={40} />
              <Link href={`/people/${r.counterpartSlug}`} className="font-display text-lg font-semibold leading-tight hover:underline">
                {r.counterpartName}
              </Link>
            </div>
            <div className="mt-3 flex gap-3 text-center">
              <div>
                <p className="font-display text-3xl font-semibold text-green">{fit(r.forward?.score)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">directional</p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold">{fit(r.reverse?.score)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">reverse</p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold text-muted">{fit(r.mutual)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">mutual</p>
              </div>
            </div>
            <p className="mt-3 text-sm">
              <span className="font-semibold text-green">Why:</span> {r.forwardAssessment?.strongestConnection}
            </p>
            <p className="mt-1 text-sm">
              <span className="font-semibold text-terra">Concern / unknown:</span> {r.forwardAssessment?.concern}
            </p>
            <p className="mt-2 text-xs text-muted">
              Evidence coverage {Math.round((r.forward?.coverage ?? 0) * 100)}% · second date: {r.forwardAssessment?.secondDate} (their side: {r.reverseAssessment?.secondDate ?? "—"})
            </p>
            <Link href={`/dates/${r.dateId}`} className="mt-3 inline-block text-sm font-medium text-green underline">
              Watch the date →
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Person</th>
              <th className="px-2 py-3 text-center">Directional</th>
              <th className="px-2 py-3 text-center">Reverse</th>
              <th className="px-2 py-3 text-center">Mutual</th>
              <th className="px-4 py-3">Strongest connection · concern</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dateId} className="border-b border-line/70 align-top last:border-0">
                <td className="px-4 py-3 font-display text-lg font-semibold">{r.rank}</td>
                <td className="px-4 py-3">
                  <Link href={`/people/${r.counterpartSlug}`} className="font-medium hover:underline">
                    {r.counterpartName}
                  </Link>
                  <p className="text-xs text-muted">{r.counterpartOneLiner}</p>
                </td>
                <td className="px-2 py-3 text-center font-mono font-semibold text-green">{fit(r.forward?.score)}</td>
                <td className="px-2 py-3 text-center font-mono">{fit(r.reverse?.score)}</td>
                <td className="px-2 py-3 text-center font-mono text-muted">{fit(r.mutual)}</td>
                <td className="px-4 py-3 text-xs">
                  <p>+ {r.forwardAssessment?.strongestConnection}</p>
                  <p className="mt-1 text-muted">− {r.forwardAssessment?.concern}</p>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/dates/${r.dateId}`} className="text-green underline">
                    transcript
                  </Link>
                </td>
              </tr>
            ))}
            {unranked.map((r) => (
              <tr key={r.dateId} className="border-b border-line/70 text-muted last:border-0">
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">{r.counterpartName}</td>
                <td colSpan={4} className="px-4 py-3 text-xs">
                  {r.status === "completed" ? "Score unknown (no supported dimensions)" : r.status === "failed" ? "Date failed — excluded, no fabricated score" : `Date ${r.status} — not ranked yet`}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/dates/${r.dateId}`} className="underline">
                    view
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
