# Second Self — your agent goes on the first date ♥

**Live site:** https://second-self-theta.vercel.app · **Finished example:** https://second-self-theta.vercel.app/demo · **Code:** this repo

Second Self turns one person's **public LinkedIn + public Instagram** into an evidence-cited profile and an AI agent. Agents go on
simulated first dates with each other — meet, negotiate a real plan, adapt when it falls apart — then each agent privately judges the
fit. Every person gets an explained, deterministic ranking of who fits them best.

> AI agents inspired by public profiles. Conversations and fit scores are simulated. The real people did not participate or consent,
> and nothing implies anyone is single or interested.

## What you can do on the site

| Page | What it shows |
|---|---|
| `/` | Paste a LinkedIn `/in/` URL + a public Instagram URL → your agent is built live |
| `/try/:id` | Live pipeline: LinkedIn collected → Instagram collected → public/identity checks → analysis → profile → **Let my agent date** |
| `/demo` | The finished experiment: 25 real people, both official links each, searchable by name/interest |
| `/people/:slug` | Profile: needs, hobbies, interests, priorities, lifestyle, communication style, unknowns, starters — every claim `observed`/`tentative` with clickable evidence codes (exact excerpt, source link, date) |
| `/dates/:id` | Date room: Meet / Plan / Adapt, alternating turns with action + "why this move" + evidence, live plan card, two private verdicts; **Replay / Pause / Show all**; "Live agent run" while running |
| `/rankings/:slug` | Directional, reverse and mutual fit for all 24 candidates, with strongest connection + concern, linked to each date |
| `/runs/:slug` | A visitor's private run: their agent × all 25 demo agents (25 new dates), live progress, then their ranking |
| `/how-it-works` | Architecture, scoring formula, limits |

## Tech stack

- **Next.js 16 (App Router) + Tailwind v4 + TypeScript**, deployed on **Vercel** (free Hobby, region `sin1`).
- **Neon Postgres** (free) with **Drizzle** migrations (`drizzle/`). JSONB for validated artifacts.
- **Scraping: Apify REST API** (server-side only):
  - LinkedIn → `harvestapi/linkedin-profile-scraper` (no cookies): headline, about, experience (+descriptions), education (+activities), volunteering, honors, publications, projects, languages, skills, causes, websites.
  - Instagram → `apify/instagram-profile-scraper`: bio, explicit `private` flag, external links, 12 latest posts with captions, owners, timestamps, URLs.
  - Runs are started asynchronously and their run IDs persisted, so a crashed step resumes polling the same paid collection. Records are matched to people by returned identity (LinkedIn public identifier / Instagram username), never by array position.
- **LLMs via Featherless.ai** (OpenAI-compatible, streamed, JSON-schema constrained, server-validated with Zod):
  - Profile analysis: `moonshotai/Kimi-K2.6` (thinking disabled).
  - Date turns + assessments: `Qwen/Qwen3.8-Flash-Next` (thinking disabled).
  - The served model ID is stored with every profile, turn and assessment.

## How it works

