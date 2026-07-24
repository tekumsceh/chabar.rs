/**
 * Convert Saint Louis "Isplata: meni" personal leftovers into real event_expenses
 * payable to the owner, then zero honorar/prevoz so they are not fake gigs.
 *
 * Usage: node scripts/convert-isplata-to-expenses.js
 */
import "dotenv/config";
import { pool, withTransaction } from "../server/db.js";

const OWNER_EMAIL = "tekumsceh@gmail.com";
const BAND_NAME = "Saint Louis";
const MARKER = "Isplata: meni";

function cleanDescription(note) {
  return String(note || "")
    .replace(/\s*·\s*Isplata:\s*meni\s*/gi, " ")
    .replace(/\bIsplata:\s*meni\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const result = await withTransaction(async (tx) => {
  const owner = await tx(
    `SELECT id FROM profiles WHERE lower(email) = lower(:email) LIMIT 1`,
    { email: OWNER_EMAIL },
  );
  if (!owner.rows[0]) throw new Error("Owner not found");
  const userId = owner.rows[0].id;

  const band = await tx(
    `SELECT id FROM bands WHERE kind = 'group' AND name = :name LIMIT 1`,
    { name: BAND_NAME },
  );
  if (!band.rows[0]) throw new Error("Band not found");
  const bandId = band.rows[0].id;

  const events = await tx(
    `SELECT e.id, e.note, e.price_eur, e.transport_rsd,
            COALESCE(f.price_eur, e.price_eur, 0) AS fee_eur,
            COALESCE(f.transport_rsd, e.transport_rsd, 0) AS fee_tr
     FROM events e
     LEFT JOIN event_member_finance f
       ON f.event_id = e.id AND f.user_id = :userId
     WHERE e.band_id = :bandId
       AND e.note ILIKE '%' || :marker || '%'
     ORDER BY e.id`,
    { bandId, userId, marker: MARKER },
  );

  let created = 0;
  let cleaned = 0;

  for (const row of events.rows) {
    const description = cleanDescription(row.note) || "Trošak";
    const feeEur = Number(row.fee_eur) || 0;
    const feeTr = Number(row.fee_tr) || 0;

    if (feeEur > 0) {
      await tx(
        `INSERT INTO event_expenses
           (event_id, band_id, amount, currency, description, payee_kind, payee_user_id, created_by)
         VALUES
           (:eventId, :bandId, :amount, 'EUR', :description, 'member', :userId, :userId)`,
        {
          eventId: row.id,
          bandId,
          amount: feeEur,
          description,
          userId,
        },
      );
      created += 1;
    }

    if (feeTr > 0) {
      await tx(
        `INSERT INTO event_expenses
           (event_id, band_id, amount, currency, description, payee_kind, payee_user_id, created_by)
         VALUES
           (:eventId, :bandId, :amount, 'RSD', :description, 'member', :userId, :userId)`,
        {
          eventId: row.id,
          bandId,
          amount: feeTr,
          description,
          userId,
        },
      );
      created += 1;
    }

    await tx(
      `UPDATE events
       SET note = :note, price_eur = 0, transport_rsd = 0
       WHERE id = :id AND band_id = :bandId`,
      {
        id: row.id,
        bandId,
        note: description === "Trošak" && !cleanDescription(row.note) ? "" : description,
      },
    );

    await tx(
      `INSERT INTO event_member_finance (event_id, user_id, price_eur, transport_rsd)
       VALUES (:eventId, :userId, 0, 0)
       ON CONFLICT (event_id, user_id) DO UPDATE
       SET price_eur = 0, transport_rsd = 0, updated_at = NOW()`,
      { eventId: row.id, userId },
    );

    cleaned += 1;
  }

  return { events: cleaned, expenses: created };
});

console.log("converted", result);
await pool.end();
