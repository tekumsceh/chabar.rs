/**
 * Delete Chabar-only copies imported from Google (sync_source=google).
 * Does NOT touch Google Calendar.
 *
 * Usage:
 *   node scripts/delete-google-imports.js           # dry-run all bands
 *   node scripts/delete-google-imports.js --apply    # delete all bands
 *   node scripts/delete-google-imports.js --band <id> --apply
 */
import "dotenv/config";
import { query, pool } from "../server/db.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const bandIdx = args.indexOf("--band");
const bandId = bandIdx >= 0 ? args[bandIdx + 1] : null;

const listed = await query(
  `
  SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.note, e.synced_at
  FROM events e
  JOIN bands b ON b.id = e.band_id
  WHERE e.sync_source = 'google'
    AND (:bandId::uuid IS NULL OR e.band_id = :bandId::uuid)
  ORDER BY b.name, e.id
  `,
  { bandId },
);

console.log(`Found ${listed.rows.length} imported event(s)${bandId ? ` for band ${bandId}` : ""}:`);
console.table(
  listed.rows.map((r) => ({
    id: r.id,
    band: r.band_name,
    date: r.event_date_text,
    note: r.note,
  })),
);

if (!listed.rows.length) {
  await pool.end();
  process.exit(0);
}

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to delete from Chabar (Google untouched).");
  await pool.end();
  process.exit(0);
}

const result = await query(
  `
  DELETE FROM events
  WHERE sync_source = 'google'
    AND (:bandId::uuid IS NULL OR band_id = :bandId::uuid)
  `,
  { bandId },
);
console.log(`\nDeleted ${result.rowCount} Chabar row(s). Google Calendar unchanged.`);
await pool.end();
