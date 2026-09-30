import "dotenv/config";
import { sql } from "../lib/db";
// Read-only: pipeline state for one person id.
async function main() {
  const id = process.argv[2];
  const [p] = await sql`select slug, origin, status, status_detail, identity_attested, created_at from people where id = ${id}`;
  console.log(p);
  const s = await sql`select platform, status, left(coalesce(error,''),80) error, created_at, (normalized->>'isPrivate') is_private, jsonb_array_length(coalesce(normalized->'posts','[]'::jsonb)) posts from source_snapshots where person_id = ${id} order by created_at`;
  for (const x of s) console.log(x.platform, x.status, "private:", x.is_private, "posts:", x.posts, String(x.created_at).slice(0, 19), x.error);
  const e = await sql`select type, created_at from events where person_id = ${id} order by id`;
  console.log(e.map((x) => `${String(x.created_at).slice(0, 19).slice(11, 19)} ${x.type}`).join(" | "));
  await sql.end();
}
main();
