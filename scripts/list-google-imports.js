import "dotenv/config";
import { query, pool } from "../server/db.js";

const links = await query(`
  SELECT b.name, bg.band_id, bg.calendar_summary, bg.sync_enabled, bg.last_synced_at
  FROM band_google_calendars bg
  JOIN bands b ON b.id = bg.band_id
  ORDER BY b.name
`);
console.log("Linked calendars:");
console.table(links.rows);

const imp = await query(`
  SELECT b.name, e.band_id, COUNT(*)::int AS n
  FROM events e
  JOIN bands b ON b.id = e.band_id
  WHERE e.sync_source = 'google'
  GROUP BY b.name, e.band_id
  ORDER BY b.name
`);
console.log("Imported events (sync_source=google):");
console.table(imp.rows.length ? imp.rows : [{ note: "none yet" }]);

await pool.end();
