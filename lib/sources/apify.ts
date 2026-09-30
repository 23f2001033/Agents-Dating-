import { requireEnv } from "@/lib/config";

// Thin Apify REST adapter. Runs are started asynchronously and their IDs persisted,
// so a crashed or timed-out step resumes polling the same paid collection instead of starting a new one.

const BASE = "https://api.apify.com/v2";

export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
    public transient: boolean,
  ) {
    super(message);
  }
}

export type ApifyRun = {
  id: string;
  status: string; // READY | RUNNING | SUCCEEDED | FAILED | TIMING-OUT | TIMED-OUT | ABORTING | ABORTED
  defaultDatasetId: string;
  statusMessage?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + path, {
        ...init,
        headers: {
          Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      const text = await r.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (!r.ok) {
        const msg =
          (body as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
        const transient = r.status === 429 || r.status >= 500;
        const err = new ProviderError(r.status, `Apify ${r.status}: ${msg}`, transient);
        if (!transient) throw err;
        lastErr = err;
        const retryAfter = Number(r.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt + Math.random() * 400);
        continue;
      }
      return body as T;
    } catch (e) {
      if (e instanceof ProviderError && !e.transient) throw e;
      lastErr = e;
      await sleep(800 * 2 ** attempt + Math.random() * 400);
    }
  }
  if (lastErr instanceof ProviderError) throw lastErr;
  throw new ProviderError(0, `Apify request failed: ${(lastErr as Error)?.message ?? lastErr}`, true);
}

export async function startActorRun(
  actor: string,
  input: unknown,
  opts: { timeoutSecs?: number; memoryMbytes?: number } = {},
): Promise<ApifyRun> {
  const q = new URLSearchParams({ timeout: String(opts.timeoutSecs ?? 240) });
  if (opts.memoryMbytes) q.set("memory", String(opts.memoryMbytes));
  const j = await call<{ data: ApifyRun }>(`/acts/${actor}/runs?${q}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return j.data;
}

export async function getRun(runId: string, waitForFinishSecs = 0): Promise<ApifyRun> {
  const wait = Math.max(0, Math.min(60, Math.floor(waitForFinishSecs)));
  const j = await call<{ data: ApifyRun }>(
    `/actor-runs/${runId}${wait ? `?waitForFinish=${wait}` : ""}`,
    {},
    (wait + 20) * 1000,
  );
  return j.data;
}

// Finished datasets are immutable; batched seed runs share one dataset across many people.
const datasetCache = new Map<string, { at: number; items: unknown[] }>();
export async function getDatasetItems(datasetId: string): Promise<unknown[]> {
  const hit = datasetCache.get(datasetId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.items;
  const j = await call<unknown[]>(`/datasets/${datasetId}/items?clean=true&format=json`, {}, 60_000);
  const items = Array.isArray(j) ? j : [];
  datasetCache.set(datasetId, { at: Date.now(), items });
  return items;
}

export const TERMINAL_FAIL = new Set(["FAILED", "TIMED-OUT", "ABORTED"]);
