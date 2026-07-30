import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../server/db.js";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/017_event_tech_consoles.sql",
);
const sql = fs.readFileSync(file, "utf8");
await query(sql);
console.log("applied 017_event_tech_consoles");
await pool.end();
