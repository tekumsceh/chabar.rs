import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL (or SUPABASE_DB_URL). Add it to .env first.");
  process.exit(1);
}

const schemaPath = path.join(__dirname, "../supabase/schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(schemaSql);
  console.log("Supabase schema applied successfully.");
} finally {
  await client.end();
}
