import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const a = await sql`select dimensions, strongest_connection, second_date from assessments where run_id=(select id from runs where slug='cohort-25') and score is null limit 3`;
  for (const x of a) console.log(JSON.stringify(x.dimensions).slice(0, 700), "\n  second:", x.second_date, "\n");
  const refs = await sql`select jsonb_array_length(d.value->'refs') n, (d.value->>'rating') rating, count(*)::int c from assessments a, jsonb_each(a.dimensions) d where a.run_id=(select id from runs where slug='cohort-25') and a.score is null group by 1,2 order by 3 desc limit 6`;
  console.log("null-score dims (refs count, rating):", refs.map((r) => `${r.n}/${r.rating}:${r.c}`).join("  "));
  const dropped = await sql`select p.slug, jsonb_array_length(pv.profile->'dropped') n, pv.profile->'dropped' d from profile_versions pv join people p on p.id=pv.person_id join run_members m on m.profile_version_id=pv.id limit 25`;
  let total = 0; const reasons: Record<string, number> = {};
  for (const x of dropped) { total += x.n; for (const d of (x.d as { reason: string; text: string }[])) { reasons[d.reason] = (reasons[d.reason] ?? 0) + 1; if (/need|partner|appreciat|might|values/i.test(d.text)) console.log("  dropped:", x.slug, d.reason, "|", d.text.slice(0, 120)); } }
  console.log("dropped claims total:", total, reasons);
  await sql.end();
}
main();
