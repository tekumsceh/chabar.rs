import { createClient } from "@supabase/supabase-js";
import * as jose from "jose";
import { query } from "./db.js";
import { logger } from "./logger.js";

const BAND_COLORS = [
  "#276ef1",
  "#0b875b",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0e7490",
  "#c2410c",
  "#4338ca",
  "#15803d",
  "#a21caf",
];

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET || "";

export function pickBandColor(seed = "", usedColors = []) {
  const used = new Set(
    (usedColors || []).map((color) => String(color || "").toLowerCase()).filter(Boolean),
  );
  const available = BAND_COLORS.filter((color) => !used.has(color.toLowerCase()));
  const pool = available.length ? available : BAND_COLORS;
  const text = String(seed || Date.now());
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}

async function getUsedBandColors() {
  const result = await query(`SELECT DISTINCT lower(color) AS color FROM bands WHERE color IS NOT NULL`);
  return result.rows.map((row) => row.color);
}

/** Ensure membership list never returns two bands with the same chip color. */
function uniquifyBandColors(bands) {
  const used = new Set();
  return bands.map((band) => {
    let color = String(band.color || "").toLowerCase();
    if (!color || used.has(color)) {
      color = pickBandColor(band.id || band.name, [...used]).toLowerCase();
    }
    used.add(color);
    return { ...band, color: BAND_COLORS.find((item) => item.toLowerCase() === color) || color };
  });
}

if (!supabaseUrl || !supabaseAnonKey) {
  logger.warn("SUPABASE_URL / SUPABASE_ANON_KEY missing — auth middleware will reject requests.");
}

const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const AUTH_CACHE_TTL_MS = 5 * 60_000;
const MEMBERSHIP_CACHE_TTL_MS = 60_000;
const authUserCache = new Map();
const membershipCache = new Map();

let jwks = null;
let hsSecret = null;

