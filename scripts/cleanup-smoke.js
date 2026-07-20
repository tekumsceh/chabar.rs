import "dotenv/config";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const before = await client.query(
  `SELECT e.id, e.city, e.note, b.name
   FROM events e JOIN bands b ON b.id = e.band_id
   WHERE b.name = 'Marko Louis'`,
);
console.log("before", before.rows);
const cleaned = await client.query(
  `DELETE FROM events e
   USING bands b
   WHERE e.band_id = b.id AND b.name = 'Marko Louis' AND e.note = 'smoke'`,
);
console.log("deleted", cleaned.rowCount);
await client.end();
