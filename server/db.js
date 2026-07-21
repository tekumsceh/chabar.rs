import "dotenv/config";
import pg from "pg";
import { logger } from "./logger.js";

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL (or SUPABASE_DB_URL). Add your Supabase Postgres URI to .env");
}

const isLocal = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

/** Keep at least one pooled connection alive so the first user request isn't a cold handshake. */
export const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: isLocal
    ? false
    : {
        // Supabase pooler uses a cert chain browsers trust differently; override with SSL_REJECT_UNAUTHORIZED=1 if you mount a CA.
        rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === "1",
      },
  max: 10,
  min: 1,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (error) => {
  logger.error("Unexpected Postgres pool error", error);
});

export async function query(sql, params = {}) {
  const { text, values } = namedToPositional(sql, params);
  const result = await pool.query(text, values);
  return result;
}

/** Run fn(queryFn) inside a transaction. queryFn has the same named-param API as query(). */
export async function withTransaction(fn) {
  const client = await pool.connect();
  const run = async (sql, params = {}) => {
    const { text, values } = namedToPositional(sql, params);
    return client.query(text, values);
  };
  try {
    await client.query("BEGIN");
    const result = await fn(run);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Ping so the pooler / TCP path stays warm (Supabase idle disconnects otherwise). */
export function startPoolWarmer(intervalMs = 50_000) {
  const tick = async () => {
    try {
      await pool.query("SELECT 1");
    } catch (error) {
      logger.warn("DB warm ping failed", { message: error.message });
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}

function namedToPositional(sql, params = {}) {
  if (Array.isArray(params)) {
    return { text: sql, values: params };
  }

  const values = [];
  const text = sql.replace(/(^|[^:]):([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, prefix, key) => {
    if (!(key in params)) {
      throw new Error(`Missing SQL parameter: ${key}`);
    }
    values.push(params[key]);
    return `${prefix}$${values.length}`;
  });

  return { text, values };
}
