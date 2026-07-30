import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureProfileAndPersonalBand,
  getMemberships,
  requireAuth,
  requireBandAdmin,
  requireBandMember,
  syncMissingProfilesFromAuth,
} from "./auth.js";
import {
  acceptInvite,
  addBandMember,
  acceptJoinLink,
  bandIdFromParams,
  createBand,
  declineInvite,
  deleteBand,
  getBandHome,
  getInviteLink,
  getJoinPreview,
  listNotificationsForUser,
  listPendingInvitesForUser,
  markAllNotificationsRead,
  markNotificationRead,
  removeBandMember,
  rotateInviteLink,
  transferBandOwnership,
  updateMemberInvitePrivilege,
  updateMemberRole,
} from "./bands.js";
import { normalizeInvitePreference, ownerBandLimit } from "../shared/bandLimits.js";
import { searchUsers } from "./users.js";
import { globalSearch } from "./search.js";
import { getEurRsdRate } from "./exchangeRate.js";
import { query, startPoolWarmer, withTransaction } from "./db.js";
import { logger } from "./logger.js";
import {
  snapshotEvent,
  snapshotMemberFinance,
  snapshotPayment,
  writeAudit,
} from "./audit.js";
import {
  deletePushSubscription,
  actorLabel,
  formatEventLabel,
  getVapidPublicKey,
  notifyBandEvent,
  savePushSubscription,
  sendTestNotification,
} from "./notifications.js";
import {
  buildAuthUrl,
  disconnectGoogleAccount,
  frontendReturnUrl,
  getBandCalendarLink,
  getGoogleAccountStatus,
  googleCalendarConfigured,
  handleOAuthCallback,
  linkBandCalendar,
  listCalendars,
  oauthErrorCode,
  pullBandCalendar,
  pushBandCalendar,
  redirectUri,
  setBandCalendarSyncEnabled,
  syncEventDelete,
  syncEventUpsert,
  unlinkBandCalendar,
  updatePersonalPrefs,
  deleteGoogleImportedEvents,
} from "./googleCalendar.js";
import { rateLimit } from "./rateLimit.js";
import { getCommunityLyricsById, searchCommunityLyrics } from "./lyricsLookup.js";
import { canEditSetlist, isBandLead, isBandSaradnik } from "../shared/roles.js";
import { parseDate, startOfToday } from "../src/calculations.js";
import { normalizeConsoleIds, resolveConsoleLimits } from "../src/mixingConsoles.js";

const app = express();
const port = Number(process.env.API_PORT || 3001);
const host = process.env.API_HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

/** Schedule keeps ~18 months of history + all future; finance keeps ~5 years. */
const SCHEDULE_LOOKBACK = "18 months";
const FINANCE_LOOKBACK = "5 years";

function corsAllowedOrigins() {
  const fromEnv = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const defaults = [
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "https://chabar.rs",
    "https://www.chabar.rs",
  ]
    .map((item) => String(item || "").trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...fromEnv, ...defaults]);
}

const allowedOrigins = corsAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser / same-origin proxies often omit Origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(null, false);
    },
  }),
);
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", async (_req, res) => {
  await query("SELECT 1");
  res.json({ ok: true, database: "supabase-postgres" });
});

function sanitizeClientLogDetail(detail) {
  try {
    const raw = JSON.stringify(detail ?? null);
    if (raw.length <= 2_000) return detail ?? null;
    return { truncated: true, preview: raw.slice(0, 500) };
  } catch {
    return { truncated: true, preview: String(detail).slice(0, 200) };
  }
}

app.post(
  "/api/client-log",
  rateLimit({
    windowMs: 60_000,
    max: 40,
    keyFn: (req) => `client-log:${req.ip || req.socket?.remoteAddress || "unknown"}`,
  }),
  requireAuth,
  (req, res) => {
    const level = ["info", "warn", "error"].includes(req.body?.level) ? req.body.level : "info";
    const message = String(req.body?.message || "client log").slice(0, 500);
    logger[level](`[client] ${message}`, {
      detail: sanitizeClientLogDetail(req.body?.detail),
      href: String(req.body?.href || "").slice(0, 500),
      userId: req.user?.id,
    });
    res.status(204).end();
  },
);

app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    await ensureProfileAndPersonalBand(req.user);
    const profileResult = await query(
      `SELECT id, email, display_name, role, invite_preference, extra_band_grants
       FROM profiles WHERE id = :id`,
      { id: req.user.id },
    );
    const profile = profileResult.rows[0];
    const owned = await query(
      `SELECT COUNT(*)::int AS n
       FROM band_members bm
       JOIN bands b ON b.id = bm.band_id
       WHERE bm.user_id = :userId
         AND bm.member_role = 'owner'
         AND b.kind = 'group'`,
      { userId: req.user.id },
    );
    const [bands, pendingInvites, notifications] = await Promise.all([
      getMemberships(req.user.id),
      listPendingInvitesForUser(req.user),
      listNotificationsForUser(req.user),
    ]);
    const extraGrants = profile.extra_band_grants || 0;
    const limit = ownerBandLimit(extraGrants);
    res.json({
      profile: {
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        role: profile.role,
        invitePreference: normalizeInvitePreference(profile.invite_preference),
        extraBandGrants: extraGrants,
        ownedGroupBands: owned.rows[0]?.n || 0,
        ownerLimit: limit,
      },
      bands,
      pendingInvites,
      notifications,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/me/invites/:inviteId/accept", requireAuth, acceptInvite);
app.post("/api/me/invites/:inviteId/decline", requireAuth, declineInvite);
app.post("/api/me/notifications/:notificationId/read", requireAuth, markNotificationRead);
app.post("/api/me/notifications/read-all", requireAuth, markAllNotificationsRead);

app.post("/api/me/notifications/test", requireAuth, async (req, res, next) => {
  try {
    const result = await sendTestNotification(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me/push/vapid-public-key", requireAuth, (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({
      error: "Push not configured",
      detail: "VAPID ključevi nisu podešeni na serveru.",
    });
  }
  res.json({ publicKey: key });
});

app.post("/api/me/push/subscribe", requireAuth, async (req, res, next) => {
  try {
    await savePushSubscription(req.user.id, req.body?.subscription || req.body, req.headers["user-agent"]);
    res.json({ status: "ok" });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: "Invalid subscription", detail: error.message });
    }
    next(error);
  }
});

