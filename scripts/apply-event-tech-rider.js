import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/016_event_tech_rider.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 016_event_tech_rider");
const tables = await query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'event_tech_channels'`,
);
console.log(tables.rows.map((row) => row.table_name).join(", ") || "missing");
await pool.end();
