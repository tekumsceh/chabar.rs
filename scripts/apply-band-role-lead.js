import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/004_band_role_lead.sql");
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 004_band_role_lead");
const r = await query(
  `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'band_members_member_role_check'`,
);
console.log(r.rows[0]);
await pool.end();
