import { NextResponse } from "next/server";
import { roomData } from "@/lib/room";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const r = await roomData(id);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  const session = await getSession();
  if (!r.runPublished && (!session || r.ownerSessionId !== session.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(r.data, { headers: { "cache-control": "no-store" } });
}
