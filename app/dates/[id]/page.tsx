import { notFound } from "next/navigation";
import { DateRoom } from "@/components/date-room";
import { roomData } from "@/lib/room";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await roomData(id);
  if (!r) notFound();
  const session = await getSession();
  if (!r.runPublished && (!session || r.ownerSessionId !== session.id)) notFound();
  const live = r.data.status !== "completed" && r.data.status !== "failed";
  const canDrive = !r.runPublished && Boolean(session && r.ownerSessionId === session.id);
  return <DateRoom initial={r.data} live={live} driveRunId={canDrive ? r.runId : null} />;
}
