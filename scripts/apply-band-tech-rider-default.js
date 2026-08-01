import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/020_band_tech_rider_default.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 020_band_tech_rider_default");

const origin = await query(
  `SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'events'
     AND column_name = 'tech_rider_origin'`,
);
console.log("events.tech_rider_origin", origin.rows[0] || "missing");

const tables = await query(
  `SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('band_tech_rider_defaults', 'band_tech_rider_default_channels')
   ORDER BY table_name`,
);
console.log(
  "tables",
  tables.rows.map((row) => row.table_name),
);

await pool.end();
