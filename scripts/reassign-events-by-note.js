/**
 * Reassign events to bands based on napomena (note):
 * - note contains "Marko Louis"  → Marko Louis band
 * - note contains "Saint Louis"  → Saint Louis band
 * - everything else             → owner's Personal band
 *
 * Run: node scripts/reassign-events-by-note.js
 */
import "dotenv/config";
import pg from "pg";

const ownerEmail = (process.env.OWNER_EMAIL || "tekumsceh@gmail.com").toLowerCase();
const databaseUrl = process.env.DATABASE_URL;

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

  const personal = bands.rows.find((b) => b.kind === "personal");
  const marko = bands.rows.find((b) => b.name === "Marko Louis");
  const saint = bands.rows.find((b) => b.name === "Saint Louis");

  if (!personal || !marko || !saint) {
    throw new Error(`Missing bands. Found: ${bands.rows.map((b) => b.name).join(", ")}`);
  }

  console.log("Personal:", personal.id);
  console.log("Marko Louis:", marko.id);
  console.log("Saint Louis:", saint.id);

  const before = await client.query(
    `SELECT b.name, COUNT(*)::int AS count
     FROM events e
     LEFT JOIN bands b ON b.id = e.band_id
     GROUP BY b.name
     ORDER BY b.name`,
  );
  console.log("Before:", before.rows);

  // Order matters: check Saint Louis before generic Louis if needed;
  // both names are distinct enough.
  const saintUpdated = await client.query(
    `UPDATE events
     SET band_id = $1
     WHERE note ILIKE '%Saint Louis%'`,
    [saint.id],
  );

  const markoUpdated = await client.query(
    `UPDATE events
     SET band_id = $1
     WHERE note ILIKE '%Marko Louis%'
       AND note NOT ILIKE '%Saint Louis%'`,
    [marko.id],
  );

  const personalUpdated = await client.query(
    `UPDATE events
     SET band_id = $1
     WHERE note NOT ILIKE '%Marko Louis%'
       AND note NOT ILIKE '%Saint Louis%'`,
    [personal.id],
  );

  console.log(`Moved to Saint Louis: ${saintUpdated.rowCount}`);
  console.log(`Moved to Marko Louis: ${markoUpdated.rowCount}`);
  console.log(`Moved to Personal:   ${personalUpdated.rowCount}`);

  const after = await client.query(
    `SELECT b.name, b.kind, COUNT(*)::int AS events
     FROM events e
     JOIN bands b ON b.id = e.band_id
     GROUP BY b.name, b.kind
     ORDER BY b.kind, b.name`,
  );
  console.log("After:");
  for (const row of after.rows) {
    console.log(`  ${row.name} (${row.kind}): ${row.events} events`);
  }

  const samples = await client.query(
    `SELECT b.name AS band, e.event_date_text AS date, e.city, e.note
     FROM events e
     JOIN bands b ON b.id = e.band_id
     WHERE b.kind = 'group'
     ORDER BY b.name, e.sort_order, e.id
     LIMIT 20`,
  );
  console.log("Sample group-band rows:");
  for (const row of samples.rows) {
    console.log(`  [${row.band}] ${row.date} ${row.city} — ${row.note}`);
  }
} finally {
  await client.end();
}
