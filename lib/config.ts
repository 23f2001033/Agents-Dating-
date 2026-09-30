// Central runtime configuration. Server-only: never import from client components.

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  ownerContactUrl:
    process.env.OWNER_CONTACT_URL ?? "https://github.com/23f2001033/Agents-Dating-/issues",
  repoUrl: process.env.REPO_URL ?? "https://github.com/23f2001033/Agents-Dating-",

  // Models (Featherless.ai, OpenAI-compatible). The served model ID is stored with every output.
  profileModel: process.env.PROFILE_MODEL ?? "moonshotai/Kimi-K2.6",
  dateModel: process.env.DATE_MODEL ?? "Qwen/Qwen3.8-Flash-Next",
  llmConcurrency: num("LLM_CONCURRENCY", 6),

  // Scraping (Apify actors). Keep IDs in configuration; verified against real payloads.
  apifyInstagramActor: process.env.APIFY_INSTAGRAM_ACTOR ?? "apify~instagram-profile-scraper",
  apifyLinkedinActor: process.env.APIFY_LINKEDIN_ACTOR ?? "harvestapi~linkedin-profile-scraper",

  // Abuse controls and spend caps (persisted in Postgres, not memory).
  quotas: {
    analysesPerSessionHour: num("QUOTA_ANALYSES_PER_SESSION_HOUR", 3),
    runsPerSessionHour: num("QUOTA_RUNS_PER_SESSION_HOUR", 2),
    analysesPerIpDay: num("QUOTA_ANALYSES_PER_IP_DAY", 20),
    dailyScrapeCap: num("DAILY_SCRAPE_CAP", 120),
    dailyLlmCallCap: num("DAILY_LLM_CALL_CAP", 6000),
  },
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
