// Records the submission video from the LIVE site with on-screen captions.
// Segments are separate recordings (so the ~1 min fresh-analysis wait is cut, and labeled as such),
// then concatenated with ffmpeg into recordings/second-self-demo.mp4.
//   node scripts/record-video.mjs <segment|all>
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SITE ?? "https://second-self-theta.vercel.app";
const OUT = path.resolve("recordings");
const SIZE = { width: 1440, height: 900 };
const FRESH = { linkedin: "https://www.linkedin.com/in/estherperel/", instagram: "https://www.instagram.com/estherperelofficial/" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:1100px;padding:14px 22px;border-radius:16px;background:rgba(45,27,38,.92);color:#fff;font:600 22px/1.35 system-ui,Segoe UI,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25);pointer-events:none";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function smoothScroll(page, dy, steps = 30, pause = 40) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(pause);
  }
}

async function segment(browser, name, fn, cookies) {
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: path.join(OUT, "tmp"), size: SIZE }, deviceScaleFactor: 1 });
  if (cookies) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  let result;
  try {
    result = await fn(page, ctx);
  } finally {
    const video = page.video();
    await ctx.close();
    const file = await video.path();
    renameSync(file, path.join(OUT, `${name}.webm`));
    console.log("recorded", name);
  }
  return result;
}

