import "dotenv/config";
import mysql from "mysql2/promise";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL (or SUPABASE_DB_URL). Add it to .env first.");
  process.exit(1);
}

const mysqlConnection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ioorganize",
});

const pgClient = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

await pgClient.connect();

try {
  const [events] = await mysqlConnection.query(
    `SELECT id, sort_order, event_date_text, city, venue, note, price_eur, transport_rsd
     FROM events
     ORDER BY sort_order, id`,
  );
  const [payments] = await mysqlConnection.query(
    `SELECT id, sort_order, payment_date_text, amount, currency
     FROM payments
     ORDER BY sort_order, id`,
  );
  const [settings] = await mysqlConnection.query(`SELECT setting_key, setting_value FROM settings`);

  await pgClient.query("BEGIN");
  await pgClient.query("TRUNCATE TABLE payments, events, settings RESTART IDENTITY CASCADE");

  for (const event of events) {
    await pgClient.query(
      `INSERT INTO events
        (id, sort_order, event_date_text, city, venue, note, price_eur, transport_rsd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.id,
        event.sort_order,
        event.event_date_text,
        event.city,
        event.venue,
        event.note,
        event.price_eur,
        event.transport_rsd,
      ],
    );
  }

  for (const payment of payments) {
    await pgClient.query(
      `INSERT INTO payments
        (id, sort_order, payment_date_text, amount, currency)
       VALUES ($1, $2, $3, $4, $5)`,
      [payment.id, payment.sort_order, payment.payment_date_text, payment.amount, payment.currency],
    );
  }

  for (const setting of settings) {
    await pgClient.query(
      `INSERT INTO settings (setting_key, setting_value)
       VALUES ($1, $2)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      [setting.setting_key, setting.setting_value],
    );
  }

  if (events.length) {
    await pgClient.query(`SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT MAX(id) FROM events))`);
  }
  if (payments.length) {
    await pgClient.query(`SELECT setval(pg_get_serial_sequence('payments', 'id'), (SELECT MAX(id) FROM payments))`);
  }

  await pgClient.query("COMMIT");

  console.log(`Migrated to Supabase: ${events.length} events, ${payments.length} payments, ${settings.length} settings.`);
} catch (error) {
  await pgClient.query("ROLLBACK");
  throw error;
} finally {
  await mysqlConnection.end();
  await pgClient.end();
}
