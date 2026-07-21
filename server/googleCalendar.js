import crypto from "node:crypto";
import { parseDate, toIsoDate } from "../src/calculations.js";
import { query } from "./db.js";
import { logger } from "./logger.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  // Required to list calendars (calendarList) — events scope alone is not enough
  "https://www.googleapis.com/auth/calendar.readonly",
];
const STATE_TTL_MS = 15 * 60_000;

function clientId() {
  return String(process.env.GOOGLE_CALENDAR_CLIENT_ID || "").trim();
}

function clientSecret() {
  return String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "").trim();
}

/** Per-environment callback. Register BOTH local + live on the Google OAuth client. */
export function redirectUri() {
  const explicit = String(process.env.GOOGLE_CALENDAR_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const port = Number(process.env.API_PORT || 3001);
  return `http://localhost:${port}/api/google/calendar/callback`;
}

export function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
}

export function googleCalendarConfigured() {
  return Boolean(clientId() && clientSecret());
}

function encKey() {
  const raw =
    process.env.GOOGLE_TOKEN_ENC_KEY ||
    `${clientSecret()}:chabar-google-calendar`;
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

function decrypt(payload) {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64] = String(payload).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", encKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", encKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data?.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildAuthUrl({ userId, returnTo = "settings", bandId = "" }) {
  if (!googleCalendarConfigured()) {
    const error = new Error("Google Calendar nije konfigurisan na serveru.");
    error.status = 503;
    throw error;
  }
  const state = signState({
    userId,
    returnTo,
    bandId: bandId || "",
    exp: Date.now() + STATE_TTL_MS,
  });
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error("Google token exchange failed", { status: res.status, data });
    const error = new Error(data.error_description || data.error || "Google OAuth nije uspeo");
    error.status = 502;
    throw error;
  }
  return data;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error("Google token refresh failed", { status: res.status, data });
    const error = new Error("Google sesija je istekla — poveži kalendar ponovo.");
    error.status = 401;
    throw error;
  }
  return data;
}

async function fetchGoogleUser(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return res.json().catch(() => ({}));
}

