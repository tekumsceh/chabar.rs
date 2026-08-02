import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/022_payment_allocations.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 022_payment_allocations");

const cols = await query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'exchange_rate'`,
);
console.log("payments.exchange_rate", cols.rows[0] ? "ok" : "missing");

const table = await query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'payment_allocations'`,
);
console.log("payment_allocations", table.rows[0] ? "ok" : "missing");

await pool.end();