async function api(cookies, method, url, body) {
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const r = await fetch(BASE + url, { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

async function main() {
  const which = process.argv[2] ?? "all";
  const browser = await chromium.launch();
  const meta = existsSync(path.join(OUT, "meta.json")) ? JSON.parse(await (await import("node:fs/promises")).readFile(path.join(OUT, "meta.json"), "utf8")) : {};

  if (which === "all" || which === "a") {
    await segment(browser, "01-landing-directory", async (page) => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await caption(page, "Second ♥ Self — every real person is represented by an AI agent built ONLY from their public LinkedIn + Instagram");
      await sleep(5000);
      await page.click("text=Explore the completed experiment");
      await page.waitForURL("**/demo");
      await page.waitForLoadState("networkidle");
      await caption(page, "The finished experiment: 25 real people, both official links each — every agent dates every other agent (300 dates)");
      await sleep(2500);
      await smoothScroll(page, 900, 40, 60);
      await sleep(1500);
      await page.fill("#q", "marathon");
      await caption(page, "Searchable by name or evidence-backed interest");
      await sleep(2500);
      await page.fill("#q", "");
      await smoothScroll(page, -900, 20, 30);
      await sleep(600);
    });
  }

  if (which === "all" || which === "b") {
    await segment(browser, "02-profile-evidence", async (page) => {
      await page.goto(BASE + "/people/aliabdaal", { waitUntil: "networkidle" });
      await caption(page, "How an agent reads a person: an overview grounded in cited LinkedIn (L) and Instagram (I) excerpts");
      await sleep(4500);
      await smoothScroll(page, 520, 25, 50);
      await caption(page, "Interests, hobbies, priorities, lifestyle — each marked OBSERVED or TENTATIVE, each citing its evidence");
      await sleep(3500);
      const chip = page.locator("button[aria-label^='Open evidence']").nth(3);
      await chip.click();
      await caption(page, "Click any code → the exact verbatim excerpt, the source link and the date it was collected");
      await sleep(4500);
      await page.keyboard.press("Escape");
      await smoothScroll(page, 700, 30, 50);
      await caption(page, "Needs are never invented: “Relationship needs are not stated” — plus tentative hypotheses and unknowns to explore");
      await sleep(4500);
      await smoothScroll(page, 500, 25, 50);
      await caption(page, "The agent's plan: grounded conversation starters, date ideas and the unknowns it will try to resolve on the date");
      await sleep(4000);
    });
  }

  if (which === "all" || which === "c") {
    const res = await segment(browser, "03-fresh-links", async (page, ctx) => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await caption(page, "Try it live: paste a fresh public LinkedIn + Instagram (not in the demo)");
      await page.fill("#li", FRESH.linkedin, { timeout: 5000 });
      await sleep(600);
      await page.fill("#ig", FRESH.instagram);
      await sleep(1200);
      await page.click("text=Build my agent");
      await page.waitForURL("**/try/**", { timeout: 30000 });
      await caption(page, "Live pipeline: Apify collects both sources → public + identity checks → evidence-cited analysis");
      await sleep(14000);
      const personId = page.url().split("/try/")[1];
      return { personId, cookies: await ctx.cookies() };
    });
    meta.fresh = res;
    writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta));
  }

  if (which === "all" || which === "d") {
    const { personId, cookies } = meta.fresh;
    // Off camera: let the saved pipeline finish (the recorded page was already driving it).
    for (let i = 0; i < 40; i++) {
      const s = await api(cookies, "GET", `/api/people/${personId}`);
      console.log("fresh status", s.status);
      if (s.status === "ready") break;
      if (s.status === "blocked_identity") await api(cookies, "POST", `/api/people/${personId}/confirm`);
      await api(cookies, "POST", `/api/people/${personId}/advance`);
      await sleep(3000);
    }
    await segment(
      browser,
      "04-fresh-profile-dating",
      async (page) => {
        await page.goto(BASE + `/try/${personId}`, { waitUntil: "networkidle" });
        await caption(page, "…collection + analysis completed (≈1 min, cut). The fresh profile, built live from the two pasted links");
        await sleep(4500);
        await smoothScroll(page, 600, 25, 50);
        await sleep(2500);
        await page.locator("text=Let my agent date").scrollIntoViewIfNeeded();
        await caption(page, "Now let this new agent date all 25 demo agents — a private run of 25 new dates");
        await sleep(2500);
        await page.click("text=Let my agent date");
        await page.waitForURL("**/runs/**", { timeout: 30000 });
        await caption(page, "Live agent run: every date is 6 alternating turns by two independent agents, then two private verdicts");
        await sleep(9000);
        const link = page.locator("a[href^='/dates/']").first();
        await link.click();
        await page.waitForURL("**/dates/**");
        await caption(page, "LIVE date room: one model call per turn — each agent sees only its own card, the other's public intro and the transcript");
        await sleep(12000);
      },
      cookies,
    );
  }

  if (which === "all" || which === "e") {
    const dateId = process.env.REPLAY_DATE;
    await segment(browser, "05-replay-date", async (page) => {
      await page.goto(BASE + `/dates/${dateId}`, { waitUntil: "networkidle" });
      await caption(page, "A completed date from the 300 — replayed turn by turn (saved turns, no new inference)");
      await sleep(2500);
      await page.click("text=▶ Replay");
      await sleep(2800);
      await caption(page, "Act 1 · Meet — grounded openers that cite each person's real evidence");
      await sleep(5200);
      await smoothScroll(page, 300, 15, 40);
      await caption(page, "Act 2 · Plan — agents propose, counter-propose or decline a concrete plan; the plan card updates only when a turn changes it");
      await sleep(5400);
      await smoothScroll(page, 350, 15, 40);
      await caption(page, "Act 3 · Adapt — the outdoor part is cancelled; do both agents adapt?");
      await sleep(5600);
      await smoothScroll(page, 700, 30, 40);
      await caption(page, "Two independent private verdicts (A about B, B about A) — scored on 4 dimensions with reasons");
      await sleep(5000);
      await smoothScroll(page, 450, 20, 40);
      await caption(page, "Mutual fit = the lower score: one agent's enthusiasm can't erase the other's hesitation");
      await sleep(4500);
    });
  }

  if (which === "all" || which === "f") {
    await segment(browser, "06-rankings", async (page) => {
      await page.goto(BASE + "/rankings/aliabdaal", { waitUntil: "networkidle" });
      await caption(page, "Every person gets a ranking of who fits them best — directional, reverse and mutual fit, with the reason and the concern");
      await sleep(5500);
      await smoothScroll(page, 650, 30, 50);
      await caption(page, "All 24 candidates, deterministic arithmetic (no model writes the order), each linked to its date transcript");
      await sleep(4000);
      await smoothScroll(page, -650, 20, 30);
      await page.selectOption("select", { label: "Mel Robbins" });
      await page.waitForURL("**/rankings/melrobbins");
      await page.waitForLoadState("networkidle");
      await caption(page, "Switch person: Mel's ranking differs — each agent judges from its own person's priorities");
      await sleep(4500);
      await page.locator("text=Watch the date →").first().click();
      await page.waitForURL("**/dates/**");
      await page.click("text=Show all");
      await smoothScroll(page, 1500, 30, 40);
      await caption(page, "…and every score links back to the actual date that produced it");
      await sleep(4000);
    });
  }

  if (which === "all" || which === "g") {
    await segment(browser, "07-how-it-works", async (page) => {
      await page.goto(BASE + "/how-it-works", { waitUntil: "networkidle" });
      await caption(page, "Stack: Apify scrapers → Neon Postgres (evidence store) → Kimi K2.6 analysis → Qwen3.8 agents → deterministic ranking · Next.js on Vercel");
      await sleep(4500);
      await smoothScroll(page, 900, 30, 50);
      await caption(page, "Live site: second-self-theta.vercel.app · Demo: /demo · Code: github.com/23f2001033/Agents-Dating-");
      await sleep(4500);
    });
  }
  await browser.close();
}

function concat() {
  const ff = process.env.FFMPEG ?? "ffmpeg";
  const files = readdirSync(OUT).filter((f) => /^\d\d-.*\.webm$/.test(f)).sort();
  writeFileSync(path.join(OUT, "list.txt"), files.map((f) => `file '${path.join(OUT, f).replace(/\\/g, "/")}'`).join("\n"));
  execFileSync(ff, ["-y", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "list.txt"), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-r", "30", "-an", path.join(OUT, "second-self-demo.mp4")], { stdio: "inherit" });
  const dur = execFileSync(ff.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(OUT, "second-self-demo.mp4")]).toString().trim();
  console.log("video duration (s):", dur);
}

if (process.argv[2] === "concat") concat();
else main().then(() => rmSync(path.join(OUT, "tmp"), { recursive: true, force: true })).catch((e) => {
  console.error(e);
  process.exit(1);
});
