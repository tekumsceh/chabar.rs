/**
 * One-off repair: re-seed upcoming dates that are empty, partial, or trivial stubs.
 * Run: node scripts/repair-tech-rider-seed.js
 */
import "dotenv/config";
import { query, pool } from "../server/db.js";
import { isPastEventDate, parseDate } from "../src/calculations.js";

function normalizeOrigin(value) {
  if (value === "default" || value === "custom") return value;
  return "none";
}

function isBlankRow(row) {
  return (
    !String(row.label || "").trim() &&
    !String(row.gear || "").trim() &&
    !String(row.cable || "").trim() &&
    !String(row.hardware || "").trim() &&
    !String(row.notes || "").trim()
  );
}

function shouldSeed({ eventDateText, origin, channels, defaultChannelCount }) {
  if (isPastEventDate(eventDateText)) return false;
  if (!defaultChannelCount) return false;
  const count = channels.length;
  if (count === 0) return true;
  if (count >= defaultChannelCount) return false;
  if (normalizeOrigin(origin) === "default") return true;
  return channels.every(isBlankRow);
}

async function replaceFromDefault(eventId, bandId) {
  await query(`DELETE FROM event_tech_channels WHERE event_id = :eventId`, { eventId });

  const header = await query(
    `SELECT console_ids, notes FROM band_tech_rider_defaults WHERE band_id = :bandId LIMIT 1`,
    { bandId },
  );
  if (!header.rows[0]) return false;

  const channels = await query(
    `SELECT kind, sort_order, label, gear, cable, hardware,
            phantom_48v, pad, stereo, is_empty, level_db, notes
     FROM band_tech_rider_default_channels
     WHERE band_id = :bandId
     ORDER BY kind ASC, sort_order ASC, id ASC`,
    { bandId },
  );
  if (!channels.rows.length) return false;

  await query(
    `UPDATE events
     SET tech_console_ids = :consoleIds,
         tech_rider_notes = :notes,
         tech_rider_origin = 'default',
         updated_at = NOW()
     WHERE id = :eventId AND band_id = :bandId`,
    {
      eventId,
      bandId,
      consoleIds: header.rows[0].console_ids || "[]",
      notes: String(header.rows[0].notes || "").slice(0, 4000),
    },
  );

  for (const row of channels.rows) {
    await query(
      `INSERT INTO event_tech_channels (
         event_id, band_id, kind, sort_order, label, gear, cable, hardware,
         phantom_48v, pad, stereo, is_empty, level_db, notes
       ) VALUES (
         :eventId, :bandId, :kind, :sortOrder, :label, :gear, :cable, :hardware,
         :phantom48v, :pad, :stereo, :isEmpty, :levelDb, :notes
       )`,
      {
        eventId,
        bandId,
        kind: row.kind === "output" ? "output" : "input",
        sortOrder: Number(row.sort_order) || 0,
        label: row.label || "",
        gear: row.gear || "",
        cable: row.cable || "",
        hardware: row.hardware || "",
        phantom48v: Boolean(row.phantom_48v),
        pad: Boolean(row.pad),
        stereo: Boolean(row.stereo),
        isEmpty: Boolean(row.is_empty),
        levelDb: row.level_db == null || row.level_db === "" ? null : Number(row.level_db),
        notes: row.notes || "",
      },
    );
  }
  return true;
}

const bands = await query(`SELECT DISTINCT band_id FROM band_tech_rider_defaults`);
let repaired = 0;

for (const { band_id: bandId } of bands.rows) {
  const defCount = await query(
    `SELECT COUNT(*)::int AS n FROM band_tech_rider_default_channels WHERE band_id = :bandId`,
    { bandId },
  );
  const defaultChannelCount = Number(defCount.rows[0]?.n) || 0;
  if (!defaultChannelCount) continue;

  const events = await query(
    `SELECT e.id, e.event_date_text, e.tech_rider_origin
     FROM events e
     WHERE e.band_id = :bandId`,
    { bandId },
  );

  for (const event of events.rows) {
    const ch = await query(
      `SELECT label, gear, cable, hardware, notes
       FROM event_tech_channels
       WHERE event_id = :eventId AND band_id = :bandId`,
      { eventId: event.id, bandId },
    );

    if (
      !shouldSeed({
        eventDateText: event.event_date_text,
        origin: event.tech_rider_origin,
        channels: ch.rows,
        defaultChannelCount,
      })
    ) {
      continue;
    }

    const ok = await replaceFromDefault(event.id, bandId);
    if (ok) {
      repaired += 1;
      console.log("repaired event", event.id, event.event_date_text, "band", bandId);
    }
  }
}

console.log("done, repaired", repaired, "events");
await pool.end();