export async function handleOAuthCallback(code, stateToken) {
  const state = verifyState(stateToken);
  if (!state?.userId) {
    const error = new Error("Nevažeći OAuth state");
    error.status = 400;
    throw error;
  }
  const tokens = await exchangeCode(code);
  if (!tokens.access_token) {
    const error = new Error("Google nije vratio access token");
    error.status = 502;
    throw error;
  }
  const profile = await fetchGoogleUser(tokens.access_token);
  const existing = await query(
    `SELECT refresh_token_enc FROM user_google_accounts WHERE user_id = :userId`,
    { userId: state.userId },
  );
  const prevRefresh = decrypt(existing.rows[0]?.refresh_token_enc || "");
  const refresh = tokens.refresh_token || prevRefresh;
  if (!refresh) {
    logger.warn("Google OAuth without refresh_token", { userId: state.userId });
  }
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : null;

  await query(
    `INSERT INTO user_google_accounts
      (user_id, google_sub, email, access_token_enc, refresh_token_enc, token_expires_at, scopes, updated_at)
     VALUES
      (:userId, :sub, :email, :access, :refresh, :expires, :scopes, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       google_sub = EXCLUDED.google_sub,
       email = EXCLUDED.email,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = COALESCE(NULLIF(EXCLUDED.refresh_token_enc, ''), user_google_accounts.refresh_token_enc),
       token_expires_at = EXCLUDED.token_expires_at,
       scopes = EXCLUDED.scopes,
       updated_at = NOW()`,
    {
      userId: state.userId,
      sub: profile.sub || null,
      email: profile.email || null,
      access: encrypt(tokens.access_token),
      refresh: encrypt(refresh || ""),
      expires: expiresAt,
      scopes: SCOPES.join(" "),
    },
  );

  await query(
    `INSERT INTO user_calendar_prefs (user_id, personal_sync_enabled, updated_at)
     VALUES (:userId, FALSE, NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    { userId: state.userId },
  );

  return {
    userId: state.userId,
    returnTo: state.returnTo || "settings",
    bandId: state.bandId || "",
    email: profile.email || "",
  };
}

async function getValidAccessToken(userId) {
  const result = await query(
    `SELECT access_token_enc, refresh_token_enc, token_expires_at
     FROM user_google_accounts WHERE user_id = :userId`,
    { userId },
  );
  const row = result.rows[0];
  if (!row) return null;

  const expires = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  let access = decrypt(row.access_token_enc);
  if (access && expires && Date.now() < expires - 60_000) return access;

  const refresh = decrypt(row.refresh_token_enc);
  if (!refresh) return access || null;

  const refreshed = await refreshAccessToken(refresh);
  access = refreshed.access_token;
  const expiresAt = refreshed.expires_in
    ? new Date(Date.now() + Number(refreshed.expires_in) * 1000)
    : null;
  await query(
    `UPDATE user_google_accounts
     SET access_token_enc = :access,
         token_expires_at = :expires,
         updated_at = NOW()
     WHERE user_id = :userId`,
    { userId, access: encrypt(access), expires: expiresAt },
  );
  return access;
}

async function googleFetch(userId, path, { method = "GET", body } = {}) {
  const token = await getValidAccessToken(userId);
  if (!token) {
    const error = new Error("Google kalendar nije povezan.");
    error.status = 400;
    throw error;
  }
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn("Google Calendar API error", {
      path,
      status: res.status,
      message: data?.error?.message,
      reasons: data?.error?.errors,
    });
    const error = new Error(data?.error?.message || `Google Calendar greška (${res.status})`);
    error.status = res.status === 401 ? 401 : res.status === 400 ? 400 : 502;
    throw error;
  }
  return data;
}

export async function getGoogleAccountStatus(userId) {
  const [account, prefs] = await Promise.all([
    query(
      `SELECT email, updated_at FROM user_google_accounts WHERE user_id = :userId`,
      { userId },
    ),
    query(
      `SELECT personal_sync_enabled, personal_calendar_id
       FROM user_calendar_prefs WHERE user_id = :userId`,
      { userId },
    ),
  ]);
  const row = account.rows[0];
  const pref = prefs.rows[0];
  return {
    configured: googleCalendarConfigured(),
    connected: Boolean(row),
    email: row?.email || "",
    personalSyncEnabled: Boolean(pref?.personal_sync_enabled),
    personalCalendarId: pref?.personal_calendar_id || "primary",
  };
}

export async function disconnectGoogleAccount(userId) {
  await query(`DELETE FROM user_google_accounts WHERE user_id = :userId`, { userId });
  await query(
    `UPDATE user_calendar_prefs
     SET personal_sync_enabled = FALSE, updated_at = NOW()
     WHERE user_id = :userId`,
    { userId },
  );
}

export async function updatePersonalPrefs(userId, { personalSyncEnabled, personalCalendarId }) {
  await query(
    `INSERT INTO user_calendar_prefs (user_id, personal_sync_enabled, personal_calendar_id, updated_at)
     VALUES (:userId, :enabled, :calendarId, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       personal_sync_enabled = EXCLUDED.personal_sync_enabled,
       personal_calendar_id = COALESCE(EXCLUDED.personal_calendar_id, user_calendar_prefs.personal_calendar_id),
       updated_at = NOW()`,
    {
      userId,
      enabled: Boolean(personalSyncEnabled),
      calendarId: personalCalendarId || "primary",
    },
  );
  return getGoogleAccountStatus(userId);
}

export async function listCalendars(userId) {
  const data = await googleFetch(userId, "/users/me/calendarList?minAccessRole=writer");
  return (data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || item.id,
    primary: Boolean(item.primary),
    accessRole: item.accessRole || "",
  }));
}

export async function getBandCalendarLink(bandId) {
  const result = await query(
    `SELECT google_calendar_id, calendar_summary, connected_by_user_id, sync_enabled, last_synced_at
     FROM band_google_calendars WHERE band_id = :bandId`,
    { bandId },
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    calendarId: row.google_calendar_id,
    summary: row.calendar_summary || "",
    connectedByUserId: row.connected_by_user_id,
    syncEnabled: Boolean(row.sync_enabled),
    lastSyncedAt: row.last_synced_at,
  };
}

export async function linkBandCalendar({ bandId, userId, calendarId, summary, syncEnabled = true }) {
  const existing = await getBandCalendarLink(bandId);
  if (existing && existing.connectedByUserId !== userId) {
    const error = new Error("Ovaj bend već ima povezan kalendar. Samo onaj ko ga je povezao može ga menjati (v1).");
    error.status = 403;
    throw error;
  }

  await query(
    `INSERT INTO band_google_calendars
      (band_id, google_calendar_id, calendar_summary, connected_by_user_id, sync_enabled, updated_at)
     VALUES (:bandId, :calendarId, :summary, :userId, :syncEnabled, NOW())
     ON CONFLICT (band_id) DO UPDATE SET
       google_calendar_id = EXCLUDED.google_calendar_id,
       calendar_summary = EXCLUDED.calendar_summary,
       sync_enabled = EXCLUDED.sync_enabled,
       updated_at = NOW()`,
    {
      bandId,
      calendarId,
      summary: summary || "",
      userId,
      syncEnabled: Boolean(syncEnabled),
    },
  );
  return getBandCalendarLink(bandId);
}

export async function unlinkBandCalendar({ bandId, userId, isOwnerOrLead = false }) {
  const existing = await getBandCalendarLink(bandId);
  if (!existing) return;
  if (existing.connectedByUserId !== userId && !isOwnerOrLead) {
    const error = new Error("Samo osoba koja je povezala kalendar može ga odvezati (v1).");
    error.status = 403;
    throw error;
  }
  // Owner/lead unlock later — for now still allow connector only unless flag passed for future.
  if (existing.connectedByUserId !== userId) {
    const error = new Error("Samo osoba koja je povezala kalendar može ga odvezati (v1).");
    error.status = 403;
    throw error;
  }
  await query(`DELETE FROM band_google_calendars WHERE band_id = :bandId`, { bandId });
}

export async function setBandCalendarSyncEnabled({ bandId, userId, syncEnabled }) {
  const existing = await getBandCalendarLink(bandId);
  if (!existing) {
    const error = new Error("Bend nema povezan Google kalendar.");
    error.status = 400;
    throw error;
  }
  if (existing.connectedByUserId !== userId) {
    const error = new Error("Samo osoba koja je povezala kalendar može menjati sync (v1).");
    error.status = 403;
    throw error;
  }
  await query(
    `UPDATE band_google_calendars
     SET sync_enabled = :syncEnabled, updated_at = NOW()
     WHERE band_id = :bandId`,
    { bandId, syncEnabled: Boolean(syncEnabled) },
  );
  return getBandCalendarLink(bandId);
}

function eventTitle(event, bandName = "") {
  const city = String(event.city || "").trim();
  const venue = String(event.venue || "").trim();
  const note = String(event.note || "").trim();
  const place = [city, venue].filter(Boolean).join(" · ");
  if (place) return bandName ? `${bandName}: ${place}` : place;
  if (note) return bandName ? `${bandName}: ${note}` : note;
  return bandName || "Termin";
}

function toAllDayGoogleDate(dateText) {
  // toIsoDate expects dd.mm.yyyy text (not a Date object)
  const iso = toIsoDate(dateText);
  return iso || null;
}

function buildGoogleEventBody(event, { bandName = "", chabarEventId }) {
  const date = toAllDayGoogleDate(event.date || event.event_date_text);
  if (!date) return null;
  const location = [event.city, event.venue].filter(Boolean).join(", ");

  const detailLines = [];
  if (event.note) detailLines.push(String(event.note).trim());
  if (event.city) detailLines.push(`Grad: ${String(event.city).trim()}`);
  if (event.venue) detailLines.push(`Lokal: ${String(event.venue).trim()}`);
  const price = Number(event.priceEur ?? event.price_eur);
  if (Number.isFinite(price) && price > 0) detailLines.push(`Cena: ${price} EUR`);
  const transport = Number(event.transportRsd ?? event.transport_rsd);
  if (Number.isFinite(transport) && transport > 0) detailLines.push(`Prevoz: ${transport} RSD`);
  detailLines.push("");
  detailLines.push("created via chabar.rs");

  // Google all-day end is exclusive → next calendar day
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;

  return {
    summary: eventTitle(event, bandName),
    description: detailLines.join("\n").trim(),
    location: location || undefined,
    start: { date },
    end: { date: endDate },
    extendedProperties: {
      private: {
        chabarEventId: String(chabarEventId),
        chabarBandId: String(event.bandId || ""),
      },
    },
  };
}

async function resolveSyncTargets(bandId, actorUserId) {
  const link = await getBandCalendarLink(bandId);
  if (link?.syncEnabled && link.calendarId) {
    return [{ calendarId: link.calendarId, userId: link.connectedByUserId, kind: "band" }];
  }

  // Personal fallback: ONLY the acting user (never fan-out to other members — avoids surprise copies)
  if (!actorUserId) return [];
  const prefs = await query(
    `SELECT ucp.user_id, ucp.personal_calendar_id
     FROM user_calendar_prefs ucp
     JOIN user_google_accounts uga ON uga.user_id = ucp.user_id
     WHERE ucp.user_id = :userId AND ucp.personal_sync_enabled = TRUE`,
    { userId: actorUserId },
  );
  return prefs.rows.map((row) => ({
    calendarId: row.personal_calendar_id || "primary",
    userId: row.user_id,
    kind: "personal",
  }));
}

/** Find an existing Google event we already tagged with this Chabar id (avoids duplicate POSTs). */
async function findGoogleEventByChabarId(userId, calendarId, chabarEventId) {
  try {
    const path =
      `/calendars/${encodeURIComponent(calendarId)}/events` +
      `?privateExtendedProperty=${encodeURIComponent(`chabarEventId=${chabarEventId}`)}` +
      `&maxResults=5&singleEvents=true`;
    const data = await googleFetch(userId, path);
    const item = (data.items || []).find((row) => row.status !== "cancelled");
    return item || null;
  } catch (error) {
    logger.warn("findGoogleEventByChabarId failed", { detail: error.message });
    return null;
  }
}

export async function syncEventUpsert({ eventId, bandId, event, bandName = "", actorUserId = null }) {
  if (!googleCalendarConfigured()) return;
  try {
    const targets = await resolveSyncTargets(bandId, actorUserId);
    if (!targets.length) return;

    const existing = await query(
      `SELECT google_event_id, google_calendar_id FROM events WHERE id = :id`,
      { id: eventId },
    );
    const prev = existing.rows[0] || {};
    const body = buildGoogleEventBody(
      { ...event, bandId },
      { bandName, chabarEventId: eventId },
    );
    if (!body) return;

    const bandTarget = targets.find((t) => t.kind === "band");
    if (bandTarget) {
      let googleEventId = prev.google_event_id;
      if (googleEventId && prev.google_calendar_id && prev.google_calendar_id !== bandTarget.calendarId) {
        // Calendar changed — don't update the old one; look for tag on the new calendar
        googleEventId = null;
      }
      if (!googleEventId) {
        const found = await findGoogleEventByChabarId(
          bandTarget.userId,
          bandTarget.calendarId,
          eventId,
        );
        if (found?.id) googleEventId = found.id;
      }

      let data;
      if (googleEventId) {
        try {
          data = await googleFetch(
            bandTarget.userId,
            `/calendars/${encodeURIComponent(bandTarget.calendarId)}/events/${encodeURIComponent(googleEventId)}`,
            { method: "PUT", body },
          );
        } catch (error) {
          if (error.status === 404 || error.status === 410) {
            data = await googleFetch(
              bandTarget.userId,
              `/calendars/${encodeURIComponent(bandTarget.calendarId)}/events`,
              { method: "POST", body },
            );
            googleEventId = data.id;
          } else {
            throw error;
          }
        }
      } else {
        data = await googleFetch(
          bandTarget.userId,
          `/calendars/${encodeURIComponent(bandTarget.calendarId)}/events`,
          { method: "POST", body },
        );
        googleEventId = data.id;
      }
      await query(
        `UPDATE events
         SET google_event_id = :googleEventId,
             google_calendar_id = :calendarId,
             sync_source = CASE
               WHEN sync_source = 'google' THEN sync_source
               ELSE 'chabar'
             END,
             synced_at = NOW()
         WHERE id = :id`,
        { id: eventId, googleEventId, calendarId: bandTarget.calendarId },
      );
      await query(
        `UPDATE band_google_calendars SET last_synced_at = NOW(), updated_at = NOW()
         WHERE band_id = :bandId`,
        { bandId },
      );
      return;
    }

    // Personal-only: upsert for the acting user alone
    for (const target of targets) {
      try {
        let googleEventId = prev.google_event_id;
        if (!googleEventId || prev.google_calendar_id !== target.calendarId) {
          const found = await findGoogleEventByChabarId(target.userId, target.calendarId, eventId);
          googleEventId = found?.id || null;
        }
        let data;
        if (googleEventId) {
          data = await googleFetch(
            target.userId,
            `/calendars/${encodeURIComponent(target.calendarId)}/events/${encodeURIComponent(googleEventId)}`,
            { method: "PUT", body },
          );
        } else {
          data = await googleFetch(
            target.userId,
            `/calendars/${encodeURIComponent(target.calendarId)}/events`,
            { method: "POST", body },
          );
          googleEventId = data.id;
        }
        await query(
          `UPDATE events
           SET google_event_id = :googleEventId,
               google_calendar_id = :calendarId,
               synced_at = NOW()
           WHERE id = :id`,
          { id: eventId, googleEventId, calendarId: target.calendarId },
        );
      } catch (error) {
        logger.warn("Personal calendar sync failed", {
          userId: target.userId,
          detail: error.message,
        });
      }
    }
  } catch (error) {
    logger.warn("Event calendar sync upsert failed", { eventId, bandId, detail: error.message });
  }
}

export async function syncEventDelete({ eventId, bandId }) {
  if (!googleCalendarConfigured()) return;
  try {
    const link = await getBandCalendarLink(bandId);
    const row = await query(
      `SELECT google_event_id, google_calendar_id, sync_source FROM events WHERE id = :id`,
      { id: eventId },
    );
    const event = row.rows[0];
    // Imported-from-Google rows: Chabar delete must not wipe the Google source event.
    if (event?.sync_source === "google") return;
    const googleEventId = event?.google_event_id;
    const calendarId = event?.google_calendar_id || link?.calendarId;
    if (!googleEventId || !calendarId || !link?.connectedByUserId) return;

    await googleFetch(
      link.connectedByUserId,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    logger.warn("Event calendar sync delete failed", { eventId, bandId, detail: error.message });
  }
}

/** Count Chabar events created by Google import (sync_source = google). */
export async function countGoogleImportedEvents(bandId) {
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM events WHERE band_id = :bandId AND sync_source = 'google'`,
    { bandId },
  );
  return result.rows[0]?.n || 0;
}

/**
 * Delete Chabar-only copies imported from Google.
 * Does NOT delete anything in Google Calendar.
 */
export async function deleteGoogleImportedEvents(bandId) {
  const listed = await query(
    `SELECT id, event_date_text, note
     FROM events
     WHERE band_id = :bandId AND sync_source = 'google'
     ORDER BY id`,
    { bandId },
  );
  if (!listed.rows.length) {
    return { deleted: 0, events: [] };
  }
  await query(`DELETE FROM events WHERE band_id = :bandId AND sync_source = 'google'`, { bandId });
  return {
    deleted: listed.rows.length,
    items: listed.rows.map((row) => ({
      id: row.id,
      date: row.event_date_text,
      note: row.note || "",
    })),
  };
}

/** Pull from linked band calendar.
 *  mode 'linked' (default): only refresh events already tagged with chabarEventId — safe, no new rows.
 *  mode 'import': also import future Google events not yet in Chabar (deduped).
 */
export async function pullBandCalendar(bandId, { mode = "linked" } = {}) {
  const link = await getBandCalendarLink(bandId);
  if (!link?.syncEnabled || !link.calendarId) {
    return { imported: 0, updated: 0, skipped: 0, importedIds: [], mode };
  }

  const importNew = mode === "import";
  const tokenRow = await query(
    `SELECT sync_token FROM band_google_calendars WHERE band_id = :bandId`,
    { bandId },
  );
  let syncToken = tokenRow.rows[0]?.sync_token || "";
  let path;
  if (syncToken && !importNew) {
    path = `/calendars/${encodeURIComponent(link.calendarId)}/events?syncToken=${encodeURIComponent(syncToken)}&showDeleted=true`;
  } else {
    // First pull / import: from today forward only (never dump years of history)
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    path =
      `/calendars/${encodeURIComponent(link.calendarId)}/events` +
      `?singleEvents=true&orderBy=startTime` +
      `&timeMin=${encodeURIComponent(timeMin.toISOString())}`;
  }

  let data;
  try {
    data = await googleFetch(link.connectedByUserId, path);
  } catch (error) {
    if (error.status === 410 || /Sync token/i.test(error.message || "")) {
      await query(
        `UPDATE band_google_calendars SET sync_token = NULL WHERE band_id = :bandId`,
        { bandId },
      );
      return pullBandCalendar(bandId, { mode });
    }
    throw error;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const importedIds = [];
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  for (const item of data.items || []) {
    const chabarId = item.extendedProperties?.private?.chabarEventId;
    if (item.status === "cancelled") {
      skipped += 1;
      continue;
    }

    const date =
      item.start?.date ||
      (item.start?.dateTime ? String(item.start.dateTime).slice(0, 10) : "");
    if (!date) {
      skipped += 1;
      continue;
    }

    // Never import/update past days on import (linked updates of known ids still allowed)
    if (importNew && !chabarId && date < todayIso) {
      skipped += 1;
      continue;
    }

    const [y, m, d] = date.split("-");
    const dateText = `${d}.${m}.${y}.`;
    const note = String(item.summary || "").slice(0, 200);
    const location = String(item.location || "");
    const [city, ...rest] = location.split(",").map((s) => s.trim());
    const venue = rest.join(", ");

    if (chabarId) {
      const result = await query(
        `UPDATE events
         SET event_date_text = :date,
             city = COALESCE(NULLIF(:city, ''), city),
             venue = COALESCE(NULLIF(:venue, ''), venue),
             note = CASE WHEN note IS NULL OR note = '' THEN :note ELSE note END,
             google_event_id = :googleEventId,
             google_calendar_id = :calendarId,
             synced_at = NOW()
         WHERE id = :id AND band_id = :bandId`,
        {
          id: Number(chabarId),
          bandId,
          date: dateText,
          city: city || "",
          venue: venue || "",
          note,
          googleEventId: item.id,
          calendarId: link.calendarId,
        },
      );
      if (result.rowCount) updated += 1;
      else skipped += 1;
      continue;
    }

    // Safe default: do not create Chabar rows from random Google events
    if (!importNew) {
      skipped += 1;
      continue;
    }

    const byGoogleId = await query(
      `SELECT id FROM events WHERE band_id = :bandId AND google_event_id = :googleEventId LIMIT 1`,
      { bandId, googleEventId: item.id },
    );
    if (byGoogleId.rows[0]) {
      await query(
        `UPDATE events SET event_date_text = :date, synced_at = NOW() WHERE id = :id`,
        { id: byGoogleId.rows[0].id, date: dateText },
      );
      updated += 1;
      continue;
    }

    // Soft dedupe: same band + same calendar date already in Chabar → link, don't insert
    const byDate = await query(
      `SELECT id, google_event_id, note, city, venue
       FROM events
       WHERE band_id = :bandId AND event_date_text = :date
       ORDER BY id
       LIMIT 5`,
      { bandId, date: dateText },
    );
    const match = byDate.rows.find((row) => {
      if (row.google_event_id) return false;
      const rowNote = String(row.note || "").toLowerCase();
      const gNote = note.toLowerCase();
      if (rowNote && gNote && (rowNote.includes(gNote) || gNote.includes(rowNote))) return true;
      if (!rowNote && !String(row.city || "").trim()) return true; // empty stub day
      return false;
    });
    if (match) {
      await query(
        `UPDATE events
         SET google_event_id = :googleEventId,
             google_calendar_id = :calendarId,
             note = CASE WHEN note IS NULL OR note = '' THEN :note ELSE note END,
             city = COALESCE(NULLIF(city, ''), :city),
             venue = COALESCE(NULLIF(venue, ''), :venue),
             synced_at = NOW()
         WHERE id = :id`,
        {
          id: match.id,
          googleEventId: item.id,
          calendarId: link.calendarId,
          note,
          city: city || "",
          venue: venue || "",
        },
      );
      updated += 1;
      continue;
    }

    const inserted = await query(
      `INSERT INTO events
        (band_id, sort_order, event_date_text, city, venue, note, price_eur, transport_rsd,
         google_event_id, google_calendar_id, sync_source, synced_at)
       VALUES (
        :bandId,
        COALESCE((SELECT max_order + 1 FROM (
          SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM events WHERE band_id = :bandId
        ) AS t), 1),
        :date, :city, :venue, :note, 0, 0,
        :googleEventId, :calendarId, 'google', NOW()
       )
       RETURNING id`,
      {
        bandId,
        date: dateText,
        city: city || "",
        venue: venue || "",
        note,
        googleEventId: item.id,
        calendarId: link.calendarId,
      },
    );
    imported += 1;
    if (inserted.rows[0]?.id) importedIds.push(inserted.rows[0].id);
  }

  if (data.nextSyncToken) {
    await query(
      `UPDATE band_google_calendars
       SET sync_token = :token, last_synced_at = NOW(), updated_at = NOW()
       WHERE band_id = :bandId`,
      { bandId, token: data.nextSyncToken },
    );
  } else {
    await query(
      `UPDATE band_google_calendars SET last_synced_at = NOW(), updated_at = NOW()
       WHERE band_id = :bandId`,
      { bandId },
    );
  }

  return {
    imported,
    updated,
    skipped,
    importedIds,
    mode: importNew ? "import" : "linked",
  };
}

/**
 * Push Chabar → Google: create missing events on the linked band calendar.
 * Skips rows already linked (google_event_id) or imported from Google.
 * Also re-links if a tagged Google event already exists (no duplicate POST).
 */
export async function pushBandCalendar(bandId) {
  const link = await getBandCalendarLink(bandId);
  if (!link?.syncEnabled || !link.calendarId) {
    return { created: 0, linked: 0, skipped: 0, errors: 0 };
  }

  const bandRow = await query(`SELECT name FROM bands WHERE id = :bandId LIMIT 1`, { bandId });
  const bandName = bandRow.rows[0]?.name || "";

  const events = await query(
    `SELECT id, band_id, event_date_text, city, venue, note, price_eur, transport_rsd,
            google_event_id, google_calendar_id, sync_source
     FROM events
     WHERE band_id = :bandId
     ORDER BY sort_order, id`,
    { bandId },
  );

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let errors = 0;
  const createdIds = [];

  for (const row of events.rows) {
    // Already live on Google (imported or previously pushed) — leave alone
    if (row.sync_source === "google") {
      skipped += 1;
      continue;
    }
    if (row.google_event_id && row.google_calendar_id === link.calendarId) {
      skipped += 1;
      continue;
    }

    const event = {
      bandId,
      date: row.event_date_text,
      city: row.city || "",
      venue: row.venue || "",
      note: row.note || "",
      priceEur: Number(row.price_eur) || 0,
      transportRsd: Number(row.transport_rsd) || 0,
    };
    const body = buildGoogleEventBody(event, { bandName, chabarEventId: row.id });
    if (!body) {
      skipped += 1;
      continue;
    }

    try {
      const found = await findGoogleEventByChabarId(link.connectedByUserId, link.calendarId, row.id);
      if (found?.id) {
        await query(
          `UPDATE events
           SET google_event_id = :googleEventId,
               google_calendar_id = :calendarId,
               synced_at = NOW()
           WHERE id = :id`,
          { id: row.id, googleEventId: found.id, calendarId: link.calendarId },
        );
        linked += 1;
        continue;
      }

      const data = await googleFetch(
        link.connectedByUserId,
        `/calendars/${encodeURIComponent(link.calendarId)}/events`,
        { method: "POST", body },
      );
      await query(
        `UPDATE events
         SET google_event_id = :googleEventId,
             google_calendar_id = :calendarId,
             sync_source = 'chabar',
             synced_at = NOW()
         WHERE id = :id`,
        { id: row.id, googleEventId: data.id, calendarId: link.calendarId },
      );
      created += 1;
      createdIds.push(row.id);
    } catch (error) {
      errors += 1;
      logger.warn("pushBandCalendar event failed", {
        bandId,
        eventId: row.id,
        detail: error.message,
      });
    }
  }

  await query(
    `UPDATE band_google_calendars SET last_synced_at = NOW(), updated_at = NOW()
     WHERE band_id = :bandId`,
    { bandId },
  );

  return { created, linked, skipped, errors, createdIds };
}

export function frontendReturnUrl({ returnTo, bandId, error = "" }) {
  const base = publicAppUrl();
  const params = new URLSearchParams();
  if (error) params.set("gcal_error", error);
  else params.set("gcal", "connected");
  if (returnTo === "band" && bandId) {
    params.set("page", "band");
    params.set("band", bandId);
  } else {
    params.set("page", "settings");
  }
  const q = params.toString();
  return `${base}/?${q}`;
}
