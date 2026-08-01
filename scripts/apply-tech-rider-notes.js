import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/021_tech_rider_notes.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 021_tech_rider_notes");

const eventCol = await query(
  `SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'events'
     AND column_name = 'tech_rider_notes'`,
);
console.log("events.tech_rider_notes", eventCol.rows[0] || "missing");

const defaultCol = await query(
  `SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'band_tech_rider_defaults'
     AND column_name = 'notes'`,
);
console.log("band_tech_rider_defaults.notes", defaultCol.rows[0] || "missing");

await pool.end();
