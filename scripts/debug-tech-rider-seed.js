import "dotenv/config";
import { query, pool } from "../server/db.js";
import { parseDate, startOfToday } from "../src/calculations.js";

function isPastEventDate(dateText) {
  const eventDate = parseDate(dateText);
  if (Number.isNaN(eventDate.getTime())) return false;
  return eventDate < startOfToday();
}

const defaults = await query(
  `SELECT band_id, console_ids, notes FROM band_tech_rider_defaults ORDER BY band_id`,
);
console.log("band defaults headers:", defaults.rows.length);
for (const row of defaults.rows) {
  const ch = await query(
    `SELECT COUNT(*)::int AS n FROM band_tech_rider_default_channels WHERE band_id = :bandId`,
    { bandId: row.band_id },
  );
  console.log(" band", row.band_id, "default channels", ch.rows[0].n, "consoles", row.console_ids);
}

const events = await query(
  `SELECT e.id, e.band_id, e.event_date_text, e.tech_rider_origin,
          (SELECT COUNT(*)::int FROM event_tech_channels c
           WHERE c.event_id = e.id AND c.band_id = e.band_id) AS ch
   FROM events e
   WHERE e.event_date_text ILIKE '%8.%2026%'
   ORDER BY e.event_date_text, e.id`,
);
console.log("\n2026 events with 8. in date:");
for (const row of events.rows) {
  console.log(
    " ",
    row.id,
    "band",
    row.band_id,
    row.event_date_text,
    "origin",
    row.tech_rider_origin,
    "channels",
    row.ch,
    "past",
    isPastEventDate(row.event_date_text),
  );
}

const emptyFuture = await query(
  `SELECT e.id, e.band_id, e.event_date_text, e.tech_rider_origin
   FROM events e
   WHERE NOT EXISTS (
     SELECT 1 FROM event_tech_channels c
     WHERE c.event_id = e.id AND c.band_id = e.band_id
   )
   ORDER BY e.event_date_text, e.id`,
);
console.log("\nempty channel events:");
for (const row of emptyFuture.rows) {
  console.log(
    " ",
    row.id,
    "band",
    row.band_id,
    row.event_date_text,
    "origin",
    row.tech_rider_origin,
    "past",
    isPastEventDate(row.event_date_text),
  );
}

const orphans = await query(
  `SELECT c.event_id, c.band_id, COUNT(*)::int AS n
   FROM event_tech_channels c
   GROUP BY c.event_id, c.band_id
   HAVING c.event_id IN (
     SELECT e.id FROM events e
     WHERE NOT EXISTS (
       SELECT 1 FROM event_tech_channels c2
       WHERE c2.event_id = e.id AND c2.band_id = e.band_id
     )
   )
   ORDER BY c.event_id`,
);
console.log("\norphaned channels (event band mismatch):", orphans.rows);

await pool.end();
