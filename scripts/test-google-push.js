/**
 * Upsync: push Chabar events missing from linked Google calendars.
 * Usage: node scripts/test-google-push.js
 *        node scripts/test-google-push.js --band <uuid>
 */
import "dotenv/config";
import { pool, query } from "../server/db.js";
import { pushBandCalendar } from "../server/googleCalendar.js";

const args = process.argv.slice(2);
const bandIdx = args.indexOf("--band");
const onlyBand = bandIdx >= 0 ? args[bandIdx + 1] : null;

const links = await query(
  `
  SELECT bg.band_id, b.name, bg.calendar_summary, bg.google_calendar_id, bg.sync_enabled
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
  const pending = await query(
    `SELECT id, event_date_text AS date, city, venue, note
     FROM events
     WHERE band_id = :bandId
       AND sync_source <> 'google'
       AND (google_event_id IS NULL OR google_calendar_id IS DISTINCT FROM :calendarId)
     ORDER BY id`,
    { bandId: row.band_id, calendarId: row.google_calendar_id },
  );
  console.log(`\n→ Push ${row.name} (${row.calendar_summary}) — ${pending.rows.length} candidate(s)`);
  if (pending.rows.length) console.table(pending.rows);
  try {
    const result = await pushBandCalendar(row.band_id);
    console.log(result);
  } catch (error) {
    console.error(`FAILED ${row.name}:`, error.message || error);
  }
}

await pool.end();
