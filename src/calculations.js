/** Fixed EUR→RSD used for all dates through LEGACY_RATE_THROUGH (inclusive). */
export const DEFAULT_RATE = 116.5;

/**
 * Last calendar day that always converts at DEFAULT_RATE (116.5).
 * From the next day onward, settings.exchangeRate (later: NBS) applies.
 */
export const LEGACY_RATE_THROUGH_TEXT = "20.07.2026.";

const POOL_EPS = 0.000001;

/** Calendar held + something to settle (fee and/or expenses). Not dospeo if total is 0. */
export function isFinanceDueRow(row) {
  if (row?.financeDue != null) return Boolean(row.financeDue);
  return Boolean(row?.done && row?.hasDate && numberValue(row?.totalEur) > POOL_EPS);
}

export function financeLineKey(eventId, lineKind, expenseKey = "") {
  return `${eventId}:${lineKind}:${expenseKey || ""}`;
}

export function expenseItemEur(item, rate) {
  const amount = numberValue(item?.amount);
  if (amount <= 0) return 0;
  const safeRate = rate > 0 ? rate : DEFAULT_RATE;
  return String(item?.currency || "EUR").toUpperCase() === "RSD" ? amount / safeRate : amount;
}

export function filterMyMemberExpenses(items, userId) {
  return (items || []).filter((item) => {
    if (String(item?.payeeKind || "").toLowerCase() !== "member") return false;
    if (!item.payeeUserId) return true;
    return userId && String(item.payeeUserId) === String(userId);
  });
}

/** Payable lines for one date — expenses first, then fee(s). */
export function buildFinanceLines(row, context = {}) {
  const bandMode = context.mode === "band";
  const userId = context.userId || "";
  const rate = row.rate || DEFAULT_RATE;
  const expenseLines = [];
  const feeLines = [];

  if (bandMode) {
    for (const item of row.expenseItems || financeExpenseItems(row)) {
      const totalEur = round(expenseItemEur(item, rate));
      if (totalEur <= 0) continue;
      expenseLines.push({
        lineKind: "expense",
        expenseKey: String(item.id),
        eventId: row.id,
        totalEur,
        label: item.description || "Trošak",
        item,
      });
    }
    for (const member of row.memberWages || []) {
      const totalEur = round(numberValue(member.priceEur));
      if (totalEur <= 0) continue;
      feeLines.push({
        lineKind: "fee",
        expenseKey: String(member.id || member.name || ""),
        eventId: row.id,
        totalEur,
        label: member.name || "Honorar",
        memberId: member.id,
      });
    }
    if (!feeLines.length && numberValue(row.priceEur) > 0) {
      feeLines.push({
        lineKind: "fee",
        expenseKey: "",
        eventId: row.id,
        totalEur: round(numberValue(row.priceEur)),
        label: "Honorar",
      });
    }
    return [...expenseLines, ...feeLines];
  }

  for (const item of filterMyMemberExpenses(financeExpenseItems(row), userId)) {
    const totalEur = round(expenseItemEur(item, rate));
    if (totalEur <= 0) continue;
    expenseLines.push({
      lineKind: "expense",
      expenseKey: String(item.id),
      eventId: row.id,
      totalEur,
      label: item.description || "Trošak",
      item,
    });
  }
  const feeEur = round(numberValue(row.priceEur));
  if (feeEur > 0) {
    feeLines.push({
      lineKind: "fee",
      expenseKey: "",
      eventId: row.id,
      totalEur: feeEur,
      label: "Honorar",
    });
  }
  return [...expenseLines, ...feeLines];
}

export function financeLineRemainingEur(line) {
  if (!line) return 0;
  if (line.lineClass === "paid") return 0;
  if (line.remainingEur != null) return Math.max(0, numberValue(line.remainingEur));
  if (line.lineClass === "partial") return Math.max(0, numberValue(line.totalEur) - numberValue(line.paidEur));
  return Math.max(0, numberValue(line.totalEur));
}

