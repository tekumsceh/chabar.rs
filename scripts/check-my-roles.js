import "dotenv/config";
import pg from "pg";

const email = process.argv[2] || "tekumsceh@gmail.com";
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const result = await client.query(
    `SELECT b.name, b.kind, bm.member_role, p.email, p.role AS profile_role
     FROM band_members bm
     JOIN bands b ON b.id = bm.band_id
     JOIN profiles p ON p.id = bm.user_id
     WHERE lower(p.email) = lower($1)
     ORDER BY b.kind, b.name`,
    [email],
  );
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end();
}
