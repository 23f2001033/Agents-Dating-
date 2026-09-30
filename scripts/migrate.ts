import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  const rows = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
  console.log("migrated; tables:", rows.map((r) => r.table_name).join(", "));
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
