import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select d.status, d.attempts, left(coalesce(d.error,''),90) err, (select count(*) from date_turns t where t.date_id=d.id)::int turns, (select count(*) from assessments a where a.date_id=d.id)::int ass
    from dates d join runs r on r.id=d.run_id where r.slug=${process.argv[2]} and d.status <> 'completed' order by d.status`;
  for (const x of r) console.log(x.status, "att", x.attempts, "turns", x.turns, "assess", x.ass, x.err);
  await sql.end();
}
main();
