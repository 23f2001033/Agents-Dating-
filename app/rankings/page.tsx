import { redirect } from "next/navigation";
import { getDemoRun } from "@/lib/access";
import { runMembersList } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function RankingsIndex() {
  const run = await getDemoRun();
  if (!run) redirect("/demo");
  const members = await runMembersList(run.id);
  if (!members.length) redirect("/demo");
  redirect(`/rankings/${members[0].slug}`);
}