app.delete("/api/me/push/subscribe", requireAuth, async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint || "";
    await deletePushSubscription(req.user.id, endpoint);
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/me/preferences", requireAuth, async (req, res, next) => {
  try {
    const invitePreference = normalizeInvitePreference(req.body?.invitePreference);
    await query(
      `UPDATE profiles
       SET invite_preference = :invitePreference, updated_at = NOW()
       WHERE id = :userId`,
      { invitePreference, userId: req.user.id },
    );
    res.json({ invitePreference });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users/search", requireAuth, searchUsers);
app.get("/api/search", requireAuth, globalSearch);

app.get("/api/google/calendar/status", requireAuth, async (req, res, next) => {
  try {
    res.json(await getGoogleAccountStatus(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/google/calendar/connect", requireAuth, async (req, res, next) => {
  try {
    const returnTo = String(req.query.returnTo || "settings");
    const bandId = String(req.query.bandId || "");
    const url = buildAuthUrl({ userId: req.user.id, returnTo, bandId });
    res.json({ url, redirectUri: redirectUri() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/google/calendar/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code) {
      return res.redirect(frontendReturnUrl({ returnTo: "settings", error: "missing_code" }));
    }
    const result = await handleOAuthCallback(code, state);
    return res.redirect(frontendReturnUrl({ returnTo: result.returnTo, bandId: result.bandId }));
  } catch (error) {
    logger.error("Google calendar callback failed", { detail: error.message });
    return res.redirect(
      frontendReturnUrl({ returnTo: "settings", error: oauthErrorCode(error) }),
    );
  }
});

/** First link: owner/lead. Existing link: connector only. */
async function requireGoogleCalendarManager(req, res, next) {
  try {
    const link = await getBandCalendarLink(req.params.id);
    req.googleLink = link || null;
    if (!link) {
      if (!isBandLead(req.memberRole)) {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Samo vlasnik ili lead može povezati Google kalendar.",
        });
      }
      return next();
    }
    if (link.connectedByUserId !== req.user.id) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Samo connector može upravljati Google sync-om.",
      });
    }
    return next();
  } catch (error) {
    next(error);
  }
}

app.delete("/api/google/calendar/account", requireAuth, async (req, res, next) => {
  try {
    await disconnectGoogleAccount(req.user.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/google/calendar/prefs", requireAuth, async (req, res, next) => {
  try {
    const status = await updatePersonalPrefs(req.user.id, {
      personalSyncEnabled: req.body?.personalSyncEnabled,
      personalCalendarId: req.body?.personalCalendarId,
    });
    res.json(status);
  } catch (error) {
    next(error);
  }
});

app.get("/api/google/calendar/calendars", requireAuth, async (req, res, next) => {
  try {
    const calendars = await listCalendars(req.user.id);
    res.json({ calendars });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/bands/:id/google-calendar",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  async (req, res, next) => {
    try {
      const link = await getBandCalendarLink(req.params.id);
      const status = await getGoogleAccountStatus(req.user.id);
      res.json({
        configured: googleCalendarConfigured(),
        account: status,
        link,
        canManageLink: link
          ? link.connectedByUserId === req.user.id
          : isBandLead(req.memberRole),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.put(
  "/api/bands/:id/google-calendar",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  requireGoogleCalendarManager,
  async (req, res, next) => {
    try {
      const calendarId = String(req.body?.calendarId || "").trim();
      if (!calendarId) {
        return res.status(400).json({ error: "calendarId required" });
      }
      const summary = String(req.body?.summary || "").trim();
      const syncEnabled = req.body?.syncEnabled !== false;
      const link = await linkBandCalendar({
        bandId: req.params.id,
        userId: req.user.id,
        calendarId,
        summary,
        syncEnabled,
      });
      res.json({ link });
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/api/bands/:id/google-calendar",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  requireGoogleCalendarManager,
  async (req, res, next) => {
    try {
      if (typeof req.body?.syncEnabled === "boolean") {
        const link = await setBandCalendarSyncEnabled({
          bandId: req.params.id,
          userId: req.user.id,
          syncEnabled: req.body.syncEnabled,
        });
        return res.json({ link });
      }
      return res.status(400).json({ error: "Nothing to update" });
    } catch (error) {
      next(error);
    }
  },
);

app.delete(
  "/api/bands/:id/google-calendar",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  requireGoogleCalendarManager,
  async (req, res, next) => {
    try {
      await unlinkBandCalendar({ bandId: req.params.id, userId: req.user.id });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/bands/:id/google-calendar/pull",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  requireGoogleCalendarManager,
  async (req, res, next) => {
    try {
      const mode = String(req.query.mode || req.body?.mode || "linked");
      const result = await pullBandCalendar(req.params.id, {
        mode: mode === "import" ? "import" : "linked",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/** Push Chabar dates missing from the linked Google calendar. */
app.post(
  "/api/bands/:id/google-calendar/push",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  async (req, res, next) => {
    try {
      const link = await getBandCalendarLink(req.params.id);
      if (!link) {
        return res.status(400).json({ error: "Bend nema povezan Google kalendar." });
      }
      if (link.connectedByUserId !== req.user.id) {
        return res.status(403).json({ error: "Samo connector može slati u Google." });
      }
      if (!link.syncEnabled) {
        return res.status(400).json({ error: "Sync je isključen za ovaj bend." });
      }
      const result = await pushBandCalendar(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/** Remove Chabar rows imported from Google (keeps Google Calendar intact). */
app.delete(
  "/api/bands/:id/google-calendar/imported",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  requireGoogleCalendarManager,
  async (req, res, next) => {
    try {
      const result = await deleteGoogleImportedEvents(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/bands", requireAuth, createBand);
app.get("/api/bands/:id", requireAuth, bandIdFromParams, requireBandMember, getBandHome);
app.delete("/api/bands/:id", requireAuth, bandIdFromParams, requireBandMember, deleteBand);
app.post("/api/bands/:id/transfer", requireAuth, bandIdFromParams, requireBandMember, transferBandOwnership);
app.get(
  "/api/bands/:id/invite-link",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  getInviteLink,
);
app.post(
  "/api/bands/:id/invite-link/rotate",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  rotateInviteLink,
);
app.get("/api/join/:token", getJoinPreview);
app.post("/api/join/:token", requireAuth, acceptJoinLink);
app.post("/api/bands/:id/members", requireAuth, bandIdFromParams, requireBandMember, addBandMember);
app.patch(
  "/api/bands/:id/members/:userId",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  updateMemberRole,
);
app.patch(
  "/api/bands/:id/members/:userId/invite",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  updateMemberInvitePrivilege,
);
app.delete(
  "/api/bands/:id/members/:userId",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  removeBandMember,
);

// Band schedule: dates for active band + my finance line on those dates
app.get("/api/bootstrap", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const light = req.query.light === "1";
    const events = await getBandEventsForUser(req.bandId, req.user.id);
    const settings = light ? {} : await getPersonalSettings(req.user.id);
    res.json({ bandId: req.bandId, events, payments: [], settings });
  } catch (error) {
    next(error);
  }
});

// Schedule across all bands I belong to
app.get("/api/my-schedule", requireAuth, async (req, res, next) => {
  try {
    const light = req.query.light === "1";
    const events = await getAllScheduleEventsForUser(req.user.id);
    const settings = light ? {} : await getPersonalSettings(req.user.id);
    res.json({ bandId: null, events, payments: [], settings });
  } catch (error) {
    next(error);
  }
});

// My finances across all bands I belong to
app.get("/api/my-finance", requireAuth, async (req, res, next) => {
  try {
    const [events, payments, settings] = await Promise.all([
      getMyFinanceEvents(req.user.id),
      getMyPayments(req.user.id),
      getPersonalSettings(req.user.id),
    ]);
    res.json({ mode: "member", events, payments, settings });
  } catch (error) {
    next(error);
  }
});

// Band-mode ledger for owner/admin of the active band (X-Band-Id)
app.get("/api/band-finance", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const band = await getBandMeta(req.bandId);
    if (!band || band.kind === "personal") {
      return res.status(400).json({ error: "Invalid band", detail: "Band mode is only for group bands" });
    }

    const [events, payments, settings] = await Promise.all([
      getBandFinanceEvents(req.bandId),
      getBandPayments(req.bandId),
      getPersonalSettings(req.user.id),
    ]);
    res.json({
      mode: "band",
      bandId: req.bandId,
      memberRole: req.memberRole,
      events,
      payments,
      settings,
    });
  } catch (error) {
    next(error);
  }
});

// One round-trip: all schedules for bands I belong to (client warms per-band cache)
app.get("/api/prefetch-schedules", requireAuth, async (req, res, next) => {
  try {
    const events = await getAllScheduleEventsForUser(req.user.id);
    const byBandId = {};
    for (const event of events) {
      if (!byBandId[event.bandId]) byBandId[event.bandId] = [];
      byBandId[event.bandId].push(event);
    }
    res.json({ events, byBandId });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/settings/:key", requireAuth, async (req, res, next) => {
  try {
    const personalBandId = await getPersonalBandId(req.user.id);
    if (!personalBandId) {
      return res.status(400).json({ error: "Missing personal band" });
    }
    const value = String(req.body.value ?? "");
    await query(
      `INSERT INTO settings (band_id, setting_key, setting_value)
       VALUES (:bandId, :key, :value)
       ON CONFLICT (band_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      { bandId: personalBandId, key: req.params.key, value },
    );
    res.json({ key: req.params.key, value });
  } catch (error) {
    next(error);
  }
});

/** Live EUR/RSD: NBS srednji first, Google Finance backup. */
app.get("/api/exchange-rate", requireAuth, async (req, res, next) => {
  try {
    const force = String(req.query.force || "") === "1";
    const result = await getEurRsdRate({ force });
    res.json(result);
  } catch (error) {
    res.status(502).json({
      error: "Exchange rate unavailable",
      detail: error.message || "Kurs nije dostupan",
    });
  }
});

app.post("/api/events", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    if (isBandSaradnik(req.memberRole)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Saradnik ne može da dodaje termine — treba mu dodele na postojeće datume.",
      });
    }
    const event = normalizeEvent(req.body);
    if (isPastEventDate(event.date)) {
      return res.status(400).json({
        error: "Invalid date",
        detail: "Datum termina ne sme biti u prošlosti.",
      });
    }

    const created = await withTransaction(async (tx) => {
      const result = await tx(
        `INSERT INTO events
          (band_id, sort_order, event_date_text, city, venue, maps_url, note, price_eur, transport_rsd)
         VALUES (
          :bandId,
          COALESCE((SELECT max_order + 1 FROM (
            SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM events WHERE band_id = :bandId
          ) AS t), 1),
          :date, :city, :venue, :mapsUrl, :note, :priceEur, :transportRsd
         )
         RETURNING id, band_id, event_date_text, city, venue, maps_url, note, price_eur, transport_rsd`,
        { ...event, bandId: req.bandId },
      );
      const row = result.rows[0];
      const id = row.id;
      await upsertMemberFinance(id, req.user.id, event.priceEur, event.transportRsd, {
        bandId: req.bandId,
        actorUserId: req.user.id,
        runQuery: tx,
        notify: false,
      });
      await writeAudit(
        {
          entityType: "event",
          entityId: id,
          bandId: req.bandId,
          actorUserId: req.user.id,
          action: "insert",
          before: null,
          after: snapshotEvent(row),
        },
        tx,
      );
      return { id, row };
    });

    const bandName = await getBandName(req.bandId);
    void syncEventUpsert({
      eventId: created.id,
      bandId: req.bandId,
      event: { ...event, bandId: req.bandId },
      bandName,
      actorUserId: req.user.id,
    });
    const who = await actorLabel(req.user.id);
    await notifyBandEvent({
      bandId: req.bandId,
      type: "event_created",
      actorUserId: req.user.id,
      audience: "band_visible",
      eventId: created.id,
      message: `${who} je kreirao/la termin ${formatEventLabel(event)}`,
      payload: { page: "schedule", eventId: String(created.id), bandId: req.bandId },
    });
    res.status(201).json({ ...event, id: created.id, bandId: req.bandId });
  } catch (error) {
    next(error);
  }
});

app.put("/api/events/:id", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    if (isBandSaradnik(req.memberRole)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Saradnik ne može da menja termine.",
      });
    }
    const existing = await query(
      `SELECT id, band_id, event_date_text, city, venue, maps_url, note, price_eur, transport_rsd
       FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const existingRow = existing.rows[0];
    if (isPastEventDate(existingRow.event_date_text)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Prošli termini su zaključani. Možeš samo dodati komentar.",
      });
    }

    const event = normalizeEvent(req.body);
    if (isPastEventDate(event.date)) {
      return res.status(400).json({
        error: "Invalid date",
        detail: "Datum termina ne sme biti u prošlosti.",
      });
    }

    const requestedBandId = String(req.body?.bandId || "").trim();
    const nextBandId = requestedBandId || req.bandId;
    if (nextBandId !== req.bandId) {
      const membership = await query(
        `SELECT user_id FROM band_members
         WHERE band_id = :bandId AND user_id = :userId
         LIMIT 1`,
        { bandId: nextBandId, userId: req.user.id },
      );
      if (!membership.rows[0]) {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Nisi član izabranog benda.",
        });
      }
    }

    const updated = await withTransaction(async (tx) => {
      const result = await tx(
        `UPDATE events
         SET band_id = :nextBandId,
             event_date_text = :date,
             city = :city,
             venue = :venue,
             maps_url = :mapsUrl,
             note = :note,
             price_eur = :priceEur,
             transport_rsd = :transportRsd
         WHERE id = :id AND band_id = :bandId
         RETURNING id, band_id, event_date_text, city, venue, maps_url, note, price_eur, transport_rsd`,
        { ...event, id: req.params.id, bandId: req.bandId, nextBandId },
      );
      if (!result.rowCount) {
        const err = new Error("Not found");
        err.status = 404;
        throw err;
      }

      if (nextBandId !== req.bandId) {
        await tx(`UPDATE event_day_details SET band_id = :nextBandId WHERE event_id = :eventId`, {
          nextBandId,
          eventId: req.params.id,
        });
        await tx(`UPDATE event_expenses SET band_id = :nextBandId WHERE event_id = :eventId`, {
          nextBandId,
          eventId: req.params.id,
        });
      }

      await upsertMemberFinance(Number(req.params.id), req.user.id, event.priceEur, event.transportRsd, {
        bandId: nextBandId,
        actorUserId: req.user.id,
        runQuery: tx,
        notify: false,
      });
      await writeAudit(
        {
          entityType: "event",
          entityId: req.params.id,
          bandId: nextBandId,
          actorUserId: req.user.id,
          action: "update",
          before: snapshotEvent(existingRow),
          after: snapshotEvent(result.rows[0]),
        },
        tx,
      );
      return result.rows[0];
    });

    const bandName = await getBandName(nextBandId);
    void syncEventUpsert({
      eventId: Number(req.params.id),
      bandId: nextBandId,
      event: { ...event, bandId: nextBandId },
      bandName,
      actorUserId: req.user.id,
    });
    const who = await actorLabel(req.user.id);
    await notifyBandEvent({
      bandId: nextBandId,
      type: "event_updated",
      actorUserId: req.user.id,
      audience: "band_visible",
      eventId: req.params.id,
      message: `${who} je ažurirao/la termin ${formatEventLabel(event)}`,
      payload: { page: "schedule", eventId: String(req.params.id), bandId: nextBandId },
    });
    res.json({ ...event, id: Number(req.params.id), bandId: nextBandId, bandName });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/events/:id", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    if (isBandSaradnik(req.memberRole)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Saradnik ne može da briše termine.",
      });
    }
    const existing = await query(
      `SELECT id, band_id, event_date_text, city, venue, maps_url, note, price_eur, transport_rsd
       FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    if (isPastEventDate(existing.rows[0].event_date_text)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Prošli termini su zaključani i ne mogu se brisati.",
      });
    }

    const before = snapshotEvent(existing.rows[0]);
    await syncEventDelete({ eventId: Number(req.params.id), bandId: req.bandId });

    await withTransaction(async (tx) => {
      const result = await tx("DELETE FROM events WHERE id = :id AND band_id = :bandId", {
        id: req.params.id,
        bandId: req.bandId,
      });
      if (!result.rowCount) {
        const err = new Error("Not found");
        err.status = 404;
        throw err;
      }
      await writeAudit(
        {
          entityType: "event",
          entityId: req.params.id,
          bandId: req.bandId,
          actorUserId: req.user.id,
          action: "delete",
          before,
          after: null,
        },
        tx,
      );
    });

    const who = await actorLabel(req.user.id);
    await notifyBandEvent({
      bandId: req.bandId,
      type: "event_deleted",
      actorUserId: req.user.id,
      audience: "band_visible",
      eventId: req.params.id,
      message: `${who} je obrisao/la termin ${formatEventLabel({
        date: existing.rows[0].event_date_text,
        city: existing.rows[0].city,
      })}`,
      payload: { page: "schedule", bandId: req.bandId },
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
function mapMemberFinanceRow(row) {
  return {
    id: row.user_id,
    name: row.display_name || row.email?.split("@")[0] || "Član",
    memberRole: row.member_role,
    priceEur: Number(row.price_eur) || 0,
    transportRsd: Number(row.transport_rsd) || 0,
    // TBD: per-member default fee storage + settings UI
    defaultPriceEur: null,
  };
}

const EXPENSE_CURRENCIES = new Set([
  "EUR",
  "USD",
  "GBP",
  "RSD",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "SEK",
  "PLN",
]);

function mapExpenseRow(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    bandId: row.band_id,
    amount: Number(row.amount) || 0,
    currency: row.currency || "EUR",
    description: row.description || "",
    payeeKind: row.payee_kind,
    payeeUserId: row.payee_user_id || null,
    payeeName: row.payee_name || null,
    createdAt: row.created_at,
  };
}

async function loadEventFinanceBundle(eventId, bandId, { viewerUserId = "" } = {}) {
  const event = await query(`SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`, {
    id: eventId,
    bandId,
  });
  if (!event.rows[0]) return null;

  const band = await getBandMeta(bandId);
  const [membersResult, expensesResult] = await Promise.all([
    query(
      `SELECT bm.user_id, bm.member_role, p.email, p.display_name,
              COALESCE(f.price_eur, 0) AS price_eur,
              COALESCE(f.transport_rsd, 0) AS transport_rsd
       FROM band_members bm
       JOIN profiles p ON p.id = bm.user_id
       LEFT JOIN event_member_finance f
         ON f.event_id = :eventId AND f.user_id = bm.user_id
       WHERE bm.band_id = :bandId
       ORDER BY
         CASE bm.member_role WHEN 'owner' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END,
         p.display_name, p.email`,
      { eventId, bandId },
    ),
    query(
      `SELECT x.id, x.event_id, x.band_id, x.amount, x.currency, x.description,
              x.payee_kind, x.payee_user_id, x.created_at,
              CASE
                WHEN x.payee_kind = 'band' THEN 'Bend'
                WHEN x.payee_kind = 'external' THEN 'Spoljnji'
                ELSE COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Član')
              END AS payee_name
       FROM event_expenses x
       LEFT JOIN profiles p ON p.id = x.payee_user_id
       WHERE x.event_id = :eventId AND x.band_id = :bandId
       ORDER BY x.created_at ASC, x.id ASC`,
      { eventId, bandId },
    ),
  ]);

  let members = membersResult.rows.map(mapMemberFinanceRow);
  // Personal band = solo ledger; never expose a multi-member roster.
  if (band?.kind === "personal" && viewerUserId) {
    members = members.filter((member) => member.id === viewerUserId);
  }

  return {
    eventId: Number(eventId),
    bandId,
    bandKind: band?.kind || "group",
    members,
    currencies: [...EXPENSE_CURRENCIES],
    expenses: expensesResult.rows.map(mapExpenseRow),
  };
}

app.get("/api/events/:id/member-finance", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const bundle = await loadEventFinanceBundle(req.params.id, req.bandId, {
      viewerUserId: req.user.id,
    });
    if (!bundle) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({
      eventId: bundle.eventId,
      bandId: bundle.bandId,
      bandKind: bundle.bandKind,
      members: bundle.members,
    });
  } catch (error) {
    next(error);
  }
});

/** Honorari + troškovi in one round-trip (event Finansije tab). */
app.get("/api/events/:id/finance", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const bundle = await loadEventFinanceBundle(req.params.id, req.bandId, {
      viewerUserId: req.user.id,
    });
    if (!bundle) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(bundle);
  } catch (error) {
    next(error);
  }
});

app.put(
  "/api/events/:id/member-finance/:userId",
  requireAuth,
  requireBandMember,
  requireBandAdmin,
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      const userId = String(req.params.userId || "").trim();
      if (!eventId || !userId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const event = await query(
        `SELECT id, event_date_text FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
        { id: eventId, bandId: req.bandId },
      );
      if (!event.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }
      if (isPastEventDate(event.rows[0].event_date_text)) {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Prošli termini su zaključani — honorari se ne menjaju.",
        });
      }

      const band = await getBandMeta(req.bandId);
      // Personal = solo; owner may only set their own fee (no “other members”).
      if (band?.kind === "personal" && userId !== req.user.id) {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Na ličnom prostoru možeš postaviti samo svoj honorar.",
        });
      }

      const membership = await query(
        `SELECT user_id FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
        { bandId: req.bandId, userId },
      );
      if (!membership.rows[0]) {
        return res.status(400).json({
          error: "Invalid member",
          detail: "Korisnik nije član ovog benda.",
        });
      }

      const priceEur = numberValue(req.body?.priceEur);
      if (priceEur < 0) {
        return res.status(400).json({
          error: "Invalid amount",
          detail: "Iznos ne može biti negativan.",
        });
      }

      const existingFinance = await query(
        `SELECT transport_rsd FROM event_member_finance
         WHERE event_id = :eventId AND user_id = :userId LIMIT 1`,
        { eventId, userId },
      );
      const transportRsd =
        req.body?.transportRsd !== undefined
          ? numberValue(req.body.transportRsd)
          : Number(existingFinance.rows[0]?.transport_rsd) || 0;

      await upsertMemberFinance(eventId, userId, priceEur, transportRsd, {
        bandId: req.bandId,
        actorUserId: req.user.id,
      });

      res.json({
        eventId,
        userId,
        priceEur,
        transportRsd,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/events/:id/expenses", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const bundle = await loadEventFinanceBundle(req.params.id, req.bandId, {
      viewerUserId: req.user.id,
    });
    if (!bundle) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({
      eventId: bundle.eventId,
      bandId: bundle.bandId,
      currencies: bundle.currencies,
      members: bundle.members.map((member) => ({ id: member.id, name: member.name })),
      expenses: bundle.expenses,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/events/:id/assignees", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) return res.status(404).json({ error: "Not found" });

    const [assignees, candidates] = await Promise.all([
      query(
        `SELECT ea.user_id, p.email, p.display_name
         FROM event_assignees ea
         JOIN profiles p ON p.id = ea.user_id
         WHERE ea.event_id = :eventId
         ORDER BY p.display_name, p.email`,
        { eventId },
      ),
      query(
        `SELECT bm.user_id, bm.member_role, p.email, p.display_name
         FROM band_members bm
         JOIN profiles p ON p.id = bm.user_id
         WHERE bm.band_id = :bandId AND bm.member_role = 'saradnik'
         ORDER BY p.display_name, p.email`,
        { bandId: req.bandId },
      ),
    ]);

    res.json({
      eventId,
      bandId: req.bandId,
      assignees: assignees.rows.map((row) => ({
        id: row.user_id,
        name: row.display_name || row.email?.split("@")[0] || "Saradnik",
      })),
      candidates: candidates.rows.map((row) => ({
        id: row.user_id,
        name: row.display_name || row.email?.split("@")[0] || "Saradnik",
        memberRole: row.member_role,
      })),
      canManage: isBandLead(req.memberRole),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/:id/assignees", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const userId = String(req.body?.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Missing user" });

    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) return res.status(404).json({ error: "Not found" });

    const member = await query(
      `SELECT member_role FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId: req.bandId, userId },
    );
    if (!member.rows[0] || member.rows[0].member_role !== "saradnik") {
      return res.status(400).json({
        error: "Invalid user",
        detail: "Na termin se dodeljuju samo saradnici benda.",
      });
    }

    await query(
      `INSERT INTO event_assignees (event_id, user_id, assigned_by)
       VALUES (:eventId, :userId, :actorId)
       ON CONFLICT (event_id, user_id) DO NOTHING`,
      { eventId, userId, actorId: req.user.id },
    );

    const profile = await query(
      `SELECT email, display_name FROM profiles WHERE id = :userId LIMIT 1`,
      { userId },
    );
    res.status(201).json({
      id: userId,
      name: profile.rows[0]?.display_name || profile.rows[0]?.email?.split("@")[0] || "Saradnik",
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/events/:id/assignees/:userId", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const userId = String(req.params.userId || "").trim();
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) return res.status(404).json({ error: "Not found" });

    await query(`DELETE FROM event_assignees WHERE event_id = :eventId AND user_id = :userId`, {
      eventId,
      userId,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/:id/expenses", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const event = await query(
      `SELECT id, event_date_text FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    if (isPastEventDate(event.rows[0].event_date_text)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Prošli termini su zaključani — troškovi se ne menjaju.",
      });
    }

    const amount = numberValue(req.body?.amount);
    const currency = String(req.body?.currency || "EUR").trim().toUpperCase();
    const description = String(req.body?.description || "").trim();
    const payeeKind = String(req.body?.payeeKind || "").trim().toLowerCase();
    const payeeUserId = req.body?.payeeUserId ? String(req.body.payeeUserId).trim() : null;

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "Invalid amount", detail: "Iznos nije ispravan." });
    }
    if (!EXPENSE_CURRENCIES.has(currency)) {
      return res.status(400).json({ error: "Invalid currency", detail: "Valuta nije podržana." });
    }
    if (!description) {
      return res.status(400).json({ error: "Invalid description", detail: "Opis je obavezan." });
    }
    if (!["member", "band", "external"].includes(payeeKind)) {
      return res.status(400).json({ error: "Invalid payee", detail: "Izaberi kome ide trošak." });
    }
    if (payeeKind === "member") {
      if (!payeeUserId) {
        return res.status(400).json({ error: "Invalid payee", detail: "Izaberi člana." });
      }
      const membership = await query(
        `SELECT user_id FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
        { bandId: req.bandId, userId: payeeUserId },
      );
      if (!membership.rows[0]) {
        return res.status(400).json({ error: "Invalid member", detail: "Korisnik nije član ovog benda." });
      }
    }

    const inserted = await query(
      `INSERT INTO event_expenses
        (event_id, band_id, amount, currency, description, payee_kind, payee_user_id, created_by)
       VALUES
        (:eventId, :bandId, :amount, :currency, :description, :payeeKind, :payeeUserId, :createdBy)
       RETURNING id, event_id, band_id, amount, currency, description,
                 payee_kind, payee_user_id, created_at`,
      {
        eventId,
        bandId: req.bandId,
        amount,
        currency,
        description,
        payeeKind,
        payeeUserId: payeeKind === "member" ? payeeUserId : null,
        createdBy: req.user.id,
      },
    );

    const row = inserted.rows[0];
    let payeeName = payeeKind === "band" ? "Bend" : payeeKind === "external" ? "Spoljnji" : "Član";
    if (payeeKind === "member" && payeeUserId) {
      const profile = await query(
        `SELECT display_name, email FROM profiles WHERE id = :id LIMIT 1`,
        { id: payeeUserId },
      );
      payeeName =
        profile.rows[0]?.display_name || profile.rows[0]?.email?.split("@")[0] || "Član";
    }

    res.status(201).json(
      mapExpenseRow({
        ...row,
        payee_name: payeeName,
      }),
    );

    const who = await actorLabel(req.user.id);
    await notifyBandEvent({
      bandId: req.bandId,
      type: "expense_changed",
      actorUserId: req.user.id,
      audience: "finance",
      eventId,
      subjectUserId: payeeKind === "member" ? payeeUserId : null,
      message: `${who} je dodao/la trošak (${description || "trošak"}): ${amount} ${currency}`,
      payload: { page: "schedule", eventId: String(eventId), bandId: req.bandId },
    });
  } catch (error) {
    next(error);
  }
});

app.delete(
  "/api/events/:id/expenses/:expenseId",
  requireAuth,
  requireBandMember,
  requireBandAdmin,
  async (req, res, next) => {
    try {
      const event = await query(
        `SELECT id, event_date_text FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
        { id: req.params.id, bandId: req.bandId },
      );
      if (!event.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }
      if (isPastEventDate(event.rows[0].event_date_text)) {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Prošli termini su zaključani — troškovi se ne menjaju.",
        });
      }

      const result = await query(
        `DELETE FROM event_expenses
         WHERE id = :expenseId AND event_id = :eventId AND band_id = :bandId
         RETURNING id`,
        {
          expenseId: req.params.expenseId,
          eventId: req.params.id,
          bandId: req.bandId,
        },
      );
      if (!result.rowCount) {
        return res.status(404).json({ error: "Not found" });
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

const emptyDayDetails = {
  gatheringTime: "",
  departureTime: "",
  lodgingArrivalTime: "",
  loadInTime: "",
  setUpTime: "",
  soundcheckTime: "",
  soundcheckDurationMin: null,
  showStartTime: "",
  showEndTime: "",
  curfewTime: "",
  leaveTime: "",
};

app.get("/api/events/:id/day-details", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const result = await query(
      `SELECT gathering_time, departure_time, lodging_arrival_time, load_in_time, set_up_time,
              soundcheck_time, soundcheck_duration_min, show_start_time, show_end_time,
              curfew_time, leave_time
       FROM event_day_details
       WHERE event_id = :eventId AND band_id = :bandId
       LIMIT 1`,
      { eventId: req.params.id, bandId: req.bandId },
    );

    res.json({
      eventId: Number(req.params.id),
      bandId: req.bandId,
      ...(result.rows[0] ? mapDayDetailsRow(result.rows[0]) : emptyDayDetails),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/events/:id/day-details", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    if (!eventId) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const event = await query(
      `SELECT id, event_date_text FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    if (isPastEventDate(event.rows[0].event_date_text)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Prošli termini su zaključani — detalji se ne menjaju.",
      });
    }

    const details = normalizeDayDetails(req.body || {});
    const result = await query(
      `INSERT INTO event_day_details (
         event_id, band_id,
         gathering_time, departure_time, lodging_arrival_time, load_in_time, set_up_time,
         soundcheck_time, soundcheck_duration_min, show_start_time, show_end_time,
         curfew_time, leave_time
       ) VALUES (
         :eventId, :bandId,
         :gatheringTime, :departureTime, :lodgingArrivalTime, :loadInTime, :setUpTime,
         :soundcheckTime, :soundcheckDurationMin, :showStartTime, :showEndTime,
         :curfewTime, :leaveTime
       )
       ON CONFLICT (event_id) DO UPDATE SET
         gathering_time = EXCLUDED.gathering_time,
         departure_time = EXCLUDED.departure_time,
         lodging_arrival_time = EXCLUDED.lodging_arrival_time,
         load_in_time = EXCLUDED.load_in_time,
         set_up_time = EXCLUDED.set_up_time,
         soundcheck_time = EXCLUDED.soundcheck_time,
         soundcheck_duration_min = EXCLUDED.soundcheck_duration_min,
         show_start_time = EXCLUDED.show_start_time,
         show_end_time = EXCLUDED.show_end_time,
         curfew_time = EXCLUDED.curfew_time,
         leave_time = EXCLUDED.leave_time,
         updated_at = NOW()
       RETURNING gathering_time, departure_time, lodging_arrival_time, load_in_time, set_up_time,
                 soundcheck_time, soundcheck_duration_min, show_start_time, show_end_time,
                 curfew_time, leave_time`,
      { eventId, bandId: req.bandId, ...details },
    );

    res.json({
      eventId,
      bandId: req.bandId,
      ...mapDayDetailsRow(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

function mapTechChannelRow(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    bandId: row.band_id,
    kind: row.kind === "output" ? "output" : "input",
    sortOrder: Number(row.sort_order) || 0,
    label: row.label || "",
    gear: row.gear || "",
    cable: row.cable || "",
    hardware: row.hardware || "",
    phantom48v: Boolean(row.phantom_48v),
    pad: Boolean(row.pad),
    stereo: Boolean(row.stereo),
    isEmpty: Boolean(row.is_empty),
    levelDb: row.level_db == null || row.level_db === "" ? null : Number(row.level_db),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTechChannel(value, { kind = "input" } = {}) {
  const normalizedKind = value?.kind === "output" || kind === "output" ? "output" : "input";
  let levelDb = null;
  if (value?.levelDb != null && String(value.levelDb).trim() !== "") {
    const parsed = Number(String(value.levelDb).replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= -60 && parsed <= 24) {
      levelDb = Math.round(parsed * 10) / 10;
    }
  }

  const isEmpty = Boolean(value?.isEmpty);
  return {
    kind: normalizedKind,
    label: String(value?.label ?? "").trim().slice(0, 120),
    gear: String(value?.gear ?? "").trim().slice(0, 120),
    cable: String(value?.cable ?? "").trim().slice(0, 120),
    hardware: String(value?.hardware ?? "").trim().slice(0, 120),
    phantom48v: isEmpty ? false : Boolean(value?.phantom48v),
    pad: isEmpty ? false : Boolean(value?.pad),
    stereo: isEmpty ? false : Boolean(value?.stereo),
    isEmpty,
    levelDb: isEmpty ? null : levelDb,
    notes: String(value?.notes ?? "").trim().slice(0, 500),
  };
}

function buildTechRiderStats(inputs, outputs) {
  return {
    inputCount: inputs.length,
    outputCount: outputs.length,
    phantom48vActive: inputs.filter((row) => row.phantom48v).length,
  };
}

function parseTechConsoleIds(raw) {
  if (!raw) return [];
  try {
    return normalizeConsoleIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

function buildTechRiderLimits(consoleIds) {
  const resolved = resolveConsoleLimits(consoleIds);
  return { inputMax: resolved.inputMax, outputMax: resolved.outputMax };
}

async function loadTechRiderBundle(eventId, bandId) {
  const eventResult = await query(
    `SELECT tech_console_ids FROM events WHERE id = :eventId AND band_id = :bandId LIMIT 1`,
    { eventId, bandId },
  );
  const consoleIds = parseTechConsoleIds(eventResult.rows[0]?.tech_console_ids);

  const result = await query(
    `SELECT id, event_id, band_id, kind, sort_order, label, gear, cable, hardware,
            phantom_48v, pad, stereo, is_empty, level_db, notes, created_at, updated_at
     FROM event_tech_channels
     WHERE event_id = :eventId AND band_id = :bandId
     ORDER BY kind ASC, sort_order ASC, id ASC`,
    { eventId, bandId },
  );
  const rows = result.rows.map(mapTechChannelRow);
  const inputs = rows.filter((row) => row.kind === "input");
  const outputs = rows.filter((row) => row.kind === "output");
  return {
    inputs,
    outputs,
    stats: buildTechRiderStats(inputs, outputs),
    consoleIds,
    limits: buildTechRiderLimits(consoleIds),
  };
}

async function assertTechChannelCapacity(eventId, bandId, kind) {
  const bundle = await loadTechRiderBundle(eventId, bandId);
  if (!bundle.consoleIds.length) {
    const err = new Error("Izaberi mixing konzolu pre dodavanja kanala.");
    err.status = 400;
    throw err;
  }
  const list = kind === "output" ? bundle.outputs : bundle.inputs;
  const max = kind === "output" ? bundle.limits.outputMax : bundle.limits.inputMax;
  if (list.length >= max) {
    const err = new Error(
      kind === "output"
        ? `Maksimum ${max} izlaza za izabrane konzole.`
        : `Maksimum ${max} ulaza za izabrane konzole.`,
    );
    err.status = 400;
    throw err;
  }
  return bundle;
}

async function assertEventEditableForTechRider(eventId, bandId) {
  const event = await query(
    `SELECT id, event_date_text FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
    { id: eventId, bandId },
  );
  if (!event.rows[0]) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  if (isPastEventDate(event.rows[0].event_date_text)) {
    const err = new Error("Prošli termini su zaključani — rider se ne menja.");
    err.status = 403;
    throw err;
  }
  return event.rows[0];
}

app.get("/api/events/:id/tech-rider", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const bundle = await loadTechRiderBundle(eventId, req.bandId);
    res.json({
      eventId,
      bandId: req.bandId,
      ...bundle,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/:id/tech-rider/channels", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    if (!eventId) {
      return res.status(400).json({ error: "Invalid request" });
    }

    await assertEventEditableForTechRider(eventId, req.bandId);
    const channel = normalizeTechChannel(req.body || {});
    await assertTechChannelCapacity(eventId, req.bandId, channel.kind);

    const orderResult = await query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
       FROM event_tech_channels
       WHERE event_id = :eventId AND band_id = :bandId AND kind = :kind`,
      { eventId, bandId: req.bandId, kind: channel.kind },
    );
    const sortOrder = Number(orderResult.rows[0]?.next_order) || 1;

    const result = await query(
      `INSERT INTO event_tech_channels (
         event_id, band_id, kind, sort_order, label, gear, cable, hardware,
         phantom_48v, pad, stereo, is_empty, level_db, notes
       ) VALUES (
         :eventId, :bandId, :kind, :sortOrder, :label, :gear, :cable, :hardware,
         :phantom48v, :pad, :stereo, :isEmpty, :levelDb, :notes
       )
       RETURNING id, event_id, band_id, kind, sort_order, label, gear, cable, hardware,
                 phantom_48v, pad, stereo, is_empty, level_db, notes, created_at, updated_at`,
      {
        eventId,
        bandId: req.bandId,
        kind: channel.kind,
        sortOrder,
        label: channel.label,
        gear: channel.gear,
        cable: channel.cable,
        hardware: channel.hardware,
        phantom48v: channel.phantom48v,
        pad: channel.pad,
        stereo: channel.stereo,
        isEmpty: channel.isEmpty,
        levelDb: channel.levelDb,
        notes: channel.notes,
      },
    );

    res.status(201).json(mapTechChannelRow(result.rows[0]));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, detail: error.message });
    }
    next(error);
  }
});

app.put(
  "/api/events/:id/tech-rider/channels/:channelId",
  requireAuth,
  requireBandMember,
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      const channelId = Number(req.params.channelId);
      if (!eventId || !channelId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      await assertEventEditableForTechRider(eventId, req.bandId);

      const existing = await query(
        `SELECT id, kind FROM event_tech_channels
         WHERE id = :channelId AND event_id = :eventId AND band_id = :bandId
         LIMIT 1`,
        { channelId, eventId, bandId: req.bandId },
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }

      const channel = normalizeTechChannel(req.body || {}, { kind: existing.rows[0].kind });
      const result = await query(
        `UPDATE event_tech_channels
         SET label = :label,
             gear = :gear,
             cable = :cable,
             hardware = :hardware,
             phantom_48v = :phantom48v,
             pad = :pad,
             stereo = :stereo,
             is_empty = :isEmpty,
             level_db = :levelDb,
             notes = :notes,
             updated_at = NOW()
         WHERE id = :channelId AND event_id = :eventId AND band_id = :bandId
         RETURNING id, event_id, band_id, kind, sort_order, label, gear, cable, hardware,
                   phantom_48v, pad, stereo, is_empty, level_db, notes, created_at, updated_at`,
        {
          channelId,
          eventId,
          bandId: req.bandId,
          label: channel.label,
          gear: channel.gear,
          cable: channel.cable,
          hardware: channel.hardware,
          phantom48v: channel.phantom48v,
          pad: channel.pad,
          stereo: channel.stereo,
          isEmpty: channel.isEmpty,
          levelDb: channel.levelDb,
          notes: channel.notes,
        },
      );

      res.json(mapTechChannelRow(result.rows[0]));
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, detail: error.message });
      }
      next(error);
    }
  },
);

app.delete(
  "/api/events/:id/tech-rider/channels/:channelId",
  requireAuth,
  requireBandMember,
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      const channelId = Number(req.params.channelId);
      if (!eventId || !channelId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      await assertEventEditableForTechRider(eventId, req.bandId);

      const existing = await query(
        `SELECT id, kind FROM event_tech_channels
         WHERE id = :channelId AND event_id = :eventId AND band_id = :bandId
         LIMIT 1`,
        { channelId, eventId, bandId: req.bandId },
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }

      await query(
        `DELETE FROM event_tech_channels
         WHERE id = :channelId AND event_id = :eventId AND band_id = :bandId`,
        { channelId, eventId, bandId: req.bandId },
      );

      const remaining = await query(
        `SELECT id FROM event_tech_channels
         WHERE event_id = :eventId AND band_id = :bandId AND kind = :kind
         ORDER BY sort_order ASC, id ASC`,
        { eventId, bandId: req.bandId, kind: existing.rows[0].kind },
      );

      await Promise.all(
        remaining.rows.map((row, index) =>
          query(
            `UPDATE event_tech_channels SET sort_order = :sortOrder WHERE id = :id`,
            { id: row.id, sortOrder: index + 1 },
          ),
        ),
      );

      res.status(204).end();
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, detail: error.message });
      }
      next(error);
    }
  },
);

app.put("/api/events/:id/tech-rider/reorder", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const kind = req.body?.kind === "output" ? "output" : "input";
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];

    if (!eventId || !orderedIds.length) {
      return res.status(400).json({ error: "Invalid request" });
    }

    await assertEventEditableForTechRider(eventId, req.bandId);

    const existing = await query(
      `SELECT id FROM event_tech_channels
       WHERE event_id = :eventId AND band_id = :bandId AND kind = :kind
       ORDER BY sort_order ASC, id ASC`,
      { eventId, bandId: req.bandId, kind },
    );
    const existingIds = existing.rows.map((row) => row.id);
    if (
      existingIds.length !== orderedIds.length ||
      !existingIds.every((id) => orderedIds.includes(id))
    ) {
      return res.status(400).json({ error: "Invalid reorder payload" });
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        query(`UPDATE event_tech_channels SET sort_order = :sortOrder WHERE id = :id`, {
          id,
          sortOrder: index + 1,
        }),
      ),
    );

    const bundle = await loadTechRiderBundle(eventId, req.bandId);
    res.json({
      eventId,
      bandId: req.bandId,
      ...bundle,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, detail: error.message });
    }
    next(error);
  }
});

app.put("/api/events/:id/tech-rider/consoles", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    if (!eventId) {
      return res.status(400).json({ error: "Invalid request" });
    }

    await assertEventEditableForTechRider(eventId, req.bandId);
    const consoleIds = normalizeConsoleIds(req.body?.consoleIds);

    await query(
      `UPDATE events
       SET tech_console_ids = :consoleIds, updated_at = NOW()
       WHERE id = :eventId AND band_id = :bandId`,
      {
        eventId,
        bandId: req.bandId,
        consoleIds: JSON.stringify(consoleIds),
      },
    );

    const bundle = await loadTechRiderBundle(eventId, req.bandId);
    res.json({
      eventId,
      bandId: req.bandId,
      ...bundle,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, detail: error.message });
    }
    next(error);
  }
});

