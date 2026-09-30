import "dotenv/config";
import { sql } from "../lib/db";
// Manual retry of failed dates only (bounded; keeps saved turns; never touches live leases).
async function main() {
  const r = await sql`update dates set status = 'queued', attempts = 0, error = null, lease_until = null, updated_at = now()
    where run_id = (select id from runs where slug = ${process.argv[2]}) and status = 'failed' returning id`;
  await sql`update runs set status = 'running' where slug = ${process.argv[2]} and status <> 'running'`;
  console.log("requeued failed dates:", r.length);
  await sql.end();
}
main();
