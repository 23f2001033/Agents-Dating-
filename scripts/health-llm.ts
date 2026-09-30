import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select kind, ok, left(coalesce(error,''), 70) e, count(*)::int n, round(avg(latency_ms))::int ms from llm_usage where created_at > now() - interval '3 minutes' group by 1,2,3 order by 4 desc limit 8`;
  for (const x of r) console.log(x.n, x.kind, x.ok ? "OK" : "ERR", x.ms + "ms", x.e);
  await sql.end();
}
main();
