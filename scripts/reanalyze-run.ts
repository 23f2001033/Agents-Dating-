import "dotenv/config";
import { sql } from "../lib/db";
// Re-analyze every member of a run from their existing evidence (no re-scraping) → new profile versions.
async function main() {
  const r = await sql`update people set status = 'analyzing', status_detail = null, lease_until = null
    where id in (select person_id from run_members where run_id = (select id from runs where slug = ${process.argv[2]})) returning slug`;
  console.log("re-analyzing", r.length);
  await sql.end();
}
main();
