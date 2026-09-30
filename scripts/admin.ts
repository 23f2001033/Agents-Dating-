// Admin CLI for the curated cohort. Uses exactly the same pipeline code as the website.
//   npx tsx scripts/admin.ts add <linkedinUrl> <instagramUrl>
//   npx tsx scripts/admin.ts import data/roster.json
//   npx tsx scripts/admin.ts people            # advance all unfinished people until terminal
//   npx tsx scripts/admin.ts status
//   npx tsx scripts/admin.ts show <slug>
//   npx tsx scripts/admin.ts run <slug> <title> <personSlug,...|--roster data/roster.json>
//   npx tsx scripts/admin.ts advance <runSlug> [minutes]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema, sql } from "../lib/db";
import { createPerson } from "../lib/people";
import { advancePerson, retryPerson, unfinishedPeople } from "../lib/jobs/person";
import { advanceRun, createCohortRun, runCounts } from "../lib/jobs/run";
import { startActorRun } from "../lib/sources/apify";
import { config } from "../lib/config";

const [cmd, ...args] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function advanceAllPeople(ids?: string[]) {
  for (let round = 0; round < 200; round++) {
    const open = await unfinishedPeople(ids);
    if (!open.length) break;
    console.log(`round ${round}: ${open.length} unfinished`);
    // Modest parallelism: provider runs + profile model pacing.
    for (let i = 0; i < open.length; i += 8) {
      await Promise.all(open.slice(i, i + 8).map((id) => advancePerson(id, { deadline: Date.now() + 240_000 })));
    }
    await sleep(3000);
  }
  await printStatus(ids);
}

async function printStatus(ids?: string[]) {
  const rows = await db
    .select({ slug: schema.people.slug, name: schema.people.displayName, status: schema.people.status, detail: schema.people.statusDetail, identity: schema.people.identity })
    .from(schema.people)
    .where(ids?.length ? inArray(schema.people.id, ids) : undefined)
    .orderBy(asc(schema.people.createdAt));
  for (const r of rows) {
    const idn = (r.identity as { status?: string; signals?: { detail: string }[] } | null) ?? null;
    console.log(`${r.status.padEnd(17)} ${r.slug.padEnd(28)} ${(r.name ?? "").padEnd(24)} id:${idn?.status ?? "-"} ${idn?.signals?.map((s) => s.detail).join(" | ").slice(0, 120) ?? ""} ${r.detail ?? ""}`);
  }
}

async function main() {
  if (cmd === "add") {
    const res = await createPerson({ linkedin: args[0], instagram: args[1], origin: "seed" });
    console.log(res);
    if (res.ok) await advanceAllPeople([res.personId]);
  } else if (cmd === "import") {
    const roster = JSON.parse(readFileSync(args[0], "utf8")) as { linkedin: string; instagram: string; name?: string }[];
    const ids: string[] = [];
    for (const r of roster) {
      const res = await createPerson({ linkedin: r.linkedin, instagram: r.instagram, origin: "seed" });
      if (res.ok) ids.push(res.personId);
      else console.log("REJECTED", r.name ?? r.linkedin, res.error);
    }
    await advanceAllPeople(ids);
  } else if (cmd === "batch") {
    // Batched seed collection: one provider run per platform for every pending snapshot.
    // Records are later matched to people by returned identity (slug/handle), never by position.
    const pend = await sql<{ id: string; platform: string; linkedin_url: string; instagram_handle: string }[]>`
      select s.id, s.platform, p.linkedin_url, p.instagram_handle from source_snapshots s join people p on p.id = s.person_id where s.status = 'pending'`;
    for (const platform of ["linkedin", "instagram"] as const) {
      const all = pend.filter((r) => r.platform === platform);
      // Provider free tier: max 10 profiles per LinkedIn run; max 5 concurrent runs per account.
      const size = platform === "linkedin" ? 10 : 40;
      for (let c = 0; c < all.length; c += size) {
      const rows = all.slice(c, c + size);
      const actor = platform === "linkedin" ? config.apifyLinkedinActor : config.apifyInstagramActor;
      const input = platform === "linkedin" ? { profileScraperMode: "Profile details no email ($4 per 1k)", queries: rows.map((r) => r.linkedin_url) } : { usernames: rows.map((r) => r.instagram_handle) };
      let run: Awaited<ReturnType<typeof startActorRun>> | null = null;
      for (let i = 0; i < 40 && !run; i++) {
        try {
          run = await startActorRun(actor, input, { timeoutSecs: 900 });
        } catch (e) {
          if (!String((e as Error).message).includes("402")) throw e;
          console.log(`${platform}: waiting for a free Apify run slot…`);
          await sleep(15_000);
        }
      }
      if (!run) throw new Error("could not start batch run");
      await sql`update source_snapshots set status = 'running', provider_run_id = ${run.id}, provider_dataset_id = ${run.defaultDatasetId}, started_at = now(), attempts = attempts + 1 where id in ${sql(rows.map((r) => r.id))}`;
      console.log(`${platform}: batch run ${run.id} for ${rows.length} accounts`);
      }
    }
    await advanceAllPeople();
  } else if (cmd === "retry-failed") {
    const failed = await sql<{ id: string }[]>`select id from people where status = 'failed'`;
    for (const f of failed) await retryPerson(f.id);
    console.log("requeued", failed.length);
  } else if (cmd === "people") {
    await advanceAllPeople();
  } else if (cmd === "status") {
    await printStatus();
  } else if (cmd === "show") {
    const [p] = await db.select().from(schema.people).where(eq(schema.people.slug, args[0]));
    const [pv] = p?.currentProfileId ? await db.select().from(schema.profileVersions).where(eq(schema.profileVersions.id, p.currentProfileId)) : [];
    console.log(JSON.stringify({ person: { ...p }, profile: pv?.profile, coverage: pv?.coverage, quality: pv?.quality, model: pv?.model }, null, 1));
  } else if (cmd === "run") {
    const [slug, title, list] = args;
    let slugs: string[];
    if (list === "--roster") {
      const roster = JSON.parse(readFileSync(args[3], "utf8")) as { linkedin: string; accepted?: boolean; slug?: string }[];
      slugs = roster.filter((r) => r.accepted !== false).map((r) => r.slug!).filter(Boolean);
    } else slugs = list.split(",");
    const people = await db.select().from(schema.people).where(inArray(schema.people.slug, slugs));
    const bySlug = new Map(people.map((p) => [p.slug, p]));
    const members = slugs.map((s) => {
      const p = bySlug.get(s);
      if (!p || p.status !== "ready" || !p.currentProfileId) throw new Error(`person ${s} is not ready`);
      return { personId: p.id, profileVersionId: p.currentProfileId };
    });
    const run = await createCohortRun(slug, title, members);
    console.log("created run", run.id, run.slug, "pairs:", run.expectedPairs);
  } else if (cmd === "advance") {
    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.slug, args[0]));
    const minutes = Number(args[1] ?? 30);
    const stopAt = Date.now() + minutes * 60_000;
    while (Date.now() < stopAt) {
      const res = await advanceRun(run.id, { deadline: Math.min(stopAt, Date.now() + 240_000), maxDates: Number(process.env.MAX_DATES ?? 40), concurrency: Number(process.env.LLM_CONCURRENCY ?? 8) });
      console.log(new Date().toISOString().slice(11, 19), res);
      if (res.status === "completed" || res.status === "partial") break;
    }
    console.log(await runCounts(run.id));
  } else {
    console.log("unknown command");
  }
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
