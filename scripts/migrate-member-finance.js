/**
 * Attribute all event prices + payments to the owner user.
 * Dates stay on bands; finance becomes member-scoped.
 *
 * Run: node scripts/migrate-member-finance.js
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ownerEmail = (process.env.OWNER_EMAIL || "tekumsceh@gmail.com").toLowerCase();
const databaseUrl = process.env.DATABASE_URL;

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(fs.readFileSync(path.join(__dirname, "../supabase/migrations/002_member_finance.sql"), "utf8"));
  console.log("Applied 002_member_finance.sql");

  const owner = await client.query(`SELECT id FROM auth.users WHERE lower(email) = lower($1)`, [ownerEmail]);
  if (!owner.rows[0]) throw new Error(`Owner not found: ${ownerEmail}`);
  const userId = owner.rows[0].id;

  const financeInsert = await client.query(
    `INSERT INTO event_member_finance (event_id, user_id, price_eur, transport_rsd)
     SELECT id, $1, price_eur, transport_rsd FROM events
     ON CONFLICT (event_id, user_id) DO UPDATE
       SET price_eur = EXCLUDED.price_eur,
           transport_rsd = EXCLUDED.transport_rsd,
           updated_at = NOW()`,
    [userId],
  );
  console.log(`event_member_finance rows upserted: ${financeInsert.rowCount}`);

  const paymentsUpdated = await client.query(
    `UPDATE payments SET user_id = $1 WHERE user_id IS NULL`,
    [userId],
  );
  console.log(`payments attributed to owner: ${paymentsUpdated.rowCount}`);

  await client.query(`ALTER TABLE payments ALTER COLUMN user_id SET NOT NULL`);

  const summary = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM event_member_finance WHERE user_id = $1) AS my_event_finance,
       (SELECT COUNT(*)::int FROM payments WHERE user_id = $1) AS my_payments,
       (SELECT COUNT(*)::int FROM events) AS total_events`,
    [userId],
  );
  console.log("Summary:", summary.rows[0]);
  console.log("Member finance migration complete.");
} finally {
  await client.end();
}
