import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select p.slug, count(*) filter (where d.status='completed')::int done, count(*)::int total from people p join dates d on (d.person_a_id=p.id or d.person_b_id=p.id) join runs r on r.id=d.run_id where r.slug='cohort-25' group by p.slug order by done desc`;
  console.log(r.map((x) => `${x.slug}:${x.done}/${x.total}`).join("  "));
  await sql.end();
}
main();
