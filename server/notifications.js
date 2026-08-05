import webpush from "web-push";
import { query } from "./db.js";
import { logger } from "./logger.js";

const VAPID_PUBLIC = String(process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE = String(process.env.VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || "mailto:support@chabar.rs").trim();

let vapidReady = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
  } catch (error) {
    logger.warn("VAPID setup failed", { message: error.message });
  }
}

export function getVapidPublicKey() {
  return vapidReady ? VAPID_PUBLIC : "";
}

export async function actorLabel(userId) {
  if (!userId) return "Neko";
  const result = await query(
    `SELECT display_name, email FROM profiles WHERE id = :id LIMIT 1`,
    { id: userId },
  );
  const row = result.rows[0];
  if (!row) return "Neko";
  return row.display_name || String(row.email || "").split("@")[0] || "Neko";
}

async function getBandMeta(bandId) {
  if (!bandId) return null;
  const result = await query(
    `SELECT id, name, kind FROM bands WHERE id = :bandId LIMIT 1`,
    { bandId },
  );
  return result.rows[0] || null;
}

/**
 * Resolve who should receive a band notification.
 * @param {"band_visible"|"leads"|"finance"|"membership"} audience
 */
async function resolveRecipients({
  bandId,
  audience,
  eventId = null,
  subjectUserId = null,
  actorUserId = null,
}) {
  const members = await query(
    `SELECT user_id, member_role FROM band_members WHERE band_id = :bandId`,
    { bandId },
  );

  let assigned = new Set();
  if (eventId && (audience === "band_visible")) {
    const rows = await query(
      `SELECT user_id FROM event_assignees WHERE event_id = :eventId`,
      { eventId },
    );
    assigned = new Set(rows.rows.map((r) => String(r.user_id)));
  }

  const recipients = new Set();
  for (const row of members.rows) {
    const userId = String(row.user_id);
    const role = row.member_role;
    if (actorUserId && userId === String(actorUserId)) continue;

    if (audience === "leads") {
      if (role === "owner" || role === "lead") recipients.add(userId);
      continue;
    }

    if (audience === "membership") {
      if (role === "owner" || role === "lead") recipients.add(userId);
      if (subjectUserId && userId === String(subjectUserId)) recipients.add(userId);
      continue;
    }

    if (audience === "finance") {
      if (role === "owner" || role === "lead") recipients.add(userId);
      else if (subjectUserId && userId === String(subjectUserId) && role === "member") {
        recipients.add(userId);
      }
      continue;
    }

    // band_visible
    if (role === "owner" || role === "lead" || role === "member") {
      recipients.add(userId);
    } else if (role === "saradnik" && eventId && assigned.has(userId)) {
      recipients.add(userId);
    }
  }

  if (subjectUserId && audience === "membership" && String(subjectUserId) !== String(actorUserId || "")) {
    recipients.add(String(subjectUserId));
  }

  return [...recipients];
}

async function insertNotifications(userIds, { type, bandId, actorUserId, message, payload }) {
  for (const userId of userIds) {
    await query(
      `INSERT INTO user_notifications (user_id, type, band_id, actor_user_id, message, payload)
       VALUES (:userId, :type, :bandId, :actorUserId, :message, CAST(:payload AS jsonb))`,
      {
        userId,
        type,
        bandId,
        actorUserId: actorUserId || null,
        message,
        payload: payload ? JSON.stringify(payload) : null,
      },
    );
  }
}

/** Direct notification to one user (e.g. schedule conflict). Best-effort. */
export async function notifyUser({
  userId,
  type,
  bandId = null,
  actorUserId = null,
  message,
  payload = null,
  title = "Chabar",
} = {}) {
  try {
    if (!userId || !type || !message) return;
    await insertNotifications([String(userId)], {
      type,
      bandId,
      actorUserId,
      message,
      payload,
    });
    await sendPushToUsers([String(userId)], {
      title,
      body: message,
      payload: payload || {},
    });
  } catch (error) {
    logger.warn("notifyUser failed", { type, userId, message: error.message });
  }
}

