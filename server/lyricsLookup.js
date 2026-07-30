const LRCLIB_BASE = "https://lrclib.net";
const USER_AGENT = "Chabar/1.0 (https://chabar.rs; setlist-lyrics-lookup)";
const CACHE_TTL_MS = 10 * 60_000;
const MIN_LRCLIB_GAP_MS = 500;

const searchCache = new Map();
let lastLrcLibCallAt = 0;
let lrcLibQueue = Promise.resolve();

function pickPlainLyrics(row) {
  const text = String(row?.plainLyrics || "").trim();
  if (!text) return "";
  return text.replace(/\r\n/g, "\n");
}

function cacheKeyFor({ q, trackName, artistName }) {
  return [String(q || "").trim().toLowerCase(), String(trackName || "").trim().toLowerCase(), String(artistName || "").trim().toLowerCase()].join("|");
}

function readCache(key) {
  const entry = searchCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) searchCache.delete(key);
    return null;
  }
  return entry;
}

function writeCache(key, payload, ttlMs = CACHE_TTL_MS) {
  searchCache.set(key, { ...payload, expiresAt: Date.now() + ttlMs });
}

function fetchTimeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function callLrcLib(url) {
  let resolveQueued;
  const queued = new Promise((resolve) => {
    resolveQueued = resolve;
  });
  const previous = lrcLibQueue;
  lrcLibQueue = previous.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_LRCLIB_GAP_MS - (now - lastLrcLibCallAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastLrcLibCallAt = Date.now();
    resolveQueued();
  });
  await queued;

  return fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: fetchTimeoutSignal(12_000),
  });
}

function mapSearchRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map((row) => ({
    id: row.id,
    trackName: row.trackName || "",
    artistName: row.artistName || "",
    albumName: row.albumName || "",
    durationSec: row.duration == null ? null : Number(row.duration),
    instrumental: Boolean(row.instrumental),
    plainLyrics: pickPlainLyrics(row),
  }));
}

export async function searchCommunityLyrics({ q = "", trackName = "", artistName = "" } = {}) {
  const params = new URLSearchParams();
  const query = String(q || "").trim();
  const track = String(trackName || "").trim();
  const artist = String(artistName || "").trim();

  if (query) {
    params.set("q", query);
  } else if (track) {
    params.set("track_name", track);
    if (artist) params.set("artist_name", artist);
  } else {
    return { results: [], rateLimited: false, retryAfter: 0 };
  }

  const cacheKey = cacheKeyFor({ q: query, trackName: track, artistName: artist });
  const cached = readCache(cacheKey);
  if (cached) {
    return {
      results: cached.results || [],
      rateLimited: Boolean(cached.rateLimited),
      retryAfter: cached.retryAfter || 0,
    };
  }

  try {
    const response = await callLrcLib(`${LRCLIB_BASE}/api/search?${params}`);

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") || 30);
      writeCache(cacheKey, { results: [], rateLimited: true, retryAfter }, retryAfter * 1000);
      return { results: [], rateLimited: true, retryAfter };
    }

    if (!response.ok) {
      return { results: [], rateLimited: false, retryAfter: 0 };
    }

    const rows = await response.json();
    const results = mapSearchRows(rows);
    writeCache(cacheKey, { results, rateLimited: false, retryAfter: 0 });
    return { results, rateLimited: false, retryAfter: 0 };
  } catch {
    return { results: [], rateLimited: false, retryAfter: 0 };
  }
}

export async function getCommunityLyricsById(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }

  const cacheKey = `id:${numericId}`;
  const cached = readCache(cacheKey);
  if (cached?.row) return cached.row;

  try {
    const response = await callLrcLib(`${LRCLIB_BASE}/api/get/${numericId}`);
    if (!response.ok) {
      return null;
    }

    const row = await response.json();
    const mapped = {
      id: row.id,
      trackName: row.trackName || "",
      artistName: row.artistName || "",
      albumName: row.albumName || "",
      durationSec: row.duration == null ? null : Number(row.duration),
      instrumental: Boolean(row.instrumental),
      plainLyrics: pickPlainLyrics(row),
    };
    writeCache(cacheKey, { row: mapped });
    return mapped;
  } catch {
    return null;
  }
}
