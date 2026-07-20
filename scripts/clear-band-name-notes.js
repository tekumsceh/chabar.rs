/**
 * 1) Assign band_id from napomena (Marko Louis / Saint Louis).
 * 2) Clear napomena when it is only that band name (trimmed).
 * Other notes are left unchanged. Does not touch unrelated events' band_id.
 *
 * Run: node scripts/clear-band-name-notes.js
 */
import "dotenv/config";
import pg from "pg";

const ownerEmail = (process.env.OWNER_EMAIL || "tekumsceh@gmail.com").toLowerCase();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL missing");
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const owner = await client.query(`SELECT id FROM auth.users WHERE lower(email) = lower($1)`, [ownerEmail]);
  if (!owner.rows[0]) throw new Error(`Owner not found: ${ownerEmail}`);
  const userId = owner.rows[0].id;

  const bands = await client.query(
    `SELECT b.id, b.name, b.kind
     FROM bands b
     JOIN band_members bm ON bm.band_id = b.id
     WHERE bm.user_id = $1`,
    [userId],
  );

  const marko = bands.rows.find((b) => b.name === "Marko Louis");
  const saint = bands.rows.find((b) => b.name === "Saint Louis");
  if (!marko || !saint) {
    throw new Error(`Missing bands. Found: ${bands.rows.map((b) => b.name).join(", ")}`);
  }

  const before = await client.query(
    `SELECT e.id, e.event_date_text, e.note, e.band_id, b.name AS band_name
     FROM events e
     LEFT JOIN bands b ON b.id = e.band_id
     WHERE trim(coalesce(e.note, '')) ILIKE '%Marko Louis%'
        OR trim(coalesce(e.note, '')) ILIKE '%Saint Louis%'
     ORDER BY e.event_date_text`,
  );
  console.log(`Matched by note: ${before.rows.length}`);
  console.log(
    before.rows.map((r) => ({
      date: r.event_date_text,
      note: r.note,
      band: r.band_name,
    })),
  );

  await client.query("BEGIN");

  const saintAssigned = await client.query(
    `UPDATE events
     SET band_id = $1
     WHERE note ILIKE '%Saint Louis%'
       AND (band_id IS DISTINCT FROM $1)`,
    [saint.id],
  );

  const markoAssigned = await client.query(
    `UPDATE events
     SET band_id = $1
     WHERE note ILIKE '%Marko Louis%'
       AND note NOT ILIKE '%Saint Louis%'
       AND (band_id IS DISTINCT FROM $1)`,
    [marko.id],
  );

  // Clear notes that are only the band name (ignore surrounding whitespace / trailing dots)
  const cleared = await client.query(
    `UPDATE events
     SET note = ''
     WHERE regexp_replace(trim(coalesce(note, '')), '\\.+$', '') ILIKE 'Marko Louis'
        OR regexp_replace(trim(coalesce(note, '')), '\\.+$', '') ILIKE 'Saint Louis'`,
  );

  await client.query("COMMIT");

  console.log(`Assigned Saint Louis: ${saintAssigned.rowCount}`);
  console.log(`Assigned Marko Louis: ${markoAssigned.rowCount}`);
  console.log(`Cleared band-name notes: ${cleared.rowCount}`);

  const leftover = await client.query(
    `SELECT count(*)::int AS count
     FROM events
     WHERE note ILIKE '%Marko Louis%' OR note ILIKE '%Saint Louis%'`,
  );
  console.log(`Leftover notes still containing those names: ${leftover.rows[0].count}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