async function sendPushToUsers(userIds, { title, body, payload }) {
  if (!vapidReady || !userIds.length) return;

  const result = await query(
    `SELECT id, user_id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = ANY(:userIds::uuid[])`,
    { userIds },
  );

  const data = JSON.stringify({
    title: title || "Chabar",
    body: body || "",
    payload: payload || {},
  });

  await Promise.all(
    result.rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          data,
        );
        await query(
          `UPDATE push_subscriptions SET last_seen_at = NOW() WHERE id = :id`,
          { id: row.id },
        );
      } catch (error) {
        const status = error.statusCode || error.status;
        if (status === 404 || status === 410) {
          await query(`DELETE FROM push_subscriptions WHERE id = :id`, { id: row.id });
        } else {
          logger.warn("Web push send failed", {
            userId: row.user_id,
            status,
            message: error.message,
          });
        }
      }
    }),
  );
}

/**
 * Best-effort band notification. Never throws to callers.
 *
 * @param {object} opts
 * @param {string} opts.bandId
 * @param {string} opts.type
 * @param {string} opts.actorUserId
 * @param {string} opts.message
 * @param {"band_visible"|"leads"|"finance"|"membership"} [opts.audience]
 * @param {string|number|null} [opts.eventId]
 * @param {string|null} [opts.subjectUserId]
 * @param {object|null} [opts.payload]
 * @param {string} [opts.title]
 */
export async function notifyBandEvent({
  bandId,
  type,
  actorUserId,
  message,
  audience = "band_visible",
  eventId = null,
  subjectUserId = null,
  payload = null,
  title = "Chabar",
} = {}) {
  try {
    if (!bandId || !type || !message) return;
    const band = await getBandMeta(bandId);
    if (!band || band.kind === "personal") return;

    const recipients = await resolveRecipients({
      bandId,
      audience,
      eventId,
      subjectUserId,
      actorUserId,
    });
    if (!recipients.length) return;

    const deepPayload = {
      ...(payload || {}),
      bandId,
      type,
      eventId: eventId != null ? String(eventId) : payload?.eventId || null,
    };

    await insertNotifications(recipients, {
      type,
      bandId,
      actorUserId,
      message,
      payload: deepPayload,
    });

    await sendPushToUsers(recipients, {
      title,
      body: message,
      payload: deepPayload,
    });
  } catch (error) {
    logger.warn("notifyBandEvent failed", { type, bandId, message: error.message });
  }
}

/**
 * Self-test for the logged-in user (in-app + push if subscribed).
 * Bypasses band rules so you can verify delivery.
 */
export async function sendTestNotification(userId) {
  if (!userId) return { ok: false, detail: "Missing user" };
  const who = await actorLabel(userId);
  const message = `${who} · test obaveštenje (${new Date().toLocaleTimeString("sr-RS")})`;
  await query(
    `INSERT INTO user_notifications (user_id, type, band_id, actor_user_id, message, payload)
     VALUES (:userId, 'event_updated', NULL, :userId, :message, CAST(:payload AS jsonb))`,
    {
      userId,
      message,
      payload: JSON.stringify({ page: "settings", test: true }),
    },
  );
  await sendPushToUsers([userId], {
    title: "Chabar",
    body: message,
    payload: { page: "settings", test: true },
  });
  const subs = await query(
    `SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = :userId`,
    { userId },
  );
  return {
    ok: true,
    message,
    pushConfigured: vapidReady,
    pushSubscriptions: Number(subs.rows[0]?.n) || 0,
  };
}

export function formatEventLabel(event = {}) {
  const date = String(event.date || event.event_date_text || "").trim();
  const city = String(event.city || "").trim();
  const parts = [date, city].filter(Boolean);
  return parts.join(" ") || "termin";
}

export async function savePushSubscription(userId, subscription, userAgent = "") {
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const auth = String(subscription?.keys?.auth || "").trim();
  if (!userId || !endpoint || !p256dh || !auth) {
    const err = new Error("Invalid subscription");
    err.status = 400;
    throw err;
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
     VALUES (:userId, :endpoint, :p256dh, :auth, :userAgent, NOW())
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       last_seen_at = NOW()`,
    {
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: String(userAgent || "").slice(0, 400),
    },
  );
}

export async function deletePushSubscription(userId, endpoint) {
  const ep = String(endpoint || "").trim();
  if (!userId || !ep) return;
  await query(
    `DELETE FROM push_subscriptions WHERE user_id = :userId AND endpoint = :endpoint`,
    { userId, endpoint: ep },
  );
}
