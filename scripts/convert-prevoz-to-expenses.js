/**
 * Convert hardcoded event_member_finance.transport_rsd (prevoz) into real
 * event_expenses payable to tekumsceh, then zero transport so it is not double-counted.
 *
 * Usage: node scripts/convert-prevoz-to-expenses.js
 */
import "dotenv/config";
import { pool, withTransaction } from "../server/db.js";

const OWNER_EMAIL = "tekumsceh@gmail.com";

const result = await withTransaction(async (tx) => {
  const owner = await tx(
    `SELECT id FROM profiles WHERE lower(email) = lower(:email) LIMIT 1`,
    { email: OWNER_EMAIL },
  );
  if (!owner.rows[0]) throw new Error("Owner not found");
  const userId = owner.rows[0].id;

  const rows = await tx(
    `SELECT e.id, e.band_id, e.event_date_text AS date, e.city, e.venue, b.name AS band,
            COALESCE(f.transport_rsd, e.transport_rsd, 0) AS transport_rsd
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f ON f.event_id = e.id AND f.user_id = :userId
     WHERE COALESCE(f.transport_rsd, e.transport_rsd, 0) > 0
     ORDER BY e.id`,
    { userId },
  );

  const converted = [];

  for (const row of rows.rows) {
    const amount = Number(row.transport_rsd) || 0;
    if (amount <= 0) continue;

    const existing = await tx(
      `SELECT id FROM event_expenses
       WHERE event_id = :eventId
         AND payee_kind = 'member'
         AND payee_user_id = :userId
         AND currency = 'RSD'
         AND amount = :amount
         AND lower(description) = 'prevoz'
       LIMIT 1`,
      { eventId: row.id, userId, amount },
    );
    if (existing.rows[0]) {
      // Already converted; still clear transport.
    } else {
      await tx(
        `INSERT INTO event_expenses
           (event_id, band_id, amount, currency, description, payee_kind, payee_user_id, created_by)
         VALUES
           (:eventId, :bandId, :amount, 'RSD', 'Prevoz', 'member', :userId, :userId)`,
        {
          eventId: row.id,
          bandId: row.band_id,
          amount,
          userId,
        },
      );
    }

    await tx(`UPDATE events SET transport_rsd = 0 WHERE id = :id`, { id: row.id });
    await tx(
      `UPDATE event_member_finance
       SET transport_rsd = 0, updated_at = NOW()
       WHERE event_id = :eventId AND user_id = :userId`,
      { eventId: row.id, userId },
    );

    converted.push({
      id: row.id,
      date: row.date,
      band: row.band,
      city: row.city,
      venue: row.venue,
      amountRsd: amount,
      skippedInsert: Boolean(existing.rows[0]),
    });
  }

  return { count: converted.length, converted };
});

console.log(JSON.stringify(result, null, 2));
await pool.end();
