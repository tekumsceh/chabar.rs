import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/009_band_invite_links.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 009_band_invite_links");
const tables = await query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name = 'band_invite_links'`,
);
console.log(tables.rows.map((row) => row.table_name).join(", ") || "missing");
await pool.end();
