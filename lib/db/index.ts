import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One pooled client per server instance. `prepare: false` keeps us compatible with
// Neon's PgBouncer pooler in transaction mode.
const globalForDb = globalThis as unknown as { __ssSql?: postgres.Sql };

function makeClient() {
  // postgres.js connects lazily (on first query), so a missing URL only fails when a query runs —
  // never during `next build`, which imports modules but renders no dynamic page.
  const url = process.env.DATABASE_URL ?? "postgres://missing-database-url@127.0.0.1:1/unset";
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