/** Spreadsheet model: pour total uplate oldest held gig first (one total per date). */
function applyEventLevelPaymentSettlement(rows, totalPaidEur) {
  let pool = Math.max(0, numberValue(totalPaidEur));
  const ordered = [...(rows || [])]
    .filter((row) => isFinanceDueRow(row))
    .sort(compareFinanceRows);

  for (const row of ordered) {
    const total = Math.max(0, numberValue(row.totalEur));
    if (total <= POOL_EPS) {
      row.paymentStatus = "";
      row.paymentClass = "none";
      continue;
    }
    if (pool >= total - POOL_EPS) {
      row.paymentStatus = "Plaćeno";
      row.paymentClass = "paid";
      pool = Math.max(0, pool - total);
      continue;
    }
    if (pool > POOL_EPS) {
      row.paymentStatus = round(total - pool);
      row.paymentClass = "partial";
      pool = 0;
      continue;
    }
    row.paymentStatus = round(total);
    row.paymentClass = "unpaid";
  }
}

/** Line badges within a gig: expenses first, then fee (display only). */
function applyLineDisplayFromEventSettlement(row) {
  const lines = row.financeLines || [];
  if (!lines.length) return;

  if (row.paymentClass === "paid") {
    for (const line of lines) {
      line.paidEur = line.totalEur;
      line.remainingEur = 0;
      line.lineClass = "paid";
    }
    return;
  }

  if (row.paymentClass === "unpaid") {
    for (const line of lines) {
      line.paidEur = 0;
      line.remainingEur = round(line.totalEur);
      line.lineClass = "unpaid";
    }
    return;
  }

  const rowTotal = numberValue(row.totalEur);
  const rowRemaining = numberValue(row.paymentStatus);
  let paidBudget = Math.max(0, rowTotal - rowRemaining);

  for (const line of lines) {
    const need = numberValue(line.totalEur);
    if (paidBudget >= need - POOL_EPS) {
      line.paidEur = need;
      line.remainingEur = 0;
      line.lineClass = "paid";
      paidBudget = Math.max(0, paidBudget - need);
      continue;
    }
    if (paidBudget > POOL_EPS) {
      line.paidEur = round(paidBudget);
      line.remainingEur = round(need - paidBudget);
      line.lineClass = "partial";
      paidBudget = 0;
      continue;
    }
    line.paidEur = 0;
    line.remainingEur = round(need);
    line.lineClass = "unpaid";
  }
}

export function flattenPaymentAllocations(payments) {
  const out = [];
  for (const payment of payments || []) {
    for (const row of payment.allocations || []) {
      out.push({
        paymentId: payment.id,
        eventId: row.eventId,
        amountEur: numberValue(row.amountEur),
        lineKind: row.lineKind || "event",
        expenseKey: row.expenseKey || "",
      });
    }
  }
  return out;
}

/** EUR value of a payment row, using snapshotted rate when present. */
export function paymentAmountEur(payment, settingsOrRate) {
  const amount = numberValue(payment?.amount);
  if (amount <= 0) return 0;
  const snapRate = numberValue(payment?.exchangeRate);
  const rate =
    snapRate > 0
      ? snapRate
      : rateForDate(payment?.date, settingsOrRate);
  const safeRate = rate > 0 ? rate : DEFAULT_RATE;
  return String(payment?.currency || "EUR").toUpperCase() === "RSD" ? amount / safeRate : amount;
}

/** Convert EUR target into payment currency using the live/snapshotted rate. */
export function eurToPaymentAmount(amountEur, currency, exchangeRate) {
  const eur = Math.max(0, numberValue(amountEur));
  const rate = positiveNumber(exchangeRate, DEFAULT_RATE);
  if (String(currency || "EUR").toUpperCase() === "RSD") return round(eur * rate);
  return round(eur);
}

export function financeRemainingEur(row) {
  if (!isFinanceDueRow(row)) return 0;
  if (row.paymentClass === "paid") return 0;
  if (row.paymentClass === "partial") return numberValue(row.paymentStatus);
  if (row.paymentClass === "unpaid") return numberValue(row.totalEur);
  return 0;
}

