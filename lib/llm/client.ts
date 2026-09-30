import { requireEnv } from "@/lib/config";

// OpenAI-compatible chat client (Featherless.ai by default) with schema-constrained JSON output.
// - Concurrency: a per-process in-flight limiter (Featherless meters concurrent requests).
// - 429: honors Retry-After; rate limiting is waited out, not counted as a failed attempt.
// - 5xx / invalid output / truncation: at most `maxAttempts` attempts with exponential backoff + jitter.
// - Output is parsed and validated by the caller's validator (Zod); the model never writes a rank or score.

export type GenerateOptions<T> = {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => T; // throws on invalid output
  temperature?: number;
  maxTokens?: number;
  maxAttempts?: number;
  deadlineMs?: number; // absolute epoch ms; stop waiting past this
  kind: string;
  refId?: string;
  onUsage?: (u: UsageRecord) => Promise<void> | void;
};

export type UsageRecord = {
  kind: string;
  refId?: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  latencyMs: number;
  attempt: number;
  ok: boolean;
  error?: string;
};

export type GenerateResult<T> = { data: T; model: string; latencyMs: number; attempts: number };

export class LlmError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- per-process in-flight limiter ----
let inFlight = 0;
const waiters: (() => void)[] = [];
export async function withLlmSlot<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  while (inFlight >= limit) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

// Make every object schema strict (additionalProperties: false) for providers that enforce it.
function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (!schema || typeof schema !== "object") return schema;
  const s = { ...(schema as Record<string, unknown>) };
  delete s.description;
  if (s.type === "object") s.additionalProperties = false;
  for (const k of Object.keys(s)) if (k === "properties" || k === "items") s[k] = k === "properties" ? Object.fromEntries(Object.entries(s[k] as Record<string, unknown>).map(([pk, pv]) => [pk, strictify(pv)])) : strictify(s[k]);
  return s;
}

// Accumulate an OpenAI-style SSE stream into the same shape as a non-streamed completion.
async function readStream(res: Response): Promise<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finish: string | null = null;
  let usage: unknown = null;
  let model: string | null = null;
  let refusal: string | null = null;
  for (;;) {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      idle = setTimeout(() => reject(new Error("stream stalled (no data for 45s)")), 45_000);
    });
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([reader.read(), stalled]);
    } catch (e) {
      await reader.cancel().catch(() => {});
      throw e;
    } finally {
      clearTimeout(idle);
    }
    const { value, done } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data) as { model?: string; usage?: unknown; choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[] };
        if (chunk.model) model = chunk.model;
        if (chunk.usage) usage = chunk.usage;
        const c = chunk.choices?.[0];
        if (c?.delta?.content) content += c.delta.content;
        if (c?.delta?.refusal) refusal = (refusal ?? "") + c.delta.refusal;
        if (c?.finish_reason) finish = c.finish_reason;
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
  return { model, usage, choices: [{ message: { content, refusal }, finish_reason: finish }] };
}

export async function generateJson<T>(opts: GenerateOptions<T>): Promise<GenerateResult<T>> {
  const key = requireEnv("FEATHERLESS_API_KEY");
  const base = (process.env.LLM_BASE_URL ?? "https://api.featherless.ai/v1").replace(/\/$/, "");
  const maxAttempts = opts.maxAttempts ?? 3;
  const deadline = opts.deadlineMs ?? Date.now() + 10 * 60_000;
  let attempts = 0;
  let rateWaits = 0;
  let lastError = "unknown error";
  let userText = opts.user;
  const schema = strictify(opts.schema);

  while (attempts < maxAttempts) {
    if (Date.now() > deadline) throw new LlmError(`deadline reached before model call (${lastError})`, true);
    const started = Date.now();
    const body = {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: userText },
      ],
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1500,
      response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema, strict: true } },
      // Hybrid-reasoning models (Qwen3.5+, Kimi K2.5+, GLM 4.5+): answer directly, no hidden thinking tokens.
      ...(/qwen3\.[5-9]|kimi-k2\.[5-9]|glm-4\.[5-9]/i.test(opts.model) ? { chat_template_kwargs: { enable_thinking: false, thinking: false } } : {}),
      // Streaming keeps long generations alive through proxy idle timeouts (non-streamed ~60s calls came back empty).
      stream: true,
      stream_options: { include_usage: true },
    };
    let res: Response;
    let json: Record<string, unknown> | null = null;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(20_000, Math.min(240_000, deadline - Date.now()))),
        cache: "no-store",
      });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("text/event-stream")) json = await readStream(res);
      else json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    } catch (e) {
      attempts++;
      lastError = `network: ${(e as Error).message}`;
      await opts.onUsage?.({ kind: opts.kind, refId: opts.refId, model: opts.model, latencyMs: Date.now() - started, attempt: attempts, ok: false, error: lastError });
      await sleep(1000 * 2 ** attempts + Math.random() * 500);
      continue;
    }
    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 3000 * Math.min(8, 2 ** rateWaits)) + Math.random() * 1000;
      rateWaits++;
      lastError = `rate limited (429): ${String((json as { error?: { message?: string } })?.error?.message ?? "").slice(0, 120)}`;
      if (Date.now() + wait > deadline || rateWaits > 30) throw new LlmError(lastError, true);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      attempts++;
      const msg = String((json as { error?: { message?: string } })?.error?.message ?? res.statusText).slice(0, 200);
      lastError = `HTTP ${res.status}: ${msg}`;
      await opts.onUsage?.({ kind: opts.kind, refId: opts.refId, model: opts.model, latencyMs, attempt: attempts, ok: false, error: lastError });
      if (res.status >= 500 || res.status === 408) {
        await sleep(1500 * 2 ** attempts + Math.random() * 1000);
        continue;
      }
      throw new LlmError(lastError, false);
    }

    const choice = (json?.choices as { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] | undefined)?.[0];
    const usage = (json?.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    const model = String(json?.model ?? opts.model);
    const text = choice?.message?.content ?? "";
    attempts++;
    try {
      if (choice?.message?.refusal) throw new Error(`refusal: ${choice.message.refusal.slice(0, 100)}`);
      if (choice?.finish_reason && choice.finish_reason !== "stop") throw new Error(`finish_reason ${choice.finish_reason}`);
      const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      const data = opts.validate(parsed);
      await opts.onUsage?.({ kind: opts.kind, refId: opts.refId, model, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, thinkingTokens: usage.completion_tokens_details?.reasoning_tokens, latencyMs, attempt: attempts, ok: true });
      return { data, model, latencyMs, attempts };
    } catch (e) {
      lastError = `invalid output: ${(e as Error).message}`.slice(0, 300);
      await opts.onUsage?.({ kind: opts.kind, refId: opts.refId, model, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, latencyMs, attempt: attempts, ok: false, error: lastError });
      // Tell the model what the validator rejected on the next attempt (schema already constrains the shape).
      userText = `${opts.user}\n\nIMPORTANT: your previous answer was rejected by the validator (${lastError.slice(0, 180)}). Follow every rule exactly.`;
    }
  }
  throw new LlmError(`model call failed after ${attempts} attempts: ${lastError}`, true);
}
