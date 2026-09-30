"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, SourceLinks } from "@/components/ui";
import type { DirectoryCard } from "@/lib/view";

export function Directory({ cards }: { cards: DirectoryCard[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return cards;
    return cards.filter((c) => c.name.toLowerCase().includes(t) || c.interests.some((i) => i.toLowerCase().includes(t)) || c.oneLiner.toLowerCase().includes(t));
  }, [q, cards]);
  return (
    <>
      <label htmlFor="q" className="sr-only">
        Search people or interests
      </label>
      <input
        id="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or interest (e.g. magic, wine, running)…"
        className="mt-5 w-full rounded-full border border-line bg-paper px-4 py-2.5 text-[15px] outline-none focus:border-green md:w-[28rem]"
      />
      <p className="mt-2 text-xs text-muted">
        Showing {filtered.length} of {cards.length}
      </p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <li key={c.personId} className="fade-in flex flex-col rounded-2xl border border-line bg-paper p-4 transition hover:shadow-md">
            <div className="flex items-center gap-3">
              <Avatar name={c.name} />
              <div className="min-w-0">
                <p className="font-display truncate text-lg font-semibold">{c.name}</p>
                <SourceLinks linkedin={c.linkedinUrl} instagram={c.instagramUrl} compact />
              </div>
            </div>
            <p className="mt-3 text-sm leading-snug">{c.oneLiner}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.interests.map((i) => (
                <span key={i} className="rounded-full bg-ivory px-2.5 py-1 text-xs">
                  {i}
                </span>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between pt-4">
              <span className="text-xs text-muted">{c.quality === "two_source" ? "Two-source" : "Limited"} · {c.claims} cited claims</span>
              <Link href={`/people/${c.slug}`} className="rounded-full bg-green px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Meet the agent
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
