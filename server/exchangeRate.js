/**
 * EUR/RSD rate: NBS srednji kurs (scrape) → Google Finance backup.
 * Cached in-process so Settings / finance don't hammer upstream.
 */

const NBS_MIDDLE_URL =
  "https://webappcenter.nbs.rs/ExchangeRateWebApp/ExchangeRate/CurrentMiddleRate";
const GOOGLE_FINANCE_URL = "https://www.google.com/finance/quote/EUR-RSD?hl=en";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sr-RS,sr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_RATE = 50;
const MAX_RATE = 250;

let cache = null;

function parseSrNumber(raw) {
  const text = String(raw || "").trim().replace(/\s+/g, "");
  if (!text) return NaN;
  // NBS uses comma as decimal: 117,3700
  if (text.includes(",") && !text.includes(".")) {
    return Number.parseFloat(text.replace(",", "."));
  }
  // thousands.decimal or plain
  if (text.includes(",") && text.includes(".")) {
    return Number.parseFloat(text.replace(/,/g, ""));
  }
  return Number.parseFloat(text);
}

function isPlausibleRate(rate) {
  return Number.isFinite(rate) && rate >= MIN_RATE && rate <= MAX_RATE;
}

function roundRate(rate) {
  return Math.round((rate + Number.EPSILON) * 10000) / 10000;
}

async function fetchHtml(url, timeoutMs = 15000) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

/** Official NBS middle rate (srednji kurs) for EUR. */
export async function fetchNbsEurRsd() {
  const html = await fetchHtml(NBS_MIDDLE_URL);
  const row = html.match(
    /<tr>\s*<td>\s*EUR\s*<\/td>\s*<td>\s*\d+\s*<\/td>\s*<td>[^<]*<\/td>\s*<td>\s*([\d.]+)\s*<\/td>\s*<td>\s*([\d.,]+)\s*<\/td>\s*<\/tr>/i,
  );
  if (!row) {
    throw new Error("NBS: EUR red nije pronađen");
  }
  const rate = parseSrNumber(row[2]);
  if (!isPlausibleRate(rate)) {
    throw new Error(`NBS: neverovatan kurs ${row[2]}`);
  }

  const dateMatch =
    html.match(/([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})\.?\s*ГОДИНЕ/i) ||
    html.match(/FORMIRANA[^0-9]{0,40}([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i) ||
    html.match(/([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/);

  return {
    rate: roundRate(rate),
    source: "nbs",
    sourceLabel: "NBS srednji kurs",
    asOf: dateMatch?.[1] || null,
    url: NBS_MIDDLE_URL,
  };
}

/** Google Finance EUR/RSD as backup market rate. */
export async function fetchGoogleEurRsd() {
  const html = await fetchHtml(GOOGLE_FINANCE_URL);
  const fromDs =
    html.match(/"EUR \/ RSD",\s*3,\s*null,\s*\[(\d+\.\d+)/) ||
    html.match(/AF_initDataCallback\(\{key:\s*'ds:2'[\s\S]{0,800}?\[(\d+\.\d+)\s*,/);
  const rate = Number.parseFloat(fromDs?.[1] || "");
  if (!isPlausibleRate(rate)) {
    throw new Error("Google Finance: kurs nije pronađen");
  }
  return {
    rate: roundRate(rate),
    source: "google",
    sourceLabel: "Google Finance",
    asOf: null,
    url: GOOGLE_FINANCE_URL,
  };
}

/**
 * Prefer NBS; on failure use Google Finance.
 * @param {{ force?: boolean }} [options]
 */
export async function getEurRsdRate(options = {}) {
  const force = Boolean(options.force);
  if (!force && cache && cache.expiresAt > Date.now()) {
    return { ...cache.value, cached: true };
  }

  const errors = [];

  try {
    const value = await fetchNbsEurRsd();
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return { ...value, cached: false };
  } catch (error) {
    errors.push(`NBS: ${error.message}`);
  }

  try {
    const value = await fetchGoogleEurRsd();
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return { ...value, cached: false, fallbackFrom: "nbs", errors };
  } catch (error) {
    errors.push(`Google: ${error.message}`);
  }

  if (cache?.value) {
    return { ...cache.value, cached: true, stale: true, errors };
  }

  const err = new Error(errors.join(" · ") || "Kurs nije dostupan");
  err.errors = errors;
  throw err;
}
