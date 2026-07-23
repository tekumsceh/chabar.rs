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
import { isBandLead } from "../shared/roles.js";
import { parseDate, startOfToday } from "../src/calculations.js";

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
          (band_id, sort_order, event_date_text, city, venue, note, price_eur, transport_rsd)
         VALUES (
          :bandId,
          COALESCE((SELECT max_order + 1 FROM (
            SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM events WHERE band_id = :bandId
          ) AS t), 1),
          :date, :city, :venue, :note, :priceEur, :transportRsd
         )
         RETURNING id, band_id, event_date_text, city, venue, note, price_eur, transport_rsd`,
        { ...event, bandId: req.bandId },
      );
      const row = result.rows[0];
      const id = row.id;
      await upsertMemberFinance(id, req.user.id, event.priceEur, event.transportRsd, {
        bandId: req.bandId,
        actorUserId: req.user.id,
        runQuery: tx,
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
    res.status(201).json({ ...event, id: created.id, bandId: req.bandId });
  } catch (error) {
    next(error);
  }
});

app.put("/api/events/:id", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const existing = await query(
      `SELECT id, band_id, event_date_text, city, venue, note, price_eur, transport_rsd
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

    const updated = await withTransaction(async (tx) => {
      const result = await tx(
        `UPDATE events
         SET event_date_text = :date,
             city = :city,
             venue = :venue,
             note = :note,
             price_eur = :priceEur,
             transport_rsd = :transportRsd
         WHERE id = :id AND band_id = :bandId
         RETURNING id, band_id, event_date_text, city, venue, note, price_eur, transport_rsd`,
        { ...event, id: req.params.id, bandId: req.bandId },
      );
      if (!result.rowCount) {
        const err = new Error("Not found");
        err.status = 404;
        throw err;
      }
      await upsertMemberFinance(Number(req.params.id), req.user.id, event.priceEur, event.transportRsd, {
        bandId: req.bandId,
        actorUserId: req.user.id,
        runQuery: tx,
      });
      await writeAudit(
        {
          entityType: "event",
          entityId: req.params.id,
          bandId: req.bandId,
          actorUserId: req.user.id,
          action: "update",
          before: snapshotEvent(existingRow),
          after: snapshotEvent(result.rows[0]),
        },
        tx,
      );
      return result.rows[0];
    });

    const bandName = await getBandName(req.bandId);
    void syncEventUpsert({
      eventId: Number(req.params.id),
      bandId: req.bandId,
      event: { ...event, bandId: req.bandId },
      bandName,
      actorUserId: req.user.id,
    });
    res.json({ ...event, id: Number(req.params.id), bandId: req.bandId });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/events/:id", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const existing = await query(
      `SELECT id, band_id, event_date_text, city, venue, note, price_eur, transport_rsd
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

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/** Owner/lead: per-member fees for one date. Past dates allowed (settling after the gig). */
app.get("/api/events/:id/member-finance", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const result = await query(
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
      { eventId: req.params.id, bandId: req.bandId },
    );

    res.json({
      eventId: Number(req.params.id),
      bandId: req.bandId,
      members: result.rows.map((row) => ({
        id: row.user_id,
        name: row.display_name || row.email?.split("@")[0] || "Član",
        memberRole: row.member_role,
        priceEur: Number(row.price_eur) || 0,
        transportRsd: Number(row.transport_rsd) || 0,
        // TBD: per-member default fee storage + settings UI
        defaultPriceEur: null,
      })),
    });
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
        `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
        { id: eventId, bandId: req.bandId },
      );
      if (!event.rows[0]) {
        return res.status(404).json({ error: "Not found" });
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

app.get("/api/events/:id/expenses", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: req.params.id, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const [expensesResult, membersResult] = await Promise.all([
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
        { eventId: req.params.id, bandId: req.bandId },
      ),
      query(
        `SELECT bm.user_id, p.email, p.display_name
         FROM band_members bm
         JOIN profiles p ON p.id = bm.user_id
         WHERE bm.band_id = :bandId
         ORDER BY p.display_name, p.email`,
        { bandId: req.bandId },
      ),
    ]);

    res.json({
      eventId: Number(req.params.id),
      bandId: req.bandId,
      currencies: [...EXPENSE_CURRENCIES],
      members: membersResult.rows.map((row) => ({
        id: row.user_id,
        name: row.display_name || row.email?.split("@")[0] || "Član",
      })),
      expenses: expensesResult.rows.map(mapExpenseRow),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/:id/expenses", requireAuth, requireBandMember, requireBandAdmin, async (req, res, next) => {
  try {
    const eventId = Number(req.params.id);
    const event = await query(
      `SELECT id FROM events WHERE id = :id AND band_id = :bandId LIMIT 1`,
      { id: eventId, bandId: req.bandId },
    );
    if (!event.rows[0]) {
      return res.status(404).json({ error: "Not found" });
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
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.note,
            COALESCE(f.price_eur, 0) AS price_eur,
            COALESCE(f.transport_rsd, 0) AS transport_rsd
     FROM events e
     JOIN bands b ON b.id = e.band_id
     LEFT JOIN event_member_finance f
       ON f.event_id = e.id AND f.user_id = :userId
     WHERE e.band_id = :bandId
       AND ${eventDateWithinLookbackSql("e", SCHEDULE_LOOKBACK)}
     ORDER BY e.sort_order, e.id`,
    { bandId, userId },
  );
  return result.rows.map(mapEventRow);
}

async function getAllScheduleEventsForUser(userId) {
  const result = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.note,
            COALESCE(f.price_eur, 0) AS price_eur,
            COALESCE(f.transport_rsd, 0) AS transport_rsd
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f
       ON f.event_id = e.id AND f.user_id = :userId
     WHERE ${eventDateWithinLookbackSql("e", SCHEDULE_LOOKBACK)}
     ORDER BY e.sort_order, e.id`,
    { userId },
  );
  return result.rows.map(mapEventRow);
}

async function getMyFinanceEvents(userId) {
  const result = await query(
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.note,
            f.price_eur, f.transport_rsd
     FROM event_member_finance f
     JOIN events e ON e.id = f.event_id
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     WHERE f.user_id = :userId
       AND ${eventDateWithinLookbackSql("e", FINANCE_LOOKBACK)}
     ORDER BY e.sort_order, e.id`,
    { userId },
  );
  return result.rows.map((row) => ({
    ...mapEventRow(row),
    bandName: row.band_name,
  }));
}

async function getMyPayments(userId) {
  const result = await query(
    `SELECT id, payment_date_text, amount, currency
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
    `SELECT e.id, e.band_id, b.name AS band_name, e.event_date_text, e.city, e.venue, e.note
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
    `SELECT id, payment_date_text, amount, currency
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
    note: row.note,
    priceEur: Number(row.price_eur),
    transportRsd: Number(row.transport_rsd),
  };
}

function normalizeEvent(value) {
  return {
    date: String(value.date ?? ""),
    city: String(value.city ?? ""),
    venue: String(value.venue ?? ""),
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
