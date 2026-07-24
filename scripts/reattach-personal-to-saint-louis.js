/**
 * One-shot: move tekumsceh Personal band events + payments onto Saint Louis.
 * Amounts stay; notes get " · Isplata: meni" so the claim is marked as payable to the owner.
 *
 * Usage: node scripts/reattach-personal-to-saint-louis.js
 */
import "dotenv/config";
import { query, pool, withTransaction } from "../server/db.js";

const OWNER_EMAIL = "tekumsceh@gmail.com";
const TARGET_BAND_NAME = "Saint Louis";
const MARKER = "Isplata: meni";

const owner = await query(
  `SELECT id, email FROM profiles WHERE lower(email) = lower(:email) LIMIT 1`,
  { email: OWNER_EMAIL },
);
if (!owner.rows[0]) {
  throw new Error(`Owner not found: ${OWNER_EMAIL}`);
}
const userId = owner.rows[0].id;

const personal = await query(
  `SELECT b.id, b.name
   FROM bands b
   JOIN band_members bm ON bm.band_id = b.id AND bm.user_id = :userId
   WHERE b.kind = 'personal'
   LIMIT 1`,
  { userId },
);
if (!personal.rows[0]) {
  throw new Error("Personal band not found");
}
const personalBandId = personal.rows[0].id;

const target = await query(
  `SELECT id, name FROM bands WHERE kind = 'group' AND name = :name LIMIT 1`,
  { name: TARGET_BAND_NAME },
);
if (!target.rows[0]) {
  throw new Error(`Target band not found: ${TARGET_BAND_NAME}`);
}
const saintLouisId = target.rows[0].id;

const member = await query(
  `SELECT member_role FROM band_members
   WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
  { bandId: saintLouisId, userId },
);
if (!member.rows[0]) {
  throw new Error("Owner is not a member of Saint Louis");
}

const beforeEvents = await query(
  `SELECT id, note, price_eur, transport_rsd FROM events WHERE band_id = :bandId ORDER BY id`,
  { bandId: personalBandId },
);
const beforePayments = await query(
  `SELECT COUNT(*)::int AS n FROM payments WHERE band_id = :bandId`,
  { bandId: personalBandId },
);

console.log("owner", OWNER_EMAIL, userId);
console.log("from Personal", personalBandId, "events", beforeEvents.rows.length);
console.log("payments", beforePayments.rows[0].n);
console.log("to", TARGET_BAND_NAME, saintLouisId);

if (beforeEvents.rows.length === 0 && beforePayments.rows[0].n === 0) {
  console.log("Nothing to move.");
  await pool.end();
  process.exit(0);
}

const result = await withTransaction(async (tx) => {
  let movedEvents = 0;
  for (const row of beforeEvents.rows) {
    const note = String(row.note || "").trim();
    let nextNote = note;
    if (!note.toLowerCase().includes(MARKER.toLowerCase())) {
      nextNote = note ? `${note} · ${MARKER}` : MARKER;
    }
    await tx(
      `UPDATE events
       SET band_id = :toBandId, note = :note
       WHERE id = :id AND band_id = :fromBandId`,
      {
        toBandId: saintLouisId,
        note: nextNote,
        id: row.id,
        fromBandId: personalBandId,
      },
    );
    movedEvents += 1;
  }

  const pay = await tx(
    `UPDATE payments SET band_id = :toBandId WHERE band_id = :fromBandId RETURNING id`,
    { toBandId: saintLouisId, fromBandId: personalBandId },
  );

  await tx(`UPDATE event_expenses SET band_id = :toBandId WHERE band_id = :fromBandId`, {
    toBandId: saintLouisId,
    fromBandId: personalBandId,
  });

  return { movedEvents, movedPayments: pay.rows.length };
});

console.log("moved events", result.movedEvents, "payments", result.movedPayments);

const left = await query(
  `SELECT
     (SELECT COUNT(*)::int FROM events WHERE band_id = :bandId) AS events,
     (SELECT COUNT(*)::int FROM payments WHERE band_id = :bandId) AS payments`,
  { bandId: personalBandId },
);
console.log("personal remaining", left.rows[0]);
await pool.end();
