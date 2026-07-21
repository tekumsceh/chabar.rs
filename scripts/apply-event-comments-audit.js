import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/008_event_comments_and_audit.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 008_event_comments_and_audit");
const tables = await query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('event_comments', 'transaction_audit')
   ORDER BY table_name`,
);
console.log(tables.rows.map((row) => row.table_name).join(", "));
await pool.end();