function getJwks() {
  if (!jwks && supabaseUrl) {
    jwks = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

function getHsSecret() {
  if (!hsSecret && jwtSecret) {
    hsSecret = new TextEncoder().encode(jwtSecret);
  }
  return hsSecret;
}

function userFromClaims(payload) {
  return {
    id: payload.sub,
    email: payload.email || "",
    user_metadata: payload.user_metadata || {},
    app_metadata: payload.app_metadata || {},
    role: payload.role,
  };
}

/** Verify JWT locally when possible — avoids a round-trip to Supabase Auth on every API call. */
async function verifyTokenLocally(token) {
  const header = jose.decodeProtectedHeader(token);

  if (header.alg?.startsWith("HS") && getHsSecret()) {
    const { payload } = await jose.jwtVerify(token, getHsSecret(), {
      algorithms: ["HS256", "HS384", "HS512"],
    });
    if (!payload?.sub) throw new Error("Invalid token claims");
    return userFromClaims(payload);
  }

  // Asymmetric keys (newer Supabase projects) via JWKS — one cached fetch, then local verify.
  try {
    const { payload } = await jose.jwtVerify(token, getJwks(), {
      algorithms: ["ES256", "RS256", "EdDSA"],
    });
    if (!payload?.sub) throw new Error("Invalid token claims");
    return userFromClaims(payload);
  } catch (jwksError) {
    if (getHsSecret()) {
      const { payload } = await jose.jwtVerify(token, getHsSecret(), {
        algorithms: ["HS256", "HS384", "HS512"],
      });
      if (!payload?.sub) throw new Error("Invalid token claims");
      return userFromClaims(payload);
    }
    throw jwksError;
  }
}

async function resolveUser(token) {
  const cached = authUserCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  let user = null;

  try {
    user = await verifyTokenLocally(token);
  } catch {
    // Fall back to Auth API if local verify isn't configured / JWKS unavailable.
    if (!supabase) {
      const err = new Error("Auth not configured");
      err.status = 500;
      throw err;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      authUserCache.delete(token);
      const err = new Error(error?.message || "Invalid token");
      err.status = 401;
      throw err;
    }
    user = data.user;
  }

  let expiresAt = Date.now() + AUTH_CACHE_TTL_MS;
  try {
    const payload = jose.decodeJwt(token);
    if (payload.exp) {
      expiresAt = Math.min(expiresAt, payload.exp * 1000 - 5_000);
    }
  } catch {
    // keep default TTL
  }

  authUserCache.set(token, { user, expiresAt });
  return user;
}

export async function requireAuth(req, res, next) {
  try {
    if (!supabaseUrl || (!supabase && !jwtSecret)) {
      return res.status(500).json({ error: "Auth not configured", detail: "Missing Supabase env keys" });
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      return res.status(401).json({ error: "Unauthorized", detail: "Missing access token" });
    }

    try {
      req.user = await resolveUser(token);
    } catch (authError) {
      return res.status(401).json({ error: "Unauthorized", detail: authError.message });
    }

    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export async function ensureProfileAndPersonalBand(user) {
  const email = (user.email || "").toLowerCase();
  const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || email.split("@")[0] || "User";
  const role = email === "tekumsceh@gmail.com" ? "superadmin" : "user";

  await query(
    `INSERT INTO profiles (id, email, display_name, role)
     VALUES (:id, :email, :displayName, :role)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), profiles.display_name),
           role = CASE
             WHEN lower(EXCLUDED.email) = 'tekumsceh@gmail.com' THEN 'superadmin'
             ELSE profiles.role
           END,
           updated_at = NOW()`,
    { id: user.id, email, displayName, role },
  );

  const existing = await query(
    `SELECT b.id, b.name, b.kind, bm.member_role
     FROM bands b
     JOIN band_members bm ON bm.band_id = b.id
     WHERE bm.user_id = :userId AND b.kind = 'personal'
     LIMIT 1`,
    { userId: user.id },
  );

  if (!existing.rows[0]) {
    const color = pickBandColor(`${user.id}:personal`, await getUsedBandColors());
    const created = await query(
      `INSERT INTO bands (name, kind, color, created_by)
       VALUES ('Personal', 'personal', :color, :userId)
       RETURNING id, name, kind, color`,
      { userId: user.id, color },
    );
    const band = created.rows[0];
    await query(
      `INSERT INTO band_members (band_id, user_id, member_role)
       VALUES (:bandId, :userId, 'owner')`,
      { bandId: band.id, userId: user.id },
    );
    await query(
      `INSERT INTO settings (band_id, setting_key, setting_value)
       VALUES
         (:bandId, 'exchangeRate', '116.5'),
         (:bandId, 'asOfDate', to_char(NOW(), 'DD.MM.YYYY.'))
       ON CONFLICT DO NOTHING`,
      { bandId: band.id },
    );
    membershipCache.clear();
  }
}

export async function getMemberships(userId) {
  const result = await query(
    `SELECT b.id, b.name, b.kind, b.color, bm.member_role
     FROM band_members bm
     JOIN bands b ON b.id = bm.band_id
     WHERE bm.user_id = :userId
     ORDER BY CASE WHEN b.kind = 'personal' THEN 0 ELSE 1 END, b.name`,
    { userId },
  );
  return uniquifyBandColors(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      color: row.color || pickBandColor(row.id),
      memberRole: row.member_role,
    })),
  );
}

export async function requireBandMember(req, res, next) {
  try {
    const bandId = req.headers["x-band-id"] || req.query.bandId || req.body?.bandId;
    if (!bandId) {
      return res.status(400).json({ error: "Missing band", detail: "X-Band-Id header required" });
    }

    const cacheKey = `${req.user.id}:${bandId}`;
    const cached = membershipCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      req.bandId = bandId;
      req.memberRole = cached.memberRole;
      return next();
    }

    const result = await query(
      `SELECT member_role
       FROM band_members
       WHERE band_id = :bandId AND user_id = :userId
       LIMIT 1`,
      { bandId, userId: req.user.id },
    );

    if (!result.rows[0]) {
      membershipCache.delete(cacheKey);
      return res.status(403).json({ error: "Forbidden", detail: "Not a member of this band" });
    }

    const memberRole = result.rows[0].member_role;
    membershipCache.set(cacheKey, { memberRole, expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS });
    req.bandId = bandId;
    req.memberRole = memberRole;
    next();
  } catch (error) {
    next(error);
  }
}

/** Owner or admin of the active band (must run after requireBandMember). */
export function requireBandAdmin(req, res, next) {
  if (req.memberRole === "owner" || req.memberRole === "admin") {
    return next();
  }
  return res.status(403).json({ error: "Forbidden", detail: "Band admin role required" });
}
