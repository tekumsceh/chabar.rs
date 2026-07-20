/** Fixed EUR→RSD used for all dates through LEGACY_RATE_THROUGH (inclusive). */
export const DEFAULT_RATE = 116.5;

/**
 * Last calendar day that always converts at DEFAULT_RATE (116.5).
 * From the next day onward, settings.exchangeRate (later: NBS) applies.
 */
export const LEGACY_RATE_THROUGH_TEXT = "20.07.2026.";

const POOL_EPS = 0.000001;

export function legacyRateThroughDate() {
  return parseDate(LEGACY_RATE_THROUGH_TEXT);
}

/**
 * Pick conversion rate for a calendar date.
 * @param {Date|string} dateValue parsed Date or dd.mm.yyyy. text
 * @param {number|{exchangeRate?: unknown}} settingsOrRate
 */
export function rateForDate(dateValue, settingsOrRate) {
  const dynamic =
    typeof settingsOrRate === "number"
      ? positiveNumber(settingsOrRate, DEFAULT_RATE)
      : positiveNumber(settingsOrRate?.exchangeRate, DEFAULT_RATE);
  const when = dateValue instanceof Date ? dateValue : parseDate(dateValue);
  if (Number.isNaN(when.getTime())) return DEFAULT_RATE;
  return when.getTime() <= legacyRateThroughDate().getTime() ? DEFAULT_RATE : dynamic;
}

function compareFinanceRows(a, b) {
  const aTime = a.hasDate ? a.parsedDate.getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.hasDate ? b.parsedDate.getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id));
}

/**
 * Member/band ledger:
 * - Convert RSD legs with the rate for that calendar date (legacy 116.5 through cutoff).
 * - Apply the payment pool to dated-due gigs in calendar order (not band sort_order).
 * - Undated / invalid dates never earn and never consume the pool.
 */
export function calculate(events, payments, settings) {
  const dynamicRate = positiveNumber(settings.exchangeRate, DEFAULT_RATE);
  const asOfDate = parseDate(settings.asOfDate);
  const calculationDate = Number.isNaN(asOfDate.getTime()) ? startOfToday() : asOfDate;
  let paidPool = totalPaymentsEur(payments, settings);
  let strictEur = 0;
  let strictDin = 0;
  let futureCount = 0;
  let unpaidCount = 0;
  let partialCount = 0;

  const enriched = (events || []).map((event, index) => {
    const parsedDate = parseDate(event.date);
    const hasDate = Boolean(String(event.date || "").trim()) && !Number.isNaN(parsedDate.getTime());
    const done = hasDate && parsedDate.getTime() <= calculationDate.getTime();
    const priceEur = numberValue(event.priceEur);
    const transportRsd = numberValue(event.transportRsd);
    const rate = hasDate ? rateForDate(parsedDate, settings) : DEFAULT_RATE;
    const totalEur = hasDate ? priceEur + transportRsd / rate : 0;

    return {
      ...event,
      index,
      hasDate,
      parsedDate: hasDate ? parsedDate : new Date(Number.NaN),
      done,
      priceEur,
      transportRsd,
      rate,
      totalEur,
      paymentStatus: "",
      paymentClass: "future",
    };
  });

  // Waterfall must follow calendar order across bands.
  const allocationOrder = [...enriched].sort(compareFinanceRows);

  for (const row of allocationOrder) {
    if (!row.hasDate) continue;

    if (!row.done) {
      futureCount += 1;
      continue;
    }

    strictEur += row.totalEur;
    strictDin += row.transportRsd;

    if (row.totalEur <= paidPool + POOL_EPS) {
      row.paymentStatus = "Plaćeno";
      row.paymentClass = "paid";
      paidPool = Math.max(0, paidPool - row.totalEur);
    } else if (paidPool > POOL_EPS) {
      const remaining = row.totalEur - paidPool;
      row.paymentStatus = remaining;
      row.paymentClass = "partial";
      partialCount += 1;
      unpaidCount += 1;
      paidPool = 0;
    } else {
      row.paymentStatus = row.totalEur;
      row.paymentClass = "unpaid";
      unpaidCount += 1;
      paidPool = 0;
    }
  }

  const rows = [...enriched].sort(compareFinanceRows);
  const paidEur = totalPaymentsEur(payments, settings);
  const paidDin = totalPaymentsDin(payments, settings);
  const claimEur = strictEur - paidEur;
  const unpaidClaim = unpaidClaimEur(rows);
  const claimRate = rateForDate(calculationDate, settings);

  return {
    rows,
    rate: dynamicRate,
    legacyRate: DEFAULT_RATE,
    legacyThrough: LEGACY_RATE_THROUGH_TEXT,
    strictEur,
    strictDin,
    paidEur,
    paidDin,
    claimEur,
    /** Amount still owed to the member (never negative). Matches sum of unpaid/partial remainders. */
    unpaidClaimEur: unpaidClaim,
    claimDin: Math.max(0, claimEur) * claimRate,
    unpaidCount,
    partialCount,
    futureCount,
    calculationDate,
  };
}

