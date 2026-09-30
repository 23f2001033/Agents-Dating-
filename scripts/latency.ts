import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select kind, count(*)::int n, round(avg(latency_ms))::int avg_ms, round(percentile_cont(0.9) within group (order by latency_ms))::int p90_ms, sum(case when ok then 0 else 1 end)::int errors
    from llm_usage where created_at > now() - interval '3 minutes' group by kind`;
  console.log(r);
  await sql.end();
}
main();
