/**
 * RSD rates: NBS srednji kurs (scrape) → Google Finance backup.
 * EUR is required (finance math). USD is extra for the settings checker.
 * Cached in-process so Settings / finance don't hammer upstream.
 */

const NBS_MIDDLE_URL =
  "https://webappcenter.nbs.rs/ExchangeRateWebApp/ExchangeRate/CurrentMiddleRate";
const GOOGLE_FINANCE_QUOTE = "https://www.google.com/finance/quote";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sr-RS,sr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_RATE = 50;
const MAX_RATE = 250;
const RATE_CODES = ["EUR", "USD"];

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

function parseNbsAsOf(html) {
  const dateMatch =
    html.match(/([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})\.?\s*ГОДИНЕ/i) ||
    html.match(/FORMIRANA[^0-9]{0,40}([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i) ||
    html.match(/([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/);
  return dateMatch?.[1] || null;
}

function parseNbsCurrencyRow(html, code) {
  const re = new RegExp(
    `<tr>\\s*<td>\\s*${code}\\s*</td>\\s*<td>\\s*\\d+\\s*</td>\\s*<td>[^<]*</td>\\s*<td>\\s*[\\d.]+\\s*</td>\\s*<td>\\s*([\\d.,]+)\\s*</td>\\s*</tr>`,
    "i",
  );
  const row = html.match(re);
  if (!row) return NaN;
  return parseSrNumber(row[1]);
}

/** Parse NBS middle-rate table HTML for EUR and USD. */
export function parseNbsMiddleRates(html) {
  const asOf = parseNbsAsOf(html);
  const rates = {};
  for (const code of RATE_CODES) {
    const rate = parseNbsCurrencyRow(html, code);
    if (isPlausibleRate(rate)) rates[code] = roundRate(rate);
  }
  return { asOf, rates };
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

function quoteEntry(code, rate, source, sourceLabel, asOf, url) {
  return {
    rate: roundRate(rate),
    source,
    sourceLabel,
    asOf,
    url,
  };
}

/** Official NBS middle rates (srednji kurs) for EUR + USD. */
export async function fetchNbsRsdRates() {
  const html = await fetchHtml(NBS_MIDDLE_URL);
  const parsed = parseNbsMiddleRates(html);
  if (!parsed.rates.EUR) {
    throw new Error("NBS: EUR red nije pronađen");
  }

  const quotes = {};
  for (const code of RATE_CODES) {
    if (!parsed.rates[code]) continue;
    quotes[code] = quoteEntry(
      code,
      parsed.rates[code],
      "nbs",
      "NBS srednji kurs",
      parsed.asOf,
      NBS_MIDDLE_URL,
    );
  }
  return quotes;
}

function parseGoogleFinanceRate(html, code) {
  const label = `${code} / RSD`;
  const fromDs =
    html.match(new RegExp(`"${label}",\\s*3,\\s*null,\\s*\\[(\\d+\\.\\d+)`)) ||
    html.match(/AF_initDataCallback\(\{key:\s*'ds:2'[\s\S]{0,800}?\[(\d+\.\d+)\s*,/);
  return Number.parseFloat(fromDs?.[1] || "");
}

/** Google Finance {code}/RSD as backup market rate. */
export async function fetchGoogleRsdRate(code) {
  const url = `${GOOGLE_FINANCE_QUOTE}/${code}-RSD?hl=en`;
  const html = await fetchHtml(url);
  const rate = parseGoogleFinanceRate(html, code);
  if (!isPlausibleRate(rate)) {
    throw new Error(`Google Finance: ${code}/RSD nije pronađen`);
  }
  return quoteEntry(code, rate, "google", "Google Finance", null, url);
}

function toApiPayload(quotes, extra = {}) {
  const eur = quotes.EUR;
  const usd = quotes.USD || null;
  return {
    rate: eur.rate,
    usdRate: usd?.rate ?? null,
    source: eur.source,
    sourceLabel: eur.sourceLabel,
    asOf: eur.asOf,
    url: eur.url,
    usd: usd
      ? {
          rate: usd.rate,
          source: usd.source,
          sourceLabel: usd.sourceLabel,
          asOf: usd.asOf,
          url: usd.url,
        }
      : null,
    ...extra,
  };
}

/**
 * Prefer NBS for EUR+USD; fill missing pairs from Google Finance.
 * `rate` stays EUR/RSD for existing finance callers.
 * @param {{ force?: boolean }} [options]
 */
export async function getEurRsdRate(options = {}) {
  const force = Boolean(options.force);
  if (!force && cache && cache.expiresAt > Date.now()) {
    return { ...cache.value, cached: true };
  }

  const errors = [];
  let quotes = {};

  try {
    quotes = await fetchNbsRsdRates();
  } catch (error) {
    errors.push(`NBS: ${error.message}`);
  }

  for (const code of RATE_CODES) {
    if (quotes[code]) continue;
    try {
      quotes[code] = await fetchGoogleRsdRate(code);
    } catch (error) {
      errors.push(`Google ${code}: ${error.message}`);
    }
  }

  if (!quotes.EUR) {
    if (cache?.value) {
      return { ...cache.value, cached: true, stale: true, errors };
    }
    const err = new Error(errors.join(" · ") || "Kurs nije dostupan");
    err.errors = errors;
    throw err;
  }

  const value = toApiPayload(quotes, {
    cached: false,
    ...(errors.length ? { errors, fallbackFrom: quotes.EUR.source === "google" ? "nbs" : undefined } : {}),
  });
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}
