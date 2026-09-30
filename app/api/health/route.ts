import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const t0 = Date.now();
    const [r] = await sql<{ last: Date | null }[]>`select max(created_at) as last from events`;
    return NextResponse.json({ ok: true, db: "up", dbLatencyMs: Date.now() - t0, lastActivity: r?.last ?? null, worker: "serverless ticks (no always-on worker)" });
  } catch (e) {
    return NextResponse.json({ ok: false, db: "down", error: (e as Error).message.slice(0, 120) }, { status: 503 });
  }
}
