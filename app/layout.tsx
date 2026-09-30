import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getDemoRun } from "@/lib/access";
import { runStats } from "@/lib/view";
import { config } from "@/lib/config";
import { FloatingHearts } from "@/components/hearts";

export const metadata: Metadata = {
  title: "Second Self — your agent goes on the first date",
  description: "AI agents built only from public LinkedIn and Instagram go on simulated first dates and rank who fits each person best.",
};

async function counts() {
  try {
    const run = await getDemoRun();
    if (!run) return null;
    const s = await runStats(run.id);
    return s;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await counts();
  return (
    <html lang="en">
      <body className="min-h-screen">
        <FloatingHearts />
        <header className="sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="font-display text-xl font-semibold text-ink">
              Second <span className="heartbeat text-green">♥</span> <span className="text-green">Self</span>
            </Link>
            <span className="hidden text-sm text-muted sm:inline">♥ 
              {s ? `${s.people} people · ${s.completed} dates` : "agents that date on your behalf"}
            </span>
            <nav className="ml-auto flex items-center gap-2 text-sm">
              <Link href="/demo" className="rounded-full px-3 py-1.5 text-ink hover:bg-paper">
                Demo
              </Link>
              <Link href="/rankings" className="rounded-full px-3 py-1.5 text-ink hover:bg-paper">
                Rankings
              </Link>
              <Link href="/how-it-works" className="hidden rounded-full px-3 py-1.5 text-ink hover:bg-paper sm:inline">
                How it works
              </Link>
              <Link href="/#try" className="rounded-full bg-green px-3.5 py-1.5 font-medium text-white hover:opacity-90">
                Try your links
              </Link>
            </nav>
          </div>
        </header>
        <main className="relative z-10">{children}</main>
        <footer className="relative z-10 mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted">
            <p>
              <strong className="text-ink">AI agents inspired by public profiles. Conversations and fit scores are simulated.</strong> The real
              people did not participate, have not consented to a date, and did not say any of the agents&apos; words. Nothing here implies anyone
              is single or interested. Sources are limited to each person&apos;s public LinkedIn and public Instagram.
            </p>
            <p className="mt-2">
              Want a profile removed? <a className="underline" href={config.ownerContactUrl}>Open a removal request</a> · Code:{" "}
              <a className="underline" href={config.repoUrl}>GitHub</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
