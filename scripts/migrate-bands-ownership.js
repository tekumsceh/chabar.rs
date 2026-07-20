/**
 * Apply bands ownership migration and attribute existing data to the owner.
 *
 * Requires in .env:
 *   DATABASE_URL
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OWNER_EMAIL=tekumsceh@gmail.com   (optional, default below)
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ownerEmail = (process.env.OWNER_EMAIL || "tekumsceh@gmail.com").trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const admin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

if (!admin) {
  console.log("SUPABASE_SERVICE_ROLE_KEY not set — will look up owner in auth.users via DATABASE_URL.");
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const migrationPath = path.join(__dirname, "../supabase/migrations/001_bands_ownership.sql");
  await client.query(fs.readFileSync(migrationPath, "utf8"));
  console.log("Applied 001_bands_ownership.sql");

  const userId = await ensureOwnerUser();
  console.log(`Owner user id: ${userId} (${ownerEmail})`);

  await client.query(
    `INSERT INTO profiles (id, email, display_name, role)
     VALUES ($1, $2, $3, 'superadmin')
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           role = 'superadmin',
           updated_at = NOW()`,
    [userId, ownerEmail, ownerEmail.split("@")[0]],
  );

  let bandId = (
    await client.query(
      `SELECT b.id
       FROM bands b
       JOIN band_members bm ON bm.band_id = b.id
       WHERE bm.user_id = $1 AND b.kind = 'personal'
       LIMIT 1`,
      [userId],
    )
  ).rows[0]?.id;

  if (!bandId) {
    bandId = (
      await client.query(
        `INSERT INTO bands (name, kind, created_by)
         VALUES ($1, 'personal', $2)
         RETURNING id`,
        ["Personal", userId],
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO band_members (band_id, user_id, member_role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [bandId, userId],
    );
    console.log(`Created personal band: ${bandId}`);
  } else {
    console.log(`Using existing personal band: ${bandId}`);
  }

  const eventsUpdated = await client.query(
    `UPDATE events SET band_id = $1 WHERE band_id IS NULL`,
    [bandId],
  );
  const paymentsUpdated = await client.query(
    `UPDATE payments SET band_id = $1 WHERE band_id IS NULL`,
    [bandId],
  );
  console.log(`Attributed events: ${eventsUpdated.rowCount}, payments: ${paymentsUpdated.rowCount}`);

  // Copy legacy global settings into settings_band, then swap tables if needed
  const legacyExists = (
    await client.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'settings'
    `)
  ).rowCount;

  if (legacyExists) {
    const hasBandColumn = (
      await client.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'band_id'
      `)
    ).rowCount;

    if (!hasBandColumn) {
      await client.query(
        `INSERT INTO settings_band (band_id, setting_key, setting_value)
         SELECT $1, setting_key, setting_value FROM settings
         ON CONFLICT DO NOTHING`,
        [bandId],
      );
      await client.query(`DROP TABLE settings`);
      await client.query(`ALTER TABLE settings_band RENAME TO settings`);
      console.log("Migrated settings to per-band table");
    } else {
      await client.query(
        `INSERT INTO settings (band_id, setting_key, setting_value)
         SELECT $1, setting_key, setting_value
         FROM settings
         WHERE band_id IS DISTINCT FROM $1
         ON CONFLICT DO NOTHING`,
        [bandId],
      );
    }
  } else if (
    (
      await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'settings_band'
      `)
    ).rowCount
  ) {
    await client.query(`ALTER TABLE settings_band RENAME TO settings`);
  }

  // Ensure default settings exist for personal band
  await client.query(
    `INSERT INTO settings (band_id, setting_key, setting_value)
     VALUES
       ($1, 'exchangeRate', '116.5'),
       ($1, 'asOfDate', to_char(NOW(), 'DD.MM.YYYY.'))
     ON CONFLICT DO NOTHING`,
    [bandId],
  );

  // Tighten NOT NULL after backfill
  await client.query(`ALTER TABLE events ALTER COLUMN band_id SET NOT NULL`);
  await client.query(`ALTER TABLE payments ALTER COLUMN band_id SET NOT NULL`);

  console.log("Bands ownership migration complete.");
  console.log("Sign in as", ownerEmail, "to see the migrated personal-band data.");
} finally {
  await client.end();
}

async function ensureOwnerUser() {
  if (admin) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) throw listed.error;

    const existing = listed.data.users.find((user) => (user.email || "").toLowerCase() === ownerEmail);
    if (existing) return existing.id;

    const tempPassword = crypto.randomBytes(18).toString("base64url");
    const created = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: ownerEmail.split("@")[0] },
    });
    if (created.error) throw created.error;

    console.log("Created auth user for owner.");
    console.log("Temporary password (save once, or use Google / reset password):", tempPassword);
    return created.data.user.id;
  }

  const found = await client.query(`SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`, [
    ownerEmail,
  ]);
  if (found.rows[0]?.id) return found.rows[0].id;

  console.error(
    `No auth user for ${ownerEmail}.\n` +
      "Either:\n" +
      "  1) Add SUPABASE_SERVICE_ROLE_KEY to .env and re-run, or\n" +
      "  2) Sign up once in the app with that email, then re-run: npm run db:migrate:bands",
  );
  process.exit(1);
}
