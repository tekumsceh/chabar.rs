import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/019_tech_channel_is_empty.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 019_tech_channel_is_empty");
const cols = await query(
  `SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'event_tech_channels'
     AND column_name = 'is_empty'`,
);
console.log(cols.rows[0] || "missing is_empty");
await pool.end();
