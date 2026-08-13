import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool, query } from "../server/db.js";

const sql = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/025_audit_event_expense.sql"),
  "utf8",
);
await query(sql);
console.log("applied 025_audit_event_expense");
await pool.end();
