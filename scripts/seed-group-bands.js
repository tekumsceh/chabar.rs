import "dotenv/config";
import pg from "pg";

const email = "tekumsceh@gmail.com";
const bandNames = ["Marko Louis", "Saint Louis"];
const databaseUrl = process.env.DATABASE_URL;
const palette = [
  "#276ef1",
  "#0b875b",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0e7490",
  "#c2410c",
  "#4338ca",
  "#15803d",
  "#a21caf",
];

function pickColor(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const user = await client.query("SELECT id FROM auth.users WHERE lower(email) = lower($1)", [email]);
  if (!user.rows[0]) throw new Error(`Owner user not found: ${email}`);
  const userId = user.rows[0].id;
  console.log("Owner:", userId);

  for (const name of bandNames) {
    let bandId = (
      await client.query(
        `SELECT id FROM bands WHERE name = $1 AND kind = 'group' LIMIT 1`,
        [name],
      )
    ).rows[0]?.id;

    if (!bandId) {
      bandId = (
        await client.query(
          `INSERT INTO bands (name, kind, color, created_by) VALUES ($1, 'group', $2, $3) RETURNING id`,
          [name, pickColor(name), userId],
        )
      ).rows[0].id;
      console.log("Created band:", name, bandId);
    } else {
      console.log("Band exists:", name, bandId);
    }

    await client.query(
      `INSERT INTO band_members (band_id, user_id, member_role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (band_id, user_id) DO UPDATE SET member_role = 'owner'`,
      [bandId, userId],
    );

    await client.query(
      `INSERT INTO settings (band_id, setting_key, setting_value)
       VALUES
         ($1, 'exchangeRate', '116.5'),
         ($1, 'asOfDate', to_char(NOW(), 'DD.MM.YYYY.'))
       ON CONFLICT DO NOTHING`,
      [bandId],
    );
  }

  const bands = await client.query(
    `SELECT b.name, b.kind, bm.member_role
     FROM band_members bm
     JOIN bands b ON b.id = bm.band_id
     WHERE bm.user_id = $1
     ORDER BY b.kind, b.name`,
    [userId],
  );
  console.log("Your bands:");
  for (const row of bands.rows) {
    console.log(` - ${row.name} (${row.kind}) role=${row.member_role}`);
  }
} finally {
  await client.end();
}
