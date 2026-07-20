export const DEFAULT_RATE = 116.5;

export function calculate(events, payments, settings) {
  const rate = positiveNumber(settings.exchangeRate, DEFAULT_RATE);
  const asOfDate = parseDate(settings.asOfDate);
  const calculationDate = Number.isNaN(asOfDate.getTime()) ? startOfToday() : asOfDate;
  let paidPool = totalPaymentsEur(payments, rate);
  let strictEur = 0;
  let strictDin = 0;
  let futureCount = 0;
  let unpaidCount = 0;
  let partialCount = 0;

  const rows = events.map((event, index) => {
    const hasDate = Boolean(String(event.date || "").trim());
    const parsedDate = parseDate(event.date);
    const done = hasDate && !Number.isNaN(parsedDate.getTime()) && parsedDate <= calculationDate;
    const priceEur = numberValue(event.priceEur);
    const transportRsd = numberValue(event.transportRsd);
    const totalEur = hasDate ? priceEur + transportRsd / rate : 0;
    let paymentStatus = "";
    let paymentClass = "future";

    if (done) {
      strictEur += totalEur;
      strictDin += transportRsd;

      if (totalEur <= paidPool + 0.000001) {
        paymentStatus = "Plaćeno";
        paymentClass = "paid";
        paidPool -= totalEur;
      } else if (paidPool > 0) {
        paymentStatus = totalEur - paidPool;
        paymentClass = "partial";
        partialCount += 1;
        unpaidCount += 1;
        paidPool = 0;
      } else {
        paymentStatus = totalEur;
        paymentClass = "unpaid";
        unpaidCount += 1;
      }
    } else if (hasDate) {
      futureCount += 1;
    }

    return {
      ...event,
      index,
      hasDate,
      parsedDate,
      done,
      priceEur,
      transportRsd,
      totalEur,
      paymentStatus,
      paymentClass,
    };
  });

  const paidEur = totalPaymentsEur(payments, rate);
  const paidDin = totalPaymentsDin(payments, rate);
  const claimEur = strictEur - paidEur;

  return {
    rows,
    rate,
    strictEur,
    strictDin,
    paidEur,
    paidDin,
    claimEur,
    claimDin: claimEur * rate,
    unpaidCount,
    partialCount,
    futureCount,
    calculationDate,
  };
}

export function totalPaymentsEur(payments, rate) {
  return payments.reduce((sum, payment) => {
    const amount = numberValue(payment.amount);
    return sum + (payment.currency === "RSD" ? amount / rate : amount);
  }, 0);
}

export function totalPaymentsDin(payments, rate) {
  return payments.reduce((sum, payment) => {
    const amount = numberValue(payment.amount);
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
