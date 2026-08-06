import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/024_band_member_default_fee.sql",
);
await query(fs.readFileSync(file, "utf8"));
console.log("applied 024_band_member_default_fee");

const col = await query(
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'band_members'
     AND column_name = 'default_price_eur'`,
);
console.log("band_members.default_price_eur", col.rows[0] || "missing");

await pool.end();