/** Bulk-pay preview: oldest open gig first (event totals, not line waterfall). */
export function simulateBulkPayAllocations(rows, amountEur) {
  let remaining = Math.max(0, numberValue(amountEur));
  const allocations = [];
  let fullyPaidCount = 0;
  let partialEventId = null;
  let partialPaidEur = 0;
  let partialOwedEur = 0;

  const ordered = [...(rows || [])]
    .filter((row) => isFinanceDueRow(row) && row.paymentClass !== "paid")
    .sort(compareFinanceRows);

  for (const row of ordered) {
    if (remaining <= POOL_EPS) break;
    const owed = financeRemainingEur(row);
    if (owed <= POOL_EPS) continue;

    if (remaining >= owed - POOL_EPS) {
      allocations.push({
        eventId: row.id,
        lineKind: "event",
        expenseKey: "",
        amountEur: round(owed),
      });
      remaining = Math.max(0, remaining - owed);
      fullyPaidCount += 1;
      continue;
    }

    allocations.push({
      eventId: row.id,
      lineKind: "event",
      expenseKey: "",
      amountEur: round(remaining),
    });
    partialEventId = row.id;
    partialPaidEur = round(remaining);
    partialOwedEur = round(owed);
    remaining = 0;
    break;
  }

  return {
    allocations,
    fullyPaidCount,
    partialEventId,
    partialPaidEur,
    partialOwedEur,
    partialLineKind: null,
    partialExpenseKey: "",
    unallocatedEur: round(remaining),
  };
}

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
 * Member/band ledger (spreadsheet model):
 * - Potražuje = sum(held gig totals) − sum(uplate in EUR).
 * - Row paid/partial/unpaid = oldest gig first (event totals), for UI only.
 * - Line breakdown within a gig = expenses then fee (display only).
 */
export function calculate(events, payments, settings, _allocationRows = null, financeContext = null) {
  const dynamicRate = positiveNumber(settings.exchangeRate, DEFAULT_RATE);
  const calculationDate = startOfToday();
  const ctx = financeContext || { mode: "member", userId: "" };

  let strictEur = 0;
  let strictDin = 0;
  let futureCount = 0;
  let unpaidCount = 0;
  let partialCount = 0;

  const enriched = (events || []).map((event, index) => {
    const parsedDate = parseDate(event.date);
    const hasDate = Boolean(String(event.date || "").trim()) && !Number.isNaN(parsedDate.getTime());
    const done = hasDate && isFinanceHeldDate(parsedDate, calculationDate);
    const priceEur = numberValue(event.priceEur);
    const rate = hasDate ? rateForDate(parsedDate, settings) : DEFAULT_RATE;
    const expenseItems = financeExpenseItems(event);
    const expenseEur = memberPayeeExpenseEur(expenseItems, rate);
    const totalEur = hasDate ? priceEur + expenseEur : 0;

    return {
      ...event,
      index,
      hasDate,
      parsedDate: hasDate ? parsedDate : new Date(Number.NaN),
      done,
      priceEur,
      expenseItems,
      expenseEur,
      rate,
      totalEur,
      financeLines: [],
      financeDue: false,
      paymentStatus: "",
      paymentClass: "future",
    };
  });

  for (const row of enriched) {
    if (!row.hasDate) continue;
    row.financeLines = buildFinanceLines(row, ctx);
    if (ctx.mode === "band" && row.financeLines.length) {
      row.totalEur = round(row.financeLines.reduce((sum, line) => sum + numberValue(line.totalEur), 0));
    }
    row.financeDue = row.done && numberValue(row.totalEur) > POOL_EPS;
    if (row.financeDue) {
      strictEur += row.totalEur;
      strictDin += memberPayeeExpenseRsd(row.expenseItems);
    } else if (!row.done) {
      futureCount += 1;
    }
  }

  const paidEur = totalPaymentsEur(payments, settings);
  applyEventLevelPaymentSettlement(enriched, paidEur);

  for (const row of enriched) {
    if (row.done && row.hasDate && !row.financeDue) {
      row.paymentStatus = "";
      row.paymentClass = "none";
    }
  }

  for (const row of enriched) {
    if (!isFinanceDueRow(row)) continue;
    applyLineDisplayFromEventSettlement(row);
    if (row.paymentClass === "partial") {
      partialCount += 1;
      unpaidCount += 1;
    } else if (row.paymentClass === "unpaid") {
      unpaidCount += 1;
    }
  }

  const rows = [...enriched].sort(compareFinanceRows);
  const paidDin = totalPaymentsDin(payments, settings);
  const heldEur = heldDatesEur(rows);
  const claimEur = Math.max(0, heldEur - paidEur);
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
    unpaidClaimEur: claimEur,
    heldEur,
    claimDin: Math.max(0, claimEur) * claimRate,
    unpaidCount,
    partialCount,
    futureCount,
    calculationDate,
  };
}

