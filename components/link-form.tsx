"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LinkForm() {
  const router = useRouter();
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ linkedin, instagram }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      router.push(j.demoMember ? `/people/${j.slug}` : `/try/${j.personId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form id="try" onSubmit={submit} className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
      <p className="font-display text-xl font-semibold">Try your links</p>
      <p className="mt-1 text-sm text-muted">One public LinkedIn profile and the public Instagram that belongs to the same person.</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="li">
        LinkedIn profile URL
      </label>
      <input
        id="li"
        required
        value={linkedin}
        onChange={(e) => setLinkedin(e.target.value)}
        placeholder="https://www.linkedin.com/in/your-name"
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-green"
        autoComplete="off"
      />
      <label className="mt-3 block text-sm font-medium" htmlFor="ig">
        Instagram profile URL (public account)
      </label>
      <input
        id="ig"
        required
        value={instagram}
        onChange={(e) => setInstagram(e.target.value)}
        placeholder="https://www.instagram.com/yourhandle/"
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-green"
        autoComplete="off"
      />
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-terra-soft px-3 py-2 text-sm text-terra">
          {error}
        </p>
      )}
      <button disabled={busy} className="mt-4 w-full rounded-full bg-green px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60">
        {busy ? "Submitting…" : "Build my agent"}
      </button>
      <p className="mt-3 text-xs text-muted">
        We read only these two public accounts through a scraping provider — no passwords, no private profiles. Your agent then dates the 25 demo agents in a separate, private run.
      </p>
    </form>
  );
}
