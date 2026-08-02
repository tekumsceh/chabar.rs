import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/023_payment_allocation_lines.sql",
);
await query(fs.readFileSync(file, "utf8"));
console.log("applied 023_payment_allocation_lines");
await pool.end();
