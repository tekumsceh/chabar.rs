import { query } from "./db.js";

function eventFinanceAuditMatches(eventIdStr) {
  return `
    (
      (a.entity_type = 'event' AND a.entity_id = :eventIdStr)
      OR (
        a.entity_type = 'event_member_finance'
        AND split_part(a.entity_id, ':', 1) = :eventIdStr
      )
      OR (
        a.entity_type = 'event_expense'
        AND COALESCE(a.after_json->>'eventId', a.before_json->>'eventId') = :eventIdStr
      )
    )
  `;
}

export function isFinanceRelevantAuditEntry(entry) {
  if (entry.entityType === "event_member_finance" || entry.entityType === "event_expense") {
    return true;
  }
  if (entry.entityType !== "event") return false;

  const before = entry.before || {};
  const after = entry.after || {};
  if (entry.action === "insert") {
    return (Number(after.priceEur) || 0) > 0 || (Number(after.transportRsd) || 0) > 0;
  }
  if (entry.action === "delete") return false;
  return (
    Number(before.priceEur) !== Number(after.priceEur) ||
    Number(before.transportRsd) !== Number(after.transportRsd)
  );
}

function mapAuditRow(row) {
  const entry = {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    before: row.before_json,
    after: row.after_json,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    memberUserId: null,
    memberName: null,
  };

  if (entry.entityType === "event_member_finance") {
    const parts = String(entry.entityId || "").split(":");
    entry.memberUserId = parts[1] || null;
  }

  if (entry.entityType === "event_expense") {
    const snap = entry.after || entry.before || {};
    entry.memberUserId = snap.payeeUserId || null;
  }

  return entry;
}

async function enrichMemberNames(entries) {
  const ids = [
    ...new Set(
      entries.map((entry) => entry.memberUserId).filter(Boolean),
    ),
  ];
  if (!ids.length) return entries;

  const profiles = await query(
    `SELECT id,
            COALESCE(NULLIF(display_name, ''), NULLIF(email, ''), 'Korisnik') AS name
     FROM profiles
     WHERE id = ANY(:ids::uuid[])`,
    { ids },
  );
  const byId = new Map(profiles.rows.map((row) => [row.id, row.name]));

  return entries.map((entry) => ({
    ...entry,
    memberName: entry.memberUserId ? byId.get(entry.memberUserId) || null : null,
  }));
}

export async function getEventFinanceAudit(eventId, bandId, { limit = 80 } = {}) {
  const eventIdStr = String(eventId);
  const capped = Math.min(Math.max(Number(limit) || 80, 1), 150);

  const result = await query(
    `SELECT a.id, a.entity_type, a.entity_id, a.action, a.before_json, a.after_json, a.created_at,
            a.actor_user_id,
            COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Korisnik') AS actor_name
     FROM transaction_audit a
     LEFT JOIN profiles p ON p.id = a.actor_user_id
     WHERE a.band_id = :bandId
       AND ${eventFinanceAuditMatches(eventIdStr)}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT :limit`,
    { bandId, eventIdStr, limit: capped },
  );

  const entries = result.rows
    .map(mapAuditRow)
    .filter(isFinanceRelevantAuditEntry);

  return enrichMemberNames(entries);
}