function mapBandSongRow(row) {
  return {
    id: row.id,
    bandId: row.band_id,
    title: row.title || "",
    songKey: row.song_key || "",
    lyrics: row.lyrics || "",
    durationSec: row.duration_sec == null ? null : Number(row.duration_sec),
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSetlistItemRow(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    bandId: row.band_id,
    section: row.section,
    sortOrder: Number(row.sort_order) || 0,
    songId: row.song_id == null ? null : Number(row.song_id),
    title: row.title || "",
    songKey: row.song_key || "",
    lyrics: row.lyrics || "",
    durationSec: row.duration_sec == null ? null : Number(row.duration_sec),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSetlistSection(value) {
  const section = String(value || "main").toLowerCase();
  if (section === "encore" || section === "alts") return section;
  return "main";
}

function normalizeDurationSec(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function buildSetlistStats(sections) {
  const all = [...sections.main, ...sections.encore, ...sections.alts];
  const totalDurationSec = all.reduce((sum, item) => sum + (item.durationSec || 0), 0);
  return {
    totalSongs: all.length,
    mainCount: sections.main.length,
    encoreCount: sections.encore.length,
    altsCount: sections.alts.length,
    totalDurationSec,
  };
}

async function getBandMemberSetlistFlags(userId, bandId) {
  const result = await query(
    `SELECT member_role, can_edit_setlist
     FROM band_members
     WHERE band_id = :bandId AND user_id = :userId
     LIMIT 1`,
    { bandId, userId },
  );
  return result.rows[0] || null;
}

async function resolveCanEditSetlist(userId, bandId) {
  const member = await getBandMemberSetlistFlags(userId, bandId);
  if (!member) return false;
  return canEditSetlist(member.member_role, member.can_edit_setlist);
}

async function assertCanEditSetlist(req) {
  const member = await getBandMemberSetlistFlags(req.user.id, req.bandId);
  if (!member) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  if (!canEditSetlist(member.member_role, member.can_edit_setlist)) {
    const err = new Error("Nemaš dozvolu za izmenu set liste.");
    err.status = 403;
    throw err;
  }
}

async function loadSetlistBundle(eventId, bandId) {
  const songsResult = await query(
    `SELECT id, band_id, title, song_key, lyrics, duration_sec, sort_order, created_at, updated_at
     FROM band_songs
     WHERE band_id = :bandId
     ORDER BY sort_order ASC, id ASC`,
    { bandId },
  );
  const itemsResult = await query(
    `SELECT id, event_id, band_id, section, sort_order, song_id, title, song_key, lyrics,
            duration_sec, notes, created_at, updated_at
     FROM event_setlist_items
     WHERE event_id = :eventId AND band_id = :bandId
     ORDER BY section ASC, sort_order ASC, id ASC`,
    { eventId, bandId },
  );
  const items = itemsResult.rows.map(mapSetlistItemRow);
  const sections = {
    main: items.filter((item) => item.section === "main"),
    encore: items.filter((item) => item.section === "encore"),
    alts: items.filter((item) => item.section === "alts"),
  };
  return {
    songs: songsResult.rows.map(mapBandSongRow),
    sections,
    stats: buildSetlistStats(sections),
  };
}

async function assertEventEditableForSetlist(eventId, bandId) {
  const event = await query(
    `SELECT id, event_date_text FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
    { id: eventId, bandId },
  );
  if (!event.rows[0]) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  if (isPastEventDate(event.rows[0].event_date_text)) {
    const err = new Error("Prošli termini su zaključani — set lista se ne menja.");
    err.status = 403;
    throw err;
  }
  return event.rows[0];
}

async function loadBandSongForBand(songId, bandId) {
  const result = await query(
    `SELECT id, band_id, title, song_key, lyrics, duration_sec, sort_order, created_at, updated_at
     FROM band_songs
     WHERE id = :songId AND band_id = :bandId
     LIMIT 1`,
    { songId, bandId },
  );
  return result.rows[0] ? mapBandSongRow(result.rows[0]) : null;
}

async function createBandSong(bandId, payload) {
  const title = String(payload.title || "").trim().slice(0, 200);
  if (!title) {
    const err = new Error("Naslov pesme je obavezan.");
    err.status = 400;
    throw err;
  }
  const orderResult = await query(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
     FROM band_songs WHERE band_id = :bandId`,
    { bandId },
  );
  const sortOrder = Number(orderResult.rows[0]?.next_order) || 1;
  const result = await query(
    `INSERT INTO band_songs (band_id, title, song_key, lyrics, duration_sec, sort_order)
     VALUES (:bandId, :title, :songKey, :lyrics, :durationSec, :sortOrder)
     RETURNING id, band_id, title, song_key, lyrics, duration_sec, sort_order, created_at, updated_at`,
    {
      bandId,
      title,
      songKey: String(payload.songKey || "").trim().slice(0, 32),
      lyrics: String(payload.lyrics || ""),
      durationSec: normalizeDurationSec(payload.durationSec),
      sortOrder,
    },
  );
  return mapBandSongRow(result.rows[0]);
}

function snapshotFromSong(song, notes = "") {
  return {
    songId: song.id,
    title: song.title || "",
    songKey: song.songKey || "",
    lyrics: song.lyrics || "",
    durationSec: song.durationSec,
    notes: String(notes || "").slice(0, 500),
  };
}

app.get(
  "/api/lyrics/search",
  requireAuth,
  rateLimit({
    windowMs: 60_000,
    max: 60,
    keyFn: (req) => `lyrics-search:${req.user?.id || req.ip || "unknown"}`,
  }),
  async (req, res, next) => {
    try {
      const q = String(req.query.q || "").trim();
      const track = String(req.query.track || "").trim();
      const artist = String(req.query.artist || "").trim();
      if (!q && !track) {
        return res.status(400).json({ error: "Unesi naslov ili ključnu reč." });
      }
      if ((q || track).length < 3) {
        return res.json({
          source: "lrclib",
          results: [],
          rateLimited: false,
          retryAfter: 0,
          message: "Unesi bar tri karaktera za online pretragu.",
        });
      }

      const search = await searchCommunityLyrics({ q, trackName: track, artistName: artist });
      res.json({
        source: "lrclib",
        disclaimer:
          "Zajednički katalog (LRCLIB) — nije royalty-free. Proveri autorska prava pre javnog korišćenja.",
        results: search.results.map((row) => ({
          id: row.id,
          trackName: row.trackName,
          artistName: row.artistName,
          albumName: row.albumName,
          durationSec: row.durationSec,
          instrumental: row.instrumental,
          hasLyrics: Boolean(row.plainLyrics),
          lyricsPreview: String(row.plainLyrics || "").slice(0, 140),
        })),
        rateLimited: search.rateLimited,
        retryAfter: search.retryAfter,
        message: search.rateLimited
          ? `LRCLIB pretraga pauzirana — sačekaj ${search.retryAfter || 30}s pa klikni Pretraži online.`
          : "",
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/lyrics/community/:id",
  requireAuth,
  rateLimit({
    windowMs: 60_000,
    max: 30,
    keyFn: (req) => `lyrics-get:${req.user?.id || req.ip || "unknown"}`,
  }),
  async (req, res, next) => {
    try {
      const row = await getCommunityLyricsById(req.params.id);
      if (!row) {
        return res.status(404).json({ error: "Tekst nije pronađen." });
      }
      res.json({
        source: "lrclib",
        disclaimer:
          "Zajednički katalog (LRCLIB) — nije royalty-free. Proveri autorska prava pre javnog korišćenja.",
        ...row,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/bands/:id/songs", requireAuth, bandIdFromParams, requireBandMember, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, band_id, title, song_key, lyrics, duration_sec, sort_order, created_at, updated_at
       FROM band_songs
       WHERE band_id = :bandId
       ORDER BY sort_order ASC, id ASC`,
      { bandId: req.bandId },
    );
    res.json({
      bandId: req.bandId,
      songs: result.rows.map(mapBandSongRow),
      canEdit: await resolveCanEditSetlist(req.user.id, req.bandId),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/bands/:id/songs", requireAuth, bandIdFromParams, requireBandMember, async (req, res, next) => {
  try {
    await assertCanEditSetlist(req);
    const song = await createBandSong(req.bandId, req.body || {});
    res.status(201).json(song);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, detail: error.message });
    }
    next(error);
  }
});

app.put(
  "/api/bands/:id/songs/:songId",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  async (req, res, next) => {
    try {
      await assertCanEditSetlist(req);
      const songId = Number(req.params.songId);
      if (!songId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const existing = await query(
        `SELECT id FROM band_songs WHERE id = :songId AND band_id = :bandId LIMIT 1`,
        { songId, bandId: req.bandId },
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }

      const title = String(req.body?.title ?? "").trim().slice(0, 200);
      if (!title) {
        return res.status(400).json({ error: "Naslov pesme je obavezan.", detail: "Naslov pesme je obavezan." });
      }

      const result = await query(
        `UPDATE band_songs
         SET title = :title,
             song_key = :songKey,
             lyrics = :lyrics,
             duration_sec = :durationSec,
             updated_at = NOW()
         WHERE id = :songId AND band_id = :bandId
         RETURNING id, band_id, title, song_key, lyrics, duration_sec, sort_order, created_at, updated_at`,
        {
          songId,
          bandId: req.bandId,
          title,
          songKey: String(req.body?.songKey ?? "").trim().slice(0, 32),
          lyrics: String(req.body?.lyrics ?? ""),
          durationSec: normalizeDurationSec(req.body?.durationSec),
        },
      );
      res.json(mapBandSongRow(result.rows[0]));
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, detail: error.message });
      }
      next(error);
    }
  },
);

app.delete(
  "/api/bands/:id/songs/:songId",
  requireAuth,
  bandIdFromParams,
  requireBandMember,
  async (req, res, next) => {
    try {
      await assertCanEditSetlist(req);
      const songId = Number(req.params.songId);
      if (!songId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const existing = await query(
        `SELECT id FROM band_songs WHERE id = :songId AND band_id = :bandId LIMIT 1`,
        { songId, bandId: req.bandId },
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }

      await query(`DELETE FROM band_songs WHERE id = :songId AND band_id = :bandId`, {
        songId,
        bandId: req.bandId,
      });
      res.status(204).end();
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, detail: error.message });
      }
      next(error);
    }
  },
);

app.get("/api/events/:id/setlist", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const bundle = await loadSetlistBundle(eventId, req.bandId);
    res.json({
      eventId,
      bandId: req.bandId,
      ...bundle,
      canEdit: await resolveCanEditSetlist(req.user.id, req.bandId),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/:id/setlist/items", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    if (!eventId) {
      return res.status(400).json({ error: "Invalid request" });
    }

    await assertCanEditSetlist(req);
    await assertEventEditableForSetlist(eventId, req.bandId);

    const section = normalizeSetlistSection(req.body?.section);
    let snapshot = null;

    const songId = Number(req.body?.songId);
    if (Number.isFinite(songId) && songId > 0) {
      const song = await loadBandSongForBand(songId, req.bandId);
      if (!song) {
        return res.status(404).json({ error: "Pesma nije u biblioteci benda." });
      }
      snapshot = snapshotFromSong(song, req.body?.notes);
    } else {
      const title = String(req.body?.title || "").trim();
      if (!title) {
        return res.status(400).json({ error: "Izaberi pesmu ili unesi naslov.", detail: "Izaberi pesmu ili unesi naslov." });
      }
      const song = await createBandSong(req.bandId, {
        title,
        songKey: req.body?.songKey,
        lyrics: req.body?.lyrics,
        durationSec: req.body?.durationSec,
      });
      snapshot = snapshotFromSong(song, req.body?.notes);
    }

    const orderResult = await query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
       FROM event_setlist_items
       WHERE event_id = :eventId AND band_id = :bandId AND section = :section`,
      { eventId, bandId: req.bandId, section },
    );
    const sortOrder = Number(orderResult.rows[0]?.next_order) || 1;

    const result = await query(
      `INSERT INTO event_setlist_items (
         event_id, band_id, section, sort_order, song_id, title, song_key, lyrics, duration_sec, notes
       ) VALUES (
         :eventId, :bandId, :section, :sortOrder, :songId, :title, :songKey, :lyrics, :durationSec, :notes
       )
       RETURNING id, event_id, band_id, section, sort_order, song_id, title, song_key, lyrics,
                 duration_sec, notes, created_at, updated_at`,
      {
        eventId,
        bandId: req.bandId,
        section,
        sortOrder,
        songId: snapshot.songId,
        title: snapshot.title,
        songKey: snapshot.songKey,
        lyrics: snapshot.lyrics,
        durationSec: snapshot.durationSec,
        notes: snapshot.notes,
      },
    );

    res.status(201).json(mapSetlistItemRow(result.rows[0]));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, detail: error.message });
    }
    next(error);
  }
});

app.put(
  "/api/events/:id/setlist/items/:itemId",
  requireAuth,
  requireBandMember,
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!eventId || !itemId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      await assertCanEditSetlist(req);
      await assertEventEditableForSetlist(eventId, req.bandId);

      const existing = await query(
        `SELECT id, section, song_id FROM event_setlist_items
         WHERE id = :itemId AND event_id = :eventId AND band_id = :bandId
         LIMIT 1`,
        { itemId, eventId, bandId: req.bandId },
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }

      const nextSection = req.body?.section != null
        ? normalizeSetlistSection(req.body.section)
        : existing.rows[0].section;
      const title = req.body?.title != null ? String(req.body.title).trim().slice(0, 200) : null;
      if (title === "") {
        return res.status(400).json({ error: "Naslov pesme je obavezan.", detail: "Naslov pesme je obavezan." });
      }

      const current = await query(
        `SELECT title, song_key, lyrics, duration_sec, notes
         FROM event_setlist_items
         WHERE id = :itemId AND event_id = :eventId AND band_id = :bandId
         LIMIT 1`,
        { itemId, eventId, bandId: req.bandId },
      );
      const row = current.rows[0];

      const payload = {
        title: title ?? row.title,
        songKey: req.body?.songKey != null ? String(req.body.songKey).trim().slice(0, 32) : row.song_key,
        lyrics: req.body?.lyrics != null ? String(req.body.lyrics) : row.lyrics,
        durationSec:
          req.body?.durationSec !== undefined
            ? normalizeDurationSec(req.body.durationSec)
            : row.duration_sec == null
              ? null
              : Number(row.duration_sec),
        notes: req.body?.notes != null ? String(req.body.notes).slice(0, 500) : row.notes,
      };

      if (req.body?.updateLibrary && existing.rows[0].song_id) {
        await query(
          `UPDATE band_songs
           SET title = :title,
               song_key = :songKey,
               lyrics = :lyrics,
               duration_sec = :durationSec,
               updated_at = NOW()
           WHERE id = :songId AND band_id = :bandId`,
          {
            songId: existing.rows[0].song_id,
            bandId: req.bandId,
            title: payload.title,
            songKey: payload.songKey,
            lyrics: payload.lyrics,
            durationSec: payload.durationSec,
          },
        );
      }

      let sortOrder = null;
      if (nextSection !== existing.rows[0].section) {
        const orderResult = await query(
          `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
           FROM event_setlist_items
           WHERE event_id = :eventId AND band_id = :bandId AND section = :section`,
          { eventId, bandId: req.bandId, section: nextSection },
        );
        sortOrder = Number(orderResult.rows[0]?.next_order) || 1;
      }

      const result = await query(
        `UPDATE event_setlist_items
         SET section = :section,
             title = :title,
             song_key = :songKey,
             lyrics = :lyrics,
             duration_sec = :durationSec,
             notes = :notes,
             sort_order = COALESCE(:sortOrder, sort_order),
             updated_at = NOW()
         WHERE id = :itemId AND event_id = :eventId AND band_id = :bandId
         RETURNING id, event_id, band_id, section, sort_order, song_id, title, song_key, lyrics,
                   duration_sec, notes, created_at, updated_at`,
        {
          itemId,
          eventId,
          bandId: req.bandId,
          section: nextSection,
          title: payload.title,
          songKey: payload.songKey,
          lyrics: payload.lyrics,
          durationSec: payload.durationSec,
          notes: payload.notes,
          sortOrder,
        },
      );

      res.json(mapSetlistItemRow(result.rows[0]));
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, detail: error.message });
      }
      next(error);
    }
  },
);

app.delete(
  "/api/events/:id/setlist/items/:itemId",
  requireAuth,
  requireBandMember,
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!eventId || !itemId) {
        return res.status(400).json({ error: "Invalid request" });
      }

      await assertCanEditSetlist(req);
      await assertEventEditableForSetlist(eventId, req.bandId);

      const existing = await query(
        `SELECT id, section FROM event_setlist_items
         WHERE id = :itemId AND event_id = :eventId AND band_id = :bandId
         LIMIT 1`,
        { itemId, eventId, bandId: req.bandId },
      );
      if (!existing.rows[0]) {
        return res.status(404).json({ error: "Not found" });
      }

      await query(
        `DELETE FROM event_setlist_items
         WHERE id = :itemId AND event_id = :eventId AND band_id = :bandId`,
        { itemId, eventId, bandId: req.bandId },
      );

      const remaining = await query(
        `SELECT id FROM event_setlist_items
         WHERE event_id = :eventId AND band_id = :bandId AND section = :section
         ORDER BY sort_order ASC, id ASC`,
        { eventId, bandId: req.bandId, section: existing.rows[0].section },
      );

      await Promise.all(
        remaining.rows.map((row, index) =>
          query(`UPDATE event_setlist_items SET sort_order = :sortOrder WHERE id = :id`, {
            id: row.id,
            sortOrder: index + 1,
          }),
        ),
      );

      res.status(204).end();
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, detail: error.message });
      }
      next(error);
    }
  },
);

