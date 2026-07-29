/**
 * Dobrakovo (13.07.2026) — 50 EUR is a personal expense (Carina), not honorar.
 * Creates event_expense payable to owner, zeros honorar on event + member finance.
 *
 * Usage: node scripts/fix-dobrakovo-expense.js
 */
import "dotenv/config";
import { pool, withTransaction } from "../server/db.js";

const OWNER_EMAIL = "tekumsceh@gmail.com";
const EVENT_DATE = "13.07.2026.";
const CITY = "Dobrakovo";

const result = await withTransaction(async (tx) => {
  const owner = await tx(
    `SELECT id FROM profiles WHERE lower(email) = lower(:email) LIMIT 1`,
    { email: OWNER_EMAIL },
  );
  if (!owner.rows[0]) throw new Error("Owner not found");
  const userId = owner.rows[0].id;

  const event = await tx(
    `SELECT e.id, e.band_id, e.event_date_text, e.city, e.venue, e.note,
            COALESCE(f.price_eur, e.price_eur, 0) AS fee_eur
     FROM events e
     LEFT JOIN event_member_finance f ON f.event_id = e.id AND f.user_id = :userId
     WHERE lower(trim(e.city)) = lower(:city)
       AND regexp_replace(trim(e.event_date_text), '\\.+$', '') = regexp_replace(trim(:date), '\\.+$', '')
     ORDER BY e.id
     LIMIT 1`,
    { userId, city: CITY, date: EVENT_DATE },
  );

  if (!event.rows[0]) throw new Error(`Event not found: ${EVENT_DATE} ${CITY}`);
  const row = event.rows[0];
  const amount = Number(row.fee_eur) || 50;
  const description = String(row.venue || "Carina").trim() || "Carina";

  const existing = await tx(
    `SELECT id FROM event_expenses
     WHERE event_id = :eventId
       AND payee_kind = 'member'
       AND payee_user_id = :userId
       AND currency = 'EUR'
       AND amount = :amount
     LIMIT 1`,
    { eventId: row.id, userId, amount },
  );

  let expenseId = existing.rows[0]?.id || null;
  if (!expenseId) {
    const inserted = await tx(
      `INSERT INTO event_expenses
         (event_id, band_id, amount, currency, description, payee_kind, payee_user_id, created_by)
       VALUES
         (:eventId, :bandId, :amount, 'EUR', :description, 'member', :userId, :userId)
       RETURNING id`,
      {
        eventId: row.id,
        bandId: row.band_id,
        amount,
        description,
        userId,
      },
    );
    expenseId = inserted.rows[0].id;
  }

  await tx(
    `UPDATE events SET price_eur = 0, transport_rsd = 0 WHERE id = :id`,
    { id: row.id },
  );

  await tx(
    `INSERT INTO event_member_finance (event_id, user_id, price_eur, transport_rsd)
     VALUES (:eventId, :userId, 0, 0)
     ON CONFLICT (event_id, user_id) DO UPDATE
     SET price_eur = 0, transport_rsd = 0, updated_at = NOW()`,
    { eventId: row.id, userId },
  );

  return {
    eventId: row.id,
    date: row.event_date_text,
    city: row.city,
    expenseId,
    amountEur: amount,
    description,
    skippedInsert: Boolean(existing.rows[0]),
  };
});

console.log(JSON.stringify(result, null, 2));
await pool.end();