/** Expenses payable to a member (Isplata: meni / payee member), in EUR. */
export function memberPayeeExpenseEur(expenseItems, rate) {
  const safeRate = rate > 0 ? rate : DEFAULT_RATE;
  return (expenseItems || []).reduce((sum, item) => {
    if (String(item?.payeeKind || "").toLowerCase() !== "member") return sum;
    const amount = numberValue(item.amount);
    if (amount <= 0) return sum;
    return sum + (String(item.currency || "EUR").toUpperCase() === "RSD" ? amount / safeRate : amount);
  }, 0);
}

/** Member-payee expenses in RSD (for legacy din totals). */
export function memberPayeeExpenseRsd(expenseItems) {
  return (expenseItems || []).reduce((sum, item) => {
    if (String(item?.payeeKind || "").toLowerCase() !== "member") return sum;
    const amount = numberValue(item.amount);
    if (amount <= 0) return sum;
    return sum + (String(item.currency || "EUR").toUpperCase() === "RSD" ? amount : 0);
  }, 0);
}

/**
 * Ledger expense lines: real troškovi + legacy transport_rsd as “Prevoz” trošak.
 * Avoids double-count once prevoz is stored only in event_expenses.
 */
export function financeExpenseItems(event) {
  const items = Array.isArray(event?.expenseItems) ? [...event.expenseItems] : [];

  function hasPrevozExpense(userId = null) {
    return items.some((item) => {
      if (String(item?.payeeKind || "").toLowerCase() !== "member") return false;
      if (userId && item.payeeUserId && String(item.payeeUserId) !== String(userId)) return false;
      return String(item?.description || "").trim().toLowerCase() === "prevoz";
    });
  }

  function appendPrevoz(amountRsd, userId = null) {
    const amount = numberValue(amountRsd);
    if (amount <= 0 || hasPrevozExpense(userId)) return;
    items.push({
      id: `legacy-prevoz-${event?.id ?? "x"}-${userId || "self"}`,
      amount,
      currency: "RSD",
      description: "Prevoz",
      payeeKind: "member",
      payeeUserId: userId,
    });
  }

  const memberWages = Array.isArray(event?.memberWages) ? event.memberWages : [];
  if (memberWages.some((member) => numberValue(member?.transportRsd) > 0)) {
    for (const member of memberWages) {
      appendPrevoz(member.transportRsd, member.id);
    }
  } else {
    appendPrevoz(event?.transportRsd);
  }

  return items;
}

/** Sum of set amounts on held (past) dates. */
export function heldDatesEur(rows) {
  return (rows || []).reduce((sum, row) => {
    if (!isFinanceDueRow(row)) return sum;
    return sum + Math.max(0, numberValue(row.totalEur));
  }, 0);
}

/**
 * Sum row remainders after calculate() — equals claimEur on the full ledger.
 * Use on filtered rows for band/year Potražuje slices (parts add up).
 */
