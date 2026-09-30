import "dotenv/config";
import { sql } from "../lib/db";
async function main() {
  const r = await sql`select kind, left(error, 150) e, count(*)::int n from llm_usage where created_at > now() - interval '6 minutes' and not ok group by 1,2 order by 3 desc limit 8`;
  for (const x of r) console.log(x.n, x.kind, x.e);
  await sql.end();
}
main();
