import "dotenv/config";
import { sql } from "../lib/db";
// Usage: npx tsx scripts/progress.ts <runSlug>
async function main() {
  const [c] = await sql`select (select count(*)::int from dates d join runs r on r.id=d.run_id where r.slug=${process.argv[2]}) total,
    (select count(*)::int from dates d join runs r on r.id=d.run_id where r.slug=${process.argv[2]} and d.status='completed') completed,
    (select count(*)::int from dates d join runs r on r.id=d.run_id where r.slug=${process.argv[2]} and d.status='failed') failed,
    (select count(*)::int from date_turns t join dates d on d.id=t.date_id join runs r on r.id=d.run_id where r.slug=${process.argv[2]}) turns,
    (select count(*)::int from assessments a join runs r on r.id=a.run_id where r.slug=${process.argv[2]}) assessments,
    (select count(*)::int from llm_usage where created_at > now() - interval '5 minutes' and not ok) errors_5m,
    (select count(*)::int from llm_usage where created_at > now() - interval '5 minutes' and ok) ok_5m`;
  console.log(c);
  const e = await sql`select left(error, 120) e, count(*)::int n from llm_usage where created_at > now() - interval '10 minutes' and not ok group by 1 order by 2 desc limit 5`;
  for (const x of e) console.log(x.n, x.e);
  await sql.end();
}
main();
