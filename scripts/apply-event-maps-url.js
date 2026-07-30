import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/015_event_maps_url.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 015_event_maps_url");
const cols = await query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'maps_url'`,
);
console.log(cols.rows.map((row) => row.column_name).join(", ") || "missing");
await pool.end();
