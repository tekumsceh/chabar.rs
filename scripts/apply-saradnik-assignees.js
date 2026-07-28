import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../server/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../supabase/migrations/013_saradnik_and_event_assignees.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Applied 013_saradnik_and_event_assignees.sql");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
