import "dotenv/config";
import { sql } from "../lib/db";
// Make the demo run visible (pages label incomplete rankings "Provisional" until every date completes).
async function main() {
  const r = await sql`update runs set published = true, published_at = now() where slug = ${process.argv[2]} returning id, slug, status`;
  console.log(r);
  await sql.end();
}
main();
