/**
 * Test import: pull future Google events into Chabar for linked band calendars.
 * Usage: node scripts/test-google-import.js
 *        node scripts/test-google-import.js --band <uuid>
 */
import "dotenv/config";
import { pool, query } from "../server/db.js";
import { pullBandCalendar } from "../server/googleCalendar.js";

const args = process.argv.slice(2);
const bandIdx = args.indexOf("--band");
const onlyBand = bandIdx >= 0 ? args[bandIdx + 1] : null;

const links = await query(
  `
  SELECT bg.band_id, b.name, bg.calendar_summary, bg.sync_enabled
  FROM band_google_calendars bg
  JOIN bands b ON b.id = bg.band_id
  WHERE bg.sync_enabled = true
    AND (:bandId::uuid IS NULL OR bg.band_id = :bandId::uuid)
  ORDER BY b.name
  `,
  { bandId: onlyBand },
);

if (!links.rows.length) {
  console.log("No linked calendars with sync enabled.");
  await pool.end();
  process.exit(1);
}

for (const row of links.rows) {
  console.log(`\n→ Importing for ${row.name} (${row.calendar_summary}) …`);
  try {
    const result = await pullBandCalendar(row.band_id, { mode: "import" });
    console.log(result);
  } catch (error) {
    console.error(`FAILED ${row.name}:`, error.message || error);
  }
}

const imp = await query(`
  SELECT b.name, e.id, e.event_date_text AS date, e.note, e.city, e.venue
  FROM events e
  JOIN bands b ON b.id = e.band_id
  WHERE e.sync_source = 'google'
  ORDER BY b.name, e.event_date_text, e.id
`);
console.log(`\nChabar now has ${imp.rows.length} google-imported row(s):`);
console.table(imp.rows);
console.log("\nCleanup: UI → bend panel → „Obriši uvezeno”, or:");
console.log("  node scripts/delete-google-imports.js --apply");

await pool.end();
