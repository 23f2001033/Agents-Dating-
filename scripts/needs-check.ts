import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select p.slug, pv.version, pv.prompt_version,
      (select count(*) from jsonb_array_elements(pv.profile->'claims') c where c->>'category'='need')::int needs,
      (select string_agg(c->>'basis' || ': ' || (c->>'text'), ' || ') from jsonb_array_elements(pv.profile->'claims') c where c->>'category'='need') txt
    from people p join profile_versions pv on pv.id = p.current_profile_id
    where p.id in (select person_id from run_members where run_id=(select id from runs where slug='cohort-25')) order by p.slug`;
  for (const x of r) console.log(x.slug.padEnd(20), "v" + x.version, x.prompt_version, "needs:", x.needs, "|", (x.txt ?? "").slice(0, 150));
  await sql.end();
}
main();
