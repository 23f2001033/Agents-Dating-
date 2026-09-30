"use client";

import { useRouter } from "next/navigation";

export function PersonSelect({ people, current, base }: { people: { slug: string; name: string }[]; current: string; base: string }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">Ranking for</span>
      <select value={current} onChange={(e) => router.push(`${base}/${e.target.value}`)} className="rounded-full border border-line bg-paper px-3 py-2 text-[15px] font-medium outline-none focus:border-green">
        {people.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