1. **Two links in.** Only HTTPS `linkedin.com/in/…` and `instagram.com/<handle>` are accepted (regional LinkedIn hosts normalized; lookalike hosts, post/reel links, credentials, ports rejected). We never fetch arbitrary URLs — only a canonical slug/handle goes to the provider (no SSRF surface).
2. **Two-source boundary.** Only the person's own content is kept: collab posts owned by other accounts, comments, recommendations, followed pages and follower counts are dropped; emails/phone numbers are stripped.
3. **Public & identity checks.** Private Instagram → blocked. Identity is `cross_linked` (one account links to/names the other) or `corroborated` (matching name + ≥2 consistent self-described details: shared personal site, organization, title, phrase, city). Otherwise it's ambiguous: the seed cohort excludes it; a visitor may confirm both accounts are theirs and the profile is labeled **Submitter-confirmed**, never "verified". For the seed cohort, 8 pairs with only one automatic signal were manually inspected and accepted with ≥2 recorded excerpts each (stored in `people.identity`).
4. **Evidence + analysis.** Every excerpt becomes an immutable evidence item (`L1…`, `I1…`, keyed by snapshot). The analyst writes claims (interest, hobby, priority, lifestyle, need, communication, background), each `observed` or `tentative`, citing evidence IDs. The server drops claims citing nonexistent IDs, rejects outputs with too few valid claims, and filters sensitive inferences (relationship status, family, orientation, religion, health, ethnicity, age, looks, gendered pronouns). Needs are never invented: "Relationship needs are not stated" is shown when true.
5. **Agent card.** Derived deterministically from the accepted profile (no extra model call): sourced interests, priorities, tentative preferences, unknowns, evidence. The *public intro* the other agent sees contains only observed interests and background.
6. **The date (the agentic part).** One cohort-wide scenario — *a first date with two hours available* — and one complication in act 3 — *the outdoor portion is unavailable*. Six turns, three acts (Meet → Plan → Adapt), 35–65 words, ≤1 question, actions `ask | answer | propose | clarify | adapt | decline`. **Each model call generates exactly one agent's turn** from its own card, the other's public intro and the saved transcript; the next agent reacts to that saved turn. Speaking order is balanced (in the 25-person cohort everyone opens exactly 12 of 24 dates). Validators enforce length, one question, own-evidence-only citations and no sensitive topics; inline citations are moved into `evidence_ids`.
7. **Private verdicts.** After six turns each agent independently rates the other (never seeing the other's verdict): interest alignment 30%, priority & lifestyle 25%, conversational reciprocity 25%, plan negotiation 20% — each 0–4 or `unknown`, with rationale and claim/turn references (known ratings without valid references become unknown).
8. **Deterministic ranking.** `K = Σ weights of known dimensions`, `raw = 25·Σ(w·r)/K`, `index = 50 + K·(raw − 50)` (unknown ≠ zero; incomplete assessments shrink toward neutral). A→B and B→A are kept; **mutual = min**. Order: directional desc → mutual → coverage → stable id. Incomplete pairs are listed as pending/failed and never ranked or scored. No model ever writes a rank.

### Durable jobs without an always-on worker (deviation from the original Railway + pg-boss plan)

Free hosting (Vercel Hobby) has no background worker, so the pipeline is a **persisted, resumable state machine in Postgres**:
people `submitted → collecting → verifying → analyzing → ready` (or `blocked_private | blocked_identity | insufficient_data | failed`),
dates `queued → running → assessing → completed` (or `retrying | failed`). Work is claimed with **leases** (`UPDATE … FOR UPDATE SKIP LOCKED`),
turns have a unique `(date_id, turn_index)` key, so concurrent or repeated ticks never duplicate a turn and a crash resumes at the next
missing step. On Vercel, short server ticks (`POST /api/people/:id/advance`, `POST /api/runs/:id/advance`, `maxDuration 300`) drive the work
while the visitor's page is open (reload resumes). The 300-date demo was driven by the same code from the CLI (`scripts/admin.ts advance`),
with two workers sharing the run safely through leases.

## The demo cohort (measured)

- 44 candidates were collected through the pipeline; 25 were accepted (private Instagram, missing LinkedIn, and weak identity evidence were excluded — see `people.status`).
- 25 people → **300 unordered pairs**, 6 turns + 2 assessments each (1,800 turns, 600 assessments), 24 ranked candidates per person.
- Apify free-plan limits hit and handled: max 5 concurrent runs, max 10 LinkedIn profiles per run → batched seed collection in chunks.
- Latency measured on Featherless: date turns ~6–14 s, assessments ~20–26 s, profile analysis ~40–55 s; transient empty responses under load are retried (≤3 attempts per call) and never produce fabricated scores.

### Known limitations (measured by `scripts/audit.ts`)

- Audit: 25 members, 300/300 dates, 1,800 turns, 600 assessments, 24 per person, no duplicate/self pairs, everyone opens 12 dates — PASS.
- In the published demo, 195 of 600 assessments rated every dimension `unknown` (the assessor used "unknown" where its rationale described a mismatch), so those rows are listed as "score unknown" rather than ranked — never given a fabricated score. Fixed for new runs (`date-v2`): reciprocity and plan negotiation are always rated from the transcript, and a rationale that misreads the transcript is rejected and retried.
- The demo profiles contain no explicit "need" claims (needs are shown as "Relationship needs are not stated"); the analyzer (`analyzer-v2`) now writes 2-3 labeled need hypotheses for new profiles.
- Featherless meters concurrency (100 units; these models cost 4 per request): keep total in-flight requests ≤ 25.

## API

`POST /api/people` · `GET /api/people/:id` · `POST /api/people/:id/advance|confirm|retry` · `POST /api/runs` · `GET /api/runs/:id` ·
`POST /api/runs/:id/advance` · `GET /api/dates/:id` · `POST /api/admin/publish/:runId` (header `x-admin-secret`, completeness audit) · `GET /api/health`.
Visitor sessions are an opaque random token in an HttpOnly SameSite cookie (only a salted hash is stored); unpublished people/runs are
visible only to their session. Quotas (per session/hour, per IP/day, global daily scrape and model caps) are persisted in Postgres.

## Run it yourself

```bash
cp .env.example .env            # DATABASE_URL, APIFY_TOKEN, FEATHERLESS_API_KEY, SESSION_SECRET, ADMIN_SECRET
npm install
npx tsx scripts/migrate.ts      # apply Drizzle migrations
npm run dev                     # http://localhost:3000
# seed cohort (same pipeline as visitors):
npx tsx scripts/admin.ts import roster.json      # [{ "linkedin": "...", "instagram": "..." }]
npx tsx scripts/admin.ts batch                   # batched collection for pending sources
npx tsx scripts/admin.ts run cohort-25 "25 people, 300 first dates" slug1,slug2,...
npx tsx scripts/admin.ts advance cohort-25 60    # run all dates (safe to run several workers)
npx tsx scripts/progress.ts cohort-25
node scripts/record-video.mjs all && node scripts/record-video.mjs concat   # the submission video
```

## Limits, ethics, privacy

- A labeled simulation of conversational and lifestyle fit. No gender/orientation filtering: all pairs are compared.
- Scores are design heuristics, not validated measurements or probabilities.
- Raw scraper payloads stay private in the database; the site serves only short excerpts, claims and simulation outputs. `.env` and the candidate ledger are not in git.
- Removal requests: open an issue on this repository.
