import "dotenv/config";
import { sql } from "../lib/db";
// Admin recovery after a worker is stopped: release leases and requeue retrying/failed dates of a run.
// Saved turns and assessments are kept; dates resume from their next missing step.
async function main() {
  const slug = process.argv[2];
  const r = await sql`update dates set lease_until = null, attempts = 0, error = null,
      status = case when status in ('failed','retrying') then 'queued' else status end
    where run_id = (select id from runs where slug = ${slug}) and status <> 'completed' returning id`;
  await sql`update runs set status = 'running' where slug = ${slug}`;
  console.log("released", r.length);
  await sql.end();
}
main();