/** Sum of unpaid + partial remainders on due rows (Potražuje). */
export function unpaidClaimEur(rows) {
  return (rows || []).reduce((sum, row) => {
    if (!row?.done) return sum;
    if (row.paymentClass !== "unpaid" && row.paymentClass !== "partial") return sum;
    return sum + numberValue(row.paymentStatus);
  }, 0);
}

export function totalPaymentsEur(payments, settingsOrRate) {
  return (payments || []).reduce((sum, payment) => {
    const amount = numberValue(payment.amount);
    const rate = rateForDate(payment.date, settingsOrRate);
    return sum + (payment.currency === "RSD" ? amount / rate : amount);
  }, 0);
}

export function totalPaymentsDin(payments, settingsOrRate) {
  return (payments || []).reduce((sum, payment) => {
    const amount = numberValue(payment.amount);
    const rate = rateForDate(payment.date, settingsOrRate);
    return sum + (payment.currency === "RSD" ? amount : amount * rate);
  }, 0);
}

export function parseDate(value) {
  const parts = String(value || "")
    .trim()
    .replaceAll(",", ".")
    .split(".")
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));

  if (parts.length < 3 || parts.some(Number.isNaN)) {
    return new Date(Number.NaN);
  }

  const [day, month, year] = parts;
  return new Date(year, month - 1, day);
}

export function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function todayText() {
  const now = new Date();
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}.`;
}

const MONTHS_SHORT_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function toIsoDate(value) {
  const parsed = parseDate(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** Compact list date: day + 3-letter month, no year. */
export function formatScheduleDateParts(value) {
  const parsed = parseDate(value);
  if (Number.isNaN(parsed.getTime())) {
    return { day: "—", month: "", dateTime: "" };
  }
  return {
    day: String(parsed.getDate()),
    month: MONTHS_SHORT_EN[parsed.getMonth()],
    dateTime: toIsoDate(value),
  };
}

export function fromIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}.${month}.${year}.`;
}

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function numberValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function positiveNumber(value, fallback) {
  const parsed = numberValue(value);
  return parsed > 0 ? parsed : fallback;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(round(value));
}

export function formatEur(value) {
  return `${formatNumber(value)} EUR`;
}

export function formatRsd(value) {
  return `${formatNumber(value)} RSD`;
}

export function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function nextFutureRow(rows) {
  return rows
    .filter((row) => row.hasDate && !row.done && !Number.isNaN(row.parsedDate.getTime()))
    .sort((a, b) => a.parsedDate - b.parsedDate)[0];
}

export function monthKey(row) {
  if (Number.isNaN(row.parsedDate.getTime())) return "Bez validnog datuma";
  return `${row.parsedDate.getFullYear()}-${pad(row.parsedDate.getMonth() + 1)}`;
}

export function sameMonth(first, second) {
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false;
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}
