import { query } from "./db.js";
import { logger } from "./logger.js";

/**
 * Append-only mutation ledger. Never logs plain views.
 * Failures are logged but do not throw — callers should prefer wrapping
 * primary write + audit in withTransaction when possible.
 */
export async function writeAudit(
  {
    entityType,
    entityId,
    bandId = null,
    actorUserId = null,
    action,
    before = null,
    after = null,
  },
  runQuery = query,
) {
  try {
    await runQuery(
      `INSERT INTO transaction_audit
        (entity_type, entity_id, band_id, actor_user_id, action, before_json, after_json)
       VALUES (
         :entityType,
         :entityId,
         :bandId,
         :actorUserId,
         :action,
         CAST(:beforeJson AS jsonb),
         CAST(:afterJson AS jsonb)
       )`,
      {
        entityType,
        entityId: String(entityId),
        bandId: bandId || null,
        actorUserId: actorUserId || null,
        action,
        beforeJson: before == null ? null : JSON.stringify(before),
        afterJson: after == null ? null : JSON.stringify(after),
      },
    );
  } catch (error) {
    logger.warn("transaction_audit write failed", {
      entityType,
      entityId: String(entityId),
      action,
      detail: error.message,
    });
  }
}

export function snapshotEvent(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    bandId: row.band_id ?? row.bandId ?? null,
    date: row.event_date_text ?? row.date ?? "",
    city: row.city ?? "",
    venue: row.venue ?? "",
    note: row.note ?? "",
    priceEur: Number(row.price_eur ?? row.priceEur ?? 0),
    transportRsd: Number(row.transport_rsd ?? row.transportRsd ?? 0),
  };
}

export function snapshotPayment(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    bandId: row.band_id ?? row.bandId ?? null,
    userId: row.user_id ?? row.userId ?? null,
    date: row.payment_date_text ?? row.date ?? "",
    amount: Number(row.amount ?? 0),
    currency: row.currency === "RSD" ? "RSD" : "EUR",
  };
}

export function snapshotMemberFinance(row) {
  if (!row) return null;
  return {
    eventId: row.event_id ?? row.eventId ?? null,
    userId: row.user_id ?? row.userId ?? null,
    priceEur: Number(row.price_eur ?? row.priceEur ?? 0),
    transportRsd: Number(row.transport_rsd ?? row.transportRsd ?? 0),
  };
}
