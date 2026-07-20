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
} from "./auth.js";
import { query, startPoolWarmer } from "./db.js";
import { logger } from "./logger.js";

const app = express();
const port = Number(process.env.API_PORT || 3001);
const host = process.env.API_HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  await query("SELECT 1");
  res.json({ ok: true, database: "supabase-postgres" });
});

app.post("/api/client-log", (req, res) => {
  const level = ["info", "warn", "error"].includes(req.body?.level) ? req.body.level : "info";
  const message = String(req.body?.message || "client log").slice(0, 500);
  logger[level](`[client] ${message}`, {
    detail: req.body?.detail ?? null,
    href: req.body?.href || "",
  });
  res.status(204).end();
});

app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    await ensureProfileAndPersonalBand(req.user);
    const profileResult = await query(
      `SELECT id, email, display_name, role FROM profiles WHERE id = :id`,
      { id: req.user.id },
    );
    const bands = await getMemberships(req.user.id);
    res.json({
      profile: {
        id: profileResult.rows[0].id,
        email: profileResult.rows[0].email,
        displayName: profileResult.rows[0].display_name,
        role: profileResult.rows[0].role,
      },
      bands,
    });
  } catch (error) {
    next(error);
  }
});

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

app.post("/api/events", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const event = normalizeEvent(req.body);
    const result = await query(
      `INSERT INTO events
        (band_id, sort_order, event_date_text, city, venue, note, price_eur, transport_rsd)
       VALUES (
        :bandId,
        COALESCE((SELECT max_order + 1 FROM (
          SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM events WHERE band_id = :bandId
        ) AS t), 1),
        :date, :city, :venue, :note, :priceEur, :transportRsd
       )
       RETURNING id`,
      { ...event, bandId: req.bandId },
    );
    const id = result.rows[0].id;
    await upsertMemberFinance(id, req.user.id, event.priceEur, event.transportRsd);
    res.status(201).json({ ...event, id, bandId: req.bandId });
  } catch (error) {
    next(error);
  }
});

app.put("/api/events/:id", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const event = normalizeEvent(req.body);
    const result = await query(
      `UPDATE events
       SET event_date_text = :date,
           city = :city,
           venue = :venue,
           note = :note,
           price_eur = :priceEur,
           transport_rsd = :transportRsd
       WHERE id = :id AND band_id = :bandId`,
      { ...event, id: req.params.id, bandId: req.bandId },
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Not found" });
    }
    await upsertMemberFinance(Number(req.params.id), req.user.id, event.priceEur, event.transportRsd);
    res.json({ ...event, id: Number(req.params.id), bandId: req.bandId });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/events/:id", requireAuth, requireBandMember, async (req, res, next) => {
  try {
    const result = await query("DELETE FROM events WHERE id = :id AND band_id = :bandId", {
      id: req.params.id,
      bandId: req.bandId,
    });
    if (!result.rowCount) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments", requireAuth, async (req, res, next) => {
  try {
    const payment = normalizePayment(req.body);
    const result = await query(
      `INSERT INTO payments (user_id, band_id, sort_order, payment_date_text, amount, currency)
       VALUES (
        :userId,
        :bandId,
        COALESCE((SELECT max_order + 1 FROM (
          SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM payments WHERE user_id = :userId
        ) AS t), 1),
        :date, :amount, :currency
       )
       RETURNING id`,
      {
        ...payment,
        userId: req.user.id,
        bandId: (await getPersonalBandId(req.user.id)) || null,
      },
    );
    res.status(201).json({ ...payment, id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/payments/:id", requireAuth, async (req, res, next) => {
  try {
    const payment = normalizePayment(req.body);
    const result = await query(
      `UPDATE payments
       SET payment_date_text = :date,
           amount = :amount,
           currency = :currency
       WHERE id = :id AND user_id = :userId`,
      { ...payment, id: req.params.id, userId: req.user.id },
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ ...payment, id: Number(req.params.id) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/payments/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query("DELETE FROM payments WHERE id = :id AND user_id = :userId", {
      id: req.params.id,
      userId: req.user.id,
    });
    if (!result.rowCount) {
      return res.status(404).json({ error: "Not found" });
    }
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
  res.status(500).json({
    error: "Server error",
    detail: error.message,
  });
});

app.listen(port, host, () => {
  logger.info(`IO Organize API running on http://${host}:${port}`);
  startPoolWarmer();
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
       SELECT e.id FROM events e WHERE e.band_id = :bandId
     )
     ORDER BY f.event_id, member_name`,
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
      expenseItems: [],
    };
  });
}

async function getBandPayments(bandId) {
  const result = await query(
    `SELECT id, payment_date_text, amount, currency
     FROM payments
     WHERE band_id = :bandId
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

async function upsertMemberFinance(eventId, userId, priceEur, transportRsd) {
  await query(
    `INSERT INTO event_member_finance (event_id, user_id, price_eur, transport_rsd)
     VALUES (:eventId, :userId, :priceEur, :transportRsd)
     ON CONFLICT (event_id, user_id) DO UPDATE
       SET price_eur = EXCLUDED.price_eur,
           transport_rsd = EXCLUDED.transport_rsd,
           updated_at = NOW()`,
    { eventId, userId, priceEur, transportRsd },
  );
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