app.put("/api/events/:id/setlist/reorder", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const section = normalizeSetlistSection(req.body?.section);
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];

    if (!eventId || !orderedIds.length) {
      return res.status(400).json({ error: "Invalid request" });
    }

    await assertCanEditSetlist(req);
    await assertEventEditableForSetlist(eventId, req.bandId);

    const existing = await query(
      `SELECT id FROM event_setlist_items
       WHERE event_id = :eventId AND band_id = :bandId AND section = :section
       ORDER BY sort_order ASC, id ASC`,
      { eventId, bandId: req.bandId, section },
    );
    const existingIds = existing.rows.map((row) => row.id);
    if (
      existingIds.length !== orderedIds.length ||
      !existingIds.every((id) => orderedIds.includes(id))
    ) {
      return res.status(400).json({ error: "Invalid reorder payload" });
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        query(`UPDATE event_setlist_items SET sort_order = :sortOrder WHERE id = :id`, {
          id,
          sortOrder: index + 1,
        }),
      ),
    );

    const bundle = await loadSetlistBundle(eventId, req.bandId);
    res.json({
      eventId,
      bandId: req.bandId,
      ...bundle,
      canEdit: true,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, detail: error.message });
    }
    next(error);
  }
});

app.get("/api/events/:id/comments", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    const result = await query(
      `SELECT c.id, c.body, c.created_at, c.user_id,
              COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Korisnik') AS author_name
       FROM event_comments c
       JOIN profiles p ON p.id = c.user_id
       WHERE c.event_id = :eventId
       ORDER BY c.created_at ASC, c.id ASC`,
      { eventId: req.params.id },
    );
    res.json({
      comments: result.rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        userId: row.user_id,
        authorName: row.author_name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/:id/comments", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const body = String(req.body?.body || "").trim();
    if (!body) {
      return res.status(400).json({ error: "Invalid body", detail: "Komentar ne sme biti prazan." });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: "Invalid body", detail: "Komentar je predugačak (max 2000)." });
    }

    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const result = await query(
      `INSERT INTO event_comments (event_id, user_id, body)
       VALUES (:eventId, :userId, :body)
       RETURNING id, body, created_at, user_id`,
      { eventId: req.params.id, userId: req.user.id, body },
    );
    const row = result.rows[0];
    const profile = await query(
      `SELECT COALESCE(NULLIF(display_name, ''), NULLIF(email, ''), 'Korisnik') AS author_name
       FROM profiles WHERE id = :id LIMIT 1`,
      { id: req.user.id },
    );
    res.status(201).json({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      userId: row.user_id,
      authorName: profile.rows[0]?.author_name || "Korisnik",
    });

    const eventMeta = await query(
      `SELECT event_date_text, city FROM events WHERE id = :id LIMIT 1`,
      { id: req.params.id },
    );
    const who = profile.rows[0]?.author_name || "Korisnik";
    await notifyBandEvent({
      bandId: req.bandId,
      type: "comment_added",
      actorUserId: req.user.id,
      audience: "band_visible",
      eventId: req.params.id,
      message: `${who} je komentarisao/la termin ${formatEventLabel({
        date: eventMeta.rows[0]?.event_date_text,
        city: eventMeta.rows[0]?.city,
      })}`,
      payload: { page: "schedule", eventId: String(req.params.id), bandId: req.bandId },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const entityType = String(req.query.entityType || "").trim();
    const entityId = String(req.query.entityId || "").trim();
    if (!entityType || !entityId) {
      return res.status(400).json({
        error: "Missing params",
        detail: "entityType i entityId su obavezni.",
      });
    }
    if (!["event", "payment", "event_member_finance"].includes(entityType)) {
      return res.status(400).json({ error: "Invalid entityType" });
    }

    const result = await query(
      `SELECT a.id, a.entity_type, a.entity_id, a.action, a.before_json, a.after_json, a.created_at,
              a.actor_user_id,
              COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Korisnik') AS actor_name
       FROM transaction_audit a
       LEFT JOIN profiles p ON p.id = a.actor_user_id
       WHERE a.entity_type = :entityType
         AND a.entity_id = :entityId
         AND (a.band_id IS NULL OR a.band_id = :bandId)
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 100`,
      { entityType, entityId, bandId: req.bandId },
    );

    res.json({
      entries: result.rows.map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        before: row.before_json,
        after: row.after_json,
        createdAt: row.created_at,
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const payment = normalizePayment(req.body);
    // Creating a payment is always allowed (late bookkeeping); once its date is past, PUT/DELETE lock.

    const created = await withTransaction(async (tx) => {
      const result = await tx(
        `INSERT INTO payments (user_id, band_id, sort_order, payment_date_text, amount, currency)
         VALUES (
          :userId,
          :bandId,
          COALESCE((SELECT max_order + 1 FROM (
            SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM payments WHERE band_id = :bandId
          ) AS t), 1),
          :date, :amount, :currency
         )
         RETURNING id, user_id, band_id, payment_date_text, amount, currency`,
        {
          ...payment,
          userId: req.user.id,
          bandId: req.bandId,
        },
      );
      const row = result.rows[0];
      await writeAudit(
        {
          entityType: "payment",
          entityId: row.id,
          bandId: req.bandId,
          actorUserId: req.user.id,
          action: "insert",
          before: null,
          after: snapshotPayment(row),
        },
        tx,
      );
      return row;
    });

    res.status(201).json({
      ...payment,
      id: created.id,
      bandId: req.bandId,
    });

    const who = await actorLabel(req.user.id);
    await notifyBandEvent({
      bandId: req.bandId,
      type: "payment_changed",
      actorUserId: req.user.id,
      audience: "finance",
      subjectUserId: req.user.id,
      message: `${who} je uneo/la uplatu: ${payment.amount} ${payment.currency}`,
      payload: { page: "report", bandId: req.bandId },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/payments/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await query(
      `SELECT id, user_id, band_id, payment_date_text, amount, currency
       FROM payments WHERE id = :id AND user_id = :userId LIMIT 1`,
      { id: req.params.id, userId: req.user.id },
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    if (isPastEventDate(existing.rows[0].payment_date_text)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Prošle uplate su zaključane i ne mogu se menjati.",
      });
    }

    const payment = normalizePayment(req.body);
    if (isPastEventDate(payment.date)) {
      return res.status(400).json({
        error: "Invalid date",
        detail: "Datum uplate ne sme biti u prošlosti.",
      });
    }

    const updated = await withTransaction(async (tx) => {
      const result = await tx(
        `UPDATE payments
         SET payment_date_text = :date,
             amount = :amount,
             currency = :currency
         WHERE id = :id AND user_id = :userId
         RETURNING id, user_id, band_id, payment_date_text, amount, currency`,
        { ...payment, id: req.params.id, userId: req.user.id },
      );
      if (!result.rowCount) {
        const err = new Error("Not found");
        err.status = 404;
        throw err;
      }
      await writeAudit(
        {
          entityType: "payment",
          entityId: req.params.id,
          bandId: existing.rows[0].band_id,
          actorUserId: req.user.id,
          action: "update",
          before: snapshotPayment(existing.rows[0]),
          after: snapshotPayment(result.rows[0]),
        },
        tx,
      );
      return result.rows[0];
    });

    res.json({ ...payment, id: Number(req.params.id), bandId: updated.band_id });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/payments/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await query(
      `SELECT id, user_id, band_id, payment_date_text, amount, currency
       FROM payments WHERE id = :id AND user_id = :userId LIMIT 1`,
      { id: req.params.id, userId: req.user.id },
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    if (isPastEventDate(existing.rows[0].payment_date_text)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Prošle uplate su zaključane i ne mogu se brisati.",
      });
    }

    await withTransaction(async (tx) => {
      const result = await tx("DELETE FROM payments WHERE id = :id AND user_id = :userId", {
        id: req.params.id,
        userId: req.user.id,
      });
      if (!result.rowCount) {
        const err = new Error("Not found");
        err.status = 404;
        throw err;
      }
      await writeAudit(
        {
          entityType: "payment",
          entityId: req.params.id,
          bandId: existing.rows[0].band_id,
          actorUserId: req.user.id,
          action: "delete",
          before: snapshotPayment(existing.rows[0]),
          after: null,
        },
        tx,
      );
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === "production" && process.env.SERVE_STATIC !== "0") {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  logger.error("Unhandled API error", error);
  const status = Number(error.status) || 500;
  const publicDetail =
    status >= 500
      ? "Neočekivana greška na serveru."
      : String(error.message || "Request error").slice(0, 300);
  res.status(status).json({
    error: status >= 500 ? "Server error" : "Request error",
    detail: publicDetail,
  });
});

app.listen(port, host, () => {
  logger.info(`Chabar API running on http://${host}:${port}`);
  startPoolWarmer();
  syncMissingProfilesFromAuth()
    .then((result) => {
      if (result.created.length) {
        logger.info(`Synced ${result.created.length} auth user(s) into profiles`, {
          emails: result.created.map((row) => row.email),
        });
      }
    })
    .catch((error) => {
      logger.warn("Auth profile sync failed", { message: error.message });
    });
});

async function getPersonalSettings(userId) {
  const result = await query(
    `SELECT s.setting_key, s.setting_value
     FROM settings s
     JOIN bands b ON b.id = s.band_id AND b.kind = 'personal'
     JOIN band_members bm ON bm.band_id = b.id AND bm.user_id = :userId`,
    { userId },
  );
  return Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
}

async function getPersonalBandId(userId) {
  const result = await query(
    `SELECT b.id
     FROM bands b
     JOIN band_members bm ON bm.band_id = b.id
     WHERE bm.user_id = :userId AND b.kind = 'personal'
     LIMIT 1`,
    { userId },
  );
  return result.rows[0]?.id || null;
}

/** Serbian DD.MM.YYYY. text → comparable date; invalid → not past (don't block). */
function isPastEventDate(dateText) {
  const eventDate = parseDate(dateText);
  if (Number.isNaN(eventDate.getTime())) return false;
  return eventDate <= startOfToday();
}

/**
 * SQL predicate: keep rows with empty/unparseable dates, or dates within lookback.
 * lookback e.g. '18 months' / '5 years'.
 */
function eventDateWithinLookbackSql(alias = "e", lookback = SCHEDULE_LOOKBACK) {
  return `(
    NULLIF(trim(${alias}.event_date_text), '') IS NULL
    OR ${alias}.event_date_text !~ '^[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{4}\\.?$'
    OR to_date(regexp_replace(trim(${alias}.event_date_text), '\\.+$', ''), 'DD.MM.YYYY')
         >= (CURRENT_DATE - INTERVAL '${lookback}')
  )`;
}

async function getBandEventsForUser(bandId, userId) {
  const result = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.maps_url, e.note,
            COALESCE(f.price_eur, 0) AS price_eur,
            COALESCE(f.transport_rsd, 0) AS transport_rsd
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f
       ON f.event_id = e.id AND f.user_id = :userId
     WHERE e.band_id = :bandId
       AND ${eventDateWithinLookbackSql("e", SCHEDULE_LOOKBACK)}
       AND (
         bm.member_role IS DISTINCT FROM 'saradnik'
         OR EXISTS (
           SELECT 1 FROM event_assignees ea
           WHERE ea.event_id = e.id AND ea.user_id = :userId
         )
       )
     ORDER BY e.sort_order, e.id`,
    { bandId, userId },
  );
  return result.rows.map(mapEventRow);
}

async function getAllScheduleEventsForUser(userId) {
  const result = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.maps_url, e.note,
            COALESCE(f.price_eur, 0) AS price_eur,
            COALESCE(f.transport_rsd, 0) AS transport_rsd
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f
       ON f.event_id = e.id AND f.user_id = :userId
     WHERE ${eventDateWithinLookbackSql("e", SCHEDULE_LOOKBACK)}
       AND (
         bm.member_role IS DISTINCT FROM 'saradnik'
         OR EXISTS (
           SELECT 1 FROM event_assignees ea
           WHERE ea.event_id = e.id AND ea.user_id = :userId
         )
       )
     ORDER BY e.sort_order, e.id`,
    { userId },
  );
  return result.rows.map(mapEventRow);
}

async function getMyFinanceEvents(userId) {
  const result = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.maps_url, e.note,
            COALESCE(f.price_eur, 0) AS price_eur,
            COALESCE(f.transport_rsd, 0) AS transport_rsd
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f
       ON f.event_id = e.id AND f.user_id = :userId
     WHERE ${eventDateWithinLookbackSql("e", FINANCE_LOOKBACK)}
       AND (
         bm.member_role IS DISTINCT FROM 'saradnik'
         OR EXISTS (
           SELECT 1 FROM event_assignees ea
           WHERE ea.event_id = e.id AND ea.user_id = :userId
         )
       )
       AND (
         f.user_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM event_expenses x
           WHERE x.event_id = e.id AND x.payee_kind = 'member' AND x.payee_user_id = :userId
         )
       )
     ORDER BY e.sort_order, e.id`,
    { userId },
  );

  if (!result.rows.length) return [];

  const eventIds = result.rows.map((row) => row.id);
  const expensesResult = await query(
    `SELECT x.id, x.event_id, x.amount, x.currency, x.description, x.payee_kind, x.payee_user_id,
            CASE
              WHEN x.payee_kind = 'band' THEN 'Bend'
              WHEN x.payee_kind = 'external' THEN 'Spoljnji'
              ELSE COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Član')
            END AS payee_name
     FROM event_expenses x
     LEFT JOIN profiles p ON p.id = x.payee_user_id
     WHERE x.event_id = ANY(:eventIds::int[])
     ORDER BY x.event_id, x.id`,
    { eventIds },
  );

  const expensesByEvent = new Map();
  for (const row of expensesResult.rows) {
    const list = expensesByEvent.get(row.event_id) || [];
    list.push({
      id: row.id,
      amount: Number(row.amount) || 0,
      currency: row.currency || "EUR",
      description: row.description || "",
      payeeKind: row.payee_kind,
      payeeUserId: row.payee_user_id || null,
      payeeName: row.payee_name || null,
    });
    expensesByEvent.set(row.event_id, list);
  }

  return result.rows.map((row) => ({
    ...mapEventRow(row),
    bandName: row.band_name,
    expenseItems: expensesByEvent.get(row.id) || [],
  }));
}

async function getMyPayments(userId) {
  const result = await query(
    `SELECT id, band_id, payment_date_text, amount, currency
     FROM payments
     WHERE user_id = :userId
       AND (
         NULLIF(trim(payment_date_text), '') IS NULL
         OR payment_date_text !~ '^[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{4}\\.?$'
         OR to_date(regexp_replace(trim(payment_date_text), '\\.+$', ''), 'DD.MM.YYYY')
              >= (CURRENT_DATE - INTERVAL '${FINANCE_LOOKBACK}')
       )
     ORDER BY sort_order, id`,
    { userId },
  );
  return result.rows.map((row) => ({
    id: row.id,
    bandId: row.band_id,
    date: row.payment_date_text,
    amount: Number(row.amount),
    currency: row.currency,
  }));
}

async function getBandMeta(bandId) {
  const result = await query(`SELECT id, name, kind FROM bands WHERE id = :bandId LIMIT 1`, { bandId });
  return result.rows[0] || null;
}

async function getBandFinanceEvents(bandId) {
  const eventsResult = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.maps_url, e.note
     FROM events e
     JOIN bands b ON b.id = e.band_id
     WHERE e.band_id = :bandId
       AND ${eventDateWithinLookbackSql("e", FINANCE_LOOKBACK)}
     ORDER BY e.sort_order, e.id`,
    { bandId },
  );

  if (!eventsResult.rows.length) return [];

  const financeResult = await query(
    `SELECT f.event_id, f.user_id, f.price_eur, f.transport_rsd,
            COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Clan') AS member_name
     FROM event_member_finance f
     JOIN profiles p ON p.id = f.user_id
     WHERE f.event_id IN (
       SELECT e.id FROM events e
       WHERE e.band_id = :bandId
         AND ${eventDateWithinLookbackSql("e", FINANCE_LOOKBACK)}
     )
     ORDER BY f.event_id, member_name`,
    { bandId },
  );

  const expensesResult = await query(
    `SELECT x.id, x.event_id, x.amount, x.currency, x.description, x.payee_kind, x.payee_user_id,
            CASE
              WHEN x.payee_kind = 'band' THEN 'Bend'
              WHEN x.payee_kind = 'external' THEN 'Spoljnji'
              ELSE COALESCE(NULLIF(p.display_name, ''), NULLIF(p.email, ''), 'Član')
            END AS payee_name
     FROM event_expenses x
     LEFT JOIN profiles p ON p.id = x.payee_user_id
     WHERE x.event_id IN (
       SELECT e.id FROM events e
       WHERE e.band_id = :bandId
         AND ${eventDateWithinLookbackSql("e", FINANCE_LOOKBACK)}
     )
     ORDER BY x.event_id, x.id`,
    { bandId },
  );

  const wagesByEvent = new Map();
  for (const row of financeResult.rows) {
    const list = wagesByEvent.get(row.event_id) || [];
    list.push({
      id: row.user_id,
      name: row.member_name,
      priceEur: Number(row.price_eur),
      transportRsd: Number(row.transport_rsd),
    });
    wagesByEvent.set(row.event_id, list);
  }

  const expensesByEvent = new Map();
  for (const row of expensesResult.rows) {
    const list = expensesByEvent.get(row.event_id) || [];
    list.push({
      id: row.id,
      amount: Number(row.amount) || 0,
      currency: row.currency || "EUR",
      description: row.description || "",
      payeeKind: row.payee_kind,
      payeeUserId: row.payee_user_id || null,
      payeeName: row.payee_name || null,
    });
    expensesByEvent.set(row.event_id, list);
  }

  return eventsResult.rows.map((row) => {
    const memberWages = wagesByEvent.get(row.id) || [];
    const priceEur = memberWages.reduce((sum, member) => sum + Number(member.priceEur || 0), 0);
    const transportRsd = memberWages.reduce((sum, member) => sum + Number(member.transportRsd || 0), 0);
    return {
      id: row.id,
      bandId: row.band_id,
      bandName: row.band_name,
      date: row.event_date_text,
      city: row.city,
      venue: row.venue,
      mapsUrl: row.maps_url || "",
      note: row.note,
      priceEur,
      transportRsd,
      memberWages: memberWages.map(({ id, name, priceEur: wage }) => ({ id, name, priceEur: wage })),
      expenseItems: expensesByEvent.get(row.id) || [],
    };
  });
}

async function getBandPayments(bandId) {
  const result = await query(
    `SELECT id, band_id, payment_date_text, amount, currency
     FROM payments
     WHERE band_id = :bandId
       AND (
         NULLIF(trim(payment_date_text), '') IS NULL
         OR payment_date_text !~ '^[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{4}\\.?$'
         OR to_date(regexp_replace(trim(payment_date_text), '\\.+$', ''), 'DD.MM.YYYY')
              >= (CURRENT_DATE - INTERVAL '${FINANCE_LOOKBACK}')
       )
     ORDER BY sort_order, id`,
    { bandId },
  );
  return result.rows.map((row) => ({
    id: row.id,
    bandId: row.band_id || bandId,
    date: row.payment_date_text,
    amount: Number(row.amount),
    currency: row.currency,
  }));
}

async function upsertMemberFinance(eventId, userId, priceEur, transportRsd, options = {}) {
  const runQuery = options.runQuery || query;
  const beforeResult = await runQuery(
    `SELECT event_id, user_id, price_eur, transport_rsd
     FROM event_member_finance
     WHERE event_id = :eventId AND user_id = :userId
     LIMIT 1`,
    { eventId, userId },
  );
  const before = snapshotMemberFinance(beforeResult.rows[0]);

  const result = await runQuery(
    `INSERT INTO event_member_finance (event_id, user_id, price_eur, transport_rsd)
     VALUES (:eventId, :userId, :priceEur, :transportRsd)
     ON CONFLICT (event_id, user_id) DO UPDATE
       SET price_eur = EXCLUDED.price_eur,
           transport_rsd = EXCLUDED.transport_rsd,
           updated_at = NOW()
     RETURNING event_id, user_id, price_eur, transport_rsd`,
    { eventId, userId, priceEur, transportRsd },
  );
  const after = snapshotMemberFinance(result.rows[0]);
  const unchanged =
    before &&
    after &&
    before.priceEur === after.priceEur &&
    before.transportRsd === after.transportRsd;
  if (unchanged) return;

  await writeAudit(
    {
      entityType: "event_member_finance",
      entityId: `${eventId}:${userId}`,
      bandId: options.bandId || null,
      actorUserId: options.actorUserId || userId,
      action: before ? "update" : "insert",
      before,
      after,
    },
    runQuery,
  );

  if (options.bandId && options.notify !== false) {
    const who = await actorLabel(options.actorUserId || userId);
    await notifyBandEvent({
      bandId: options.bandId,
      type: "finance_changed",
      actorUserId: options.actorUserId || userId,
      audience: "finance",
      eventId,
      subjectUserId: userId,
      message: before
        ? `${who} je ažurirao/la honorar`
        : `${who} je postavio/la honorar`,
      payload: { page: "schedule", eventId: String(eventId), bandId: options.bandId },
    });
  }
}

async function getBandName(bandId) {
  if (!bandId) return "";
  const result = await query(`SELECT name FROM bands WHERE id = :bandId LIMIT 1`, { bandId });
  return result.rows[0]?.name || "";
}

function mapEventRow(row) {
  return {
    id: row.id,
    bandId: row.band_id,
    bandName: row.band_name || undefined,
    date: row.event_date_text,
    city: row.city,
    venue: row.venue,
    mapsUrl: row.maps_url || "",
    note: row.note,
    priceEur: Number(row.price_eur),
    transportRsd: Number(row.transport_rsd),
  };
}

function mapDayDetailsRow(row) {
  const duration = row.soundcheck_duration_min;
  return {
    gatheringTime: row.gathering_time || "",
    departureTime: row.departure_time || "",
    lodgingArrivalTime: row.lodging_arrival_time || "",
    loadInTime: row.load_in_time || "",
    setUpTime: row.set_up_time || "",
    soundcheckTime: row.soundcheck_time || "",
    soundcheckDurationMin:
      duration == null || duration === "" ? null : Number(duration),
    showStartTime: row.show_start_time || "",
    showEndTime: row.show_end_time || "",
    curfewTime: row.curfew_time || "",
    leaveTime: row.leave_time || "",
  };
}

function normalizeTimeText(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDayDetails(value) {
  const durationRaw = value.soundcheckDurationMin;
  let soundcheckDurationMin = null;
  if (durationRaw !== null && durationRaw !== undefined && String(durationRaw).trim() !== "") {
    const parsed = Math.round(Number(String(durationRaw).replace(",", ".")));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 24 * 60) {
      soundcheckDurationMin = parsed;
    }
  }

  return {
    gatheringTime: normalizeTimeText(value.gatheringTime),
    departureTime: normalizeTimeText(value.departureTime),
    lodgingArrivalTime: normalizeTimeText(value.lodgingArrivalTime),
    loadInTime: normalizeTimeText(value.loadInTime),
    setUpTime: normalizeTimeText(value.setUpTime),
    soundcheckTime: normalizeTimeText(value.soundcheckTime),
    soundcheckDurationMin,
    showStartTime: normalizeTimeText(value.showStartTime),
    showEndTime: normalizeTimeText(value.showEndTime),
    curfewTime: normalizeTimeText(value.curfewTime),
    leaveTime: normalizeTimeText(value.leaveTime),
  };
}

function normalizeEvent(value) {
  return {
    date: String(value.date ?? ""),
    city: String(value.city ?? ""),
    venue: String(value.venue ?? "").slice(0, 255),
    mapsUrl: String(value.mapsUrl ?? value.maps_url ?? "").trim().slice(0, 2000),
    note: String(value.note ?? ""),
    priceEur: numberValue(value.priceEur),
    transportRsd: numberValue(value.transportRsd),
  };
}

function normalizePayment(value) {
  return {
    date: String(value.date ?? ""),
    amount: numberValue(value.amount),
    currency: value.currency === "RSD" ? "RSD" : "EUR",
  };
}

function numberValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

