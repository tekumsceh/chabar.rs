import { query } from "./db.js";
import { logger } from "./logger.js";
import { actorLabel, notifyUser } from "./notifications.js";

function eventDateEqualsSql(eventAlias, dateParam = "dateText") {
  return `to_date(regexp_replace(trim(${eventAlias}.event_date_text), '\\.+$', ''), 'DD.MM.YYYY')
    = to_date(regexp_replace(trim(:${dateParam}), '\\.+$', ''), 'DD.MM.YYYY')`;
}

async function getBandName(bandId) {
  if (!bandId) return "";
  const result = await query(`SELECT name FROM bands WHERE id = :bandId LIMIT 1`, { bandId });
  return result.rows[0]?.name || "";
}

async function canSeeNewEvent(userId, memberRole, newEventId) {
  if (memberRole === "owner" || memberRole === "lead" || memberRole === "member") return true;
  if (memberRole !== "saradnik") return false;
  const assigned = await query(
    `SELECT 1 FROM event_assignees WHERE event_id = :eventId AND user_id = :userId LIMIT 1`,
    { eventId: newEventId, userId },
  );
  return Boolean(assigned.rows[0]);
}

async function findCrossBandConflictsForUser(userId, { newEventId, newBandId, dateText }) {
  const result = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.city, e.venue, e.event_date_text
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     WHERE e.id != :newEventId
       AND e.band_id != :newBandId
       AND ${eventDateEqualsSql("e", "dateText")}
       AND (
         bm.member_role IN ('owner', 'lead', 'member')
         OR EXISTS (
           SELECT 1 FROM event_assignees ea
           WHERE ea.event_id = e.id AND ea.user_id = :userId
         )
       )
     ORDER BY b.name, e.id
     LIMIT 8`,
    { userId, newEventId, newBandId, dateText },
  );
  return result.rows;
}

function formatConflictList(rows) {
  return rows
    .map((row) => {
      const place = [row.city, row.venue].filter(Boolean).join(", ");
      return place ? `${row.band_name} (${place})` : String(row.band_name || "bend");
    })
    .join("; ");
}

/**
 * Notify band members (except actor) who already have another gig the same day in a different band.
 */
export async function notifyCrossBandScheduleConflicts({
  actorUserId,
  newEventId,
  newBandId,
  dateText,
  newEventLabel = "",
}) {
  try {
    if (!newEventId || !newBandId || !dateText) return;

    const members = await query(
      `SELECT user_id, member_role FROM band_members WHERE band_id = :bandId`,
      { bandId: newBandId },
    );

    const who = await actorLabel(actorUserId);
    const newBandName = await getBandName(newBandId);
    const label = newEventLabel || dateText;

    for (const row of members.rows) {
      const userId = String(row.user_id);
      if (userId === String(actorUserId || "")) continue;

      const visible = await canSeeNewEvent(userId, row.member_role, newEventId);
      if (!visible) continue;

      const conflicts = await findCrossBandConflictsForUser(userId, {
        newEventId,
        newBandId,
        dateText,
      });
      if (!conflicts.length) continue;

      const message = `${who} je dodao/la termin ${label} (${newBandName}). Istog dana već imaš: ${formatConflictList(conflicts)}.`;

      await notifyUser({
        userId,
        type: "schedule_conflict",
        bandId: newBandId,
        actorUserId,
        message,
        payload: {
          page: "schedule",
          eventId: String(newEventId),
          bandId: newBandId,
          conflictEventIds: conflicts.map((c) => String(c.id)),
        },
        title: "Preklapanje datuma",
      });
    }
  } catch (error) {
    logger.warn("notifyCrossBandScheduleConflicts failed", { message: error.message });
  }
}
