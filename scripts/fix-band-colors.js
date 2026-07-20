import "dotenv/config";
import pg from "pg";

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

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const bands = (
    await client.query(`SELECT id, name, color FROM bands ORDER BY kind, name, created_at`)
  ).rows;
  const used = new Set();

  for (const band of bands) {
    let color = String(band.color || "").toLowerCase();
    if (!color || used.has(color)) {
      color = (palette.find((item) => !used.has(item.toLowerCase())) || palette[used.size % palette.length]).toLowerCase();
      await client.query(`UPDATE bands SET color = $1 WHERE id = $2`, [color, band.id]);
    }
    used.add(color);
  }

  const result = await client.query(`SELECT name, color FROM bands ORDER BY name`);
  console.log(result.rows);
} finally {
  await client.end();
}
