import "dotenv/config";
import { sql } from "../lib/db";
// Pick a completed demo date with a clear, interesting outcome for the replay segment.
async function main() {
  const r = await sql`select d.id, pa.display_name a, pb.display_name b, min(x.score) mutual, max(x.score) - min(x.score) gap,
      bool_or(x.second_date = 'yes') any_yes, (select count(*) from date_turns t where t.date_id = d.id and t.action = 'decline') declines
    from dates d join runs r on r.id = d.run_id join assessments x on x.date_id = d.id
    join people pa on pa.id = d.person_a_id join people pb on pb.id = d.person_b_id
    where r.slug = 'cohort-25' and d.status = 'completed' group by d.id, pa.display_name, pb.display_name
    having bool_or(x.second_date = 'yes') order by declines desc, gap desc limit 6`;
  for (const x of r) console.log(x.id, `${x.a} × ${x.b}`, "mutual", x.mutual, "gap", x.gap, "declines", x.declines);
  await sql.end();
}
main();
