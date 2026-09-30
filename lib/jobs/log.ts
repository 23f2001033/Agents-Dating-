import { db, schema } from "@/lib/db";
import type { UsageRecord } from "@/lib/llm/client";

export async function logEvent(e: {
  type: string;
  runId?: string | null;
  dateId?: string | null;
  personId?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    await db.insert(schema.events).values({
      type: e.type,
      runId: e.runId ?? null,
      dateId: e.dateId ?? null,
      personId: e.personId ?? null,
      payload: e.payload ?? null,
    });
  } catch (err) {
    console.error("event log failed", err);
  }
}

export async function logUsage(u: UsageRecord) {
  try {
    await db.insert(schema.llmUsage).values({
      kind: u.kind,
      refId: u.refId ?? null,
      model: u.model,
      inputTokens: u.inputTokens ?? null,
      outputTokens: u.outputTokens ?? null,
      thinkingTokens: u.thinkingTokens ?? null,
      latencyMs: u.latencyMs,
      attempt: u.attempt,
      ok: u.ok,
      error: u.error ?? null,
    });
  } catch (err) {
    console.error("usage log failed", err);
  }
}
