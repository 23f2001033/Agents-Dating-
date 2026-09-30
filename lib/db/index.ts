import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One pooled client per server instance. `prepare: false` keeps us compatible with
// Neon's PgBouncer pooler in transaction mode.
const globalForDb = globalThis as unknown as { __ssSql?: postgres.Sql };

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 20,
  });
}

export const sql = globalForDb.__ssSql ?? (globalForDb.__ssSql = makeClient());
export const db = drizzle(sql, { schema });
export { schema };
