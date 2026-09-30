import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select a.date_id, a.created_at a_at, (select count(*)::int from date_turns t where t.date_id=a.date_id) turns,
      (select max(t.created_at) from date_turns t where t.date_id=a.date_id) last_turn_at, a.model
    from assessments a where a.dimensions::text like '%transcript is empty%' or a.dimensions::text like '%empty transcript%' or a.dimensions::text like '%no transcript%'`;
  console.log("assessments claiming an empty transcript:", r.length);
  for (const x of r.slice(0, 5)) console.log(x.date_id, "turns now:", x.turns, "assessed:", String(x.a_at).slice(11, 19), "last turn:", String(x.last_turn_at).slice(11, 19), x.model);
  const [c] = await sql`select count(*)::int n from assessments a where exists (select 1 from date_turns t where t.date_id=a.date_id and t.created_at > a.created_at)`;
  console.log("assessments created before a turn of the same date:", c.n);
  await sql.end();
}
main();