export function waterfallClaimEur(rows) {
  return (rows || []).reduce((sum, row) => {
    if (!isFinanceDueRow(row)) return sum;
    if (row.paymentClass === "paid") return sum;
    if (row.paymentClass === "partial") {
      return sum + Math.max(0, numberValue(row.paymentStatus));
    }
    if (row.paymentClass === "unpaid") {
      return sum + Math.max(0, numberValue(row.totalEur));
    }
    return sum;
  }, 0);
}

/** Potražuje = held done totals − all uplate (spreadsheet). Full ledger only. */
export function heldMinusPaidEur(rows, payments, settingsOrRate) {
  return Math.max(0, heldDatesEur(rows) - totalPaymentsEur(payments, settingsOrRate));
}

/** Prefer calculate().claimEur or waterfallClaimEur on calculated rows. */
export function unpaidClaimEur(rows, payments, settingsOrRate) {
  if (rows?.some((row) => row?.paymentClass)) return waterfallClaimEur(rows);
  if (payments) return heldMinusPaidEur(rows, payments, settingsOrRate);
  return waterfallClaimEur(rows);
}

/** Sum of set amounts on future (not yet held) dates — Očekivano. */
export function expectedFutureEur(rows) {
  return (rows || []).reduce((sum, row) => {
    if (!row?.hasDate || row.done) return sum;
    return sum + Math.max(0, numberValue(row.totalEur));
  }, 0);
}

export function totalPaymentsEur(payments, settingsOrRate) {
  return (payments || []).reduce((sum, payment) => sum + paymentAmountEur(payment, settingsOrRate), 0);
}

export function totalPaymentsDin(payments, settingsOrRate) {
  return (payments || []).reduce((sum, payment) => {
    const amount = numberValue(payment.amount);
    const snapRate = numberValue(payment.exchangeRate);
    const rate =
      snapRate > 0 ? snapRate : rateForDate(payment.date, settingsOrRate);
    const safeRate = rate > 0 ? rate : DEFAULT_RATE;
    return sum + (payment.currency === "RSD" ? amount : amount * safeRate);
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

/**
 * Finance dospeo (spreadsheet parity): gig counts from its calendar day onward.
 * Uses datum <= today — same as Excel done column for Potražuje / waterfall.
 */
export function isFinanceHeldDate(dateValue, today = startOfToday()) {
  const parsed = dateValue instanceof Date ? dateValue : parseDate(dateValue);
  const when = today instanceof Date ? today : startOfToday();
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= when.getTime();
}

/**
 * Edit lock — true from the calendar day after the gig date.
 * Same-day events stay editable until local midnight; finance may still count them as held.
 */
export function isPastEventDate(dateValue) {
  const parsed = dateValue instanceof Date ? dateValue : parseDate(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < startOfToday().getTime();
}

/**
 * Schedule list order: past/today closest first (today → older), future dates at the bottom
 * (nearest future first). Invalid dates sink to the end, stable by original index.
 */
export function compareScheduleProximity(a, b, { today = startOfToday(), invert = false } = {}) {
  const todayMs = today.getTime();
  const aParsed = a.parsedDate instanceof Date ? a.parsedDate : parseDate(a.date);
  const bParsed = b.parsedDate instanceof Date ? b.parsedDate : parseDate(b.date);
  const aOk = Boolean(a.hasDate ?? a.date) && !Number.isNaN(aParsed.getTime());
  const bOk = Boolean(b.hasDate ?? b.date) && !Number.isNaN(bParsed.getTime());

  if (!aOk && !bOk) return (a.index ?? 0) - (b.index ?? 0);
  if (!aOk) return 1;
  if (!bOk) return -1;

  const aMs = aParsed.getTime();
  const bMs = bParsed.getTime();
  const aFuture = aMs > todayMs;
  const bFuture = bMs > todayMs;

  if (aFuture !== bFuture) return aFuture ? 1 : -1;

  if (aFuture) {
    return invert ? bMs - aMs : aMs - bMs;
  }
  return invert ? aMs - bMs : bMs - aMs;
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
