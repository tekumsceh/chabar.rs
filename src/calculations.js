/** Fixed EUR→RSD used for all dates through LEGACY_RATE_THROUGH (inclusive). */
export const DEFAULT_RATE = 116.5;

/**
 * Last calendar day that always converts at DEFAULT_RATE (116.5).
 * From the next day onward, settings.exchangeRate (later: NBS) applies.
 */
export const LEGACY_RATE_THROUGH_TEXT = "20.07.2026.";

const POOL_EPS = 0.000001;

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

function distributeLegacyEventAllocation(lines, amountEur) {
  let remaining = Math.max(0, numberValue(amountEur));
  for (const line of lines) {
    if (remaining <= POOL_EPS) break;
    const already = numberValue(line.directPaid);
    const need = Math.max(0, numberValue(line.totalEur) - already);
    if (need <= POOL_EPS) continue;
    const applied = Math.min(need, remaining);
    line.directPaid = already + applied;
    remaining -= applied;
  }
}

function settleFinanceLine(line, poolRef) {
  const direct = numberValue(line.directPaid);
  const need = Math.max(0, numberValue(line.totalEur) - direct);

  if (need <= POOL_EPS) {
    line.paidEur = line.totalEur;
    line.remainingEur = 0;
    line.lineClass = "paid";
    return;
  }

  if (poolRef.value >= need - POOL_EPS) {
    line.paidEur = line.totalEur;
    line.remainingEur = 0;
    line.lineClass = "paid";
    poolRef.value = Math.max(0, poolRef.value - need);
    return;
  }

  if (poolRef.value > POOL_EPS) {
    line.paidEur = round(direct + poolRef.value);
    line.remainingEur = round(need - poolRef.value);
    line.lineClass = "partial";
    poolRef.value = 0;
    return;
  }

  if (direct > POOL_EPS) {
    line.paidEur = round(direct);
    line.remainingEur = round(need);
    line.lineClass = "partial";
    return;
  }

  line.paidEur = 0;
  line.remainingEur = round(line.totalEur);
  line.lineClass = "unpaid";
}

function normalizeFinanceLine(line) {
  const total = numberValue(line.totalEur);
  const paid = numberValue(line.paidEur);
  const remaining = round(Math.max(0, total - paid));
  line.remainingEur = remaining;
  if (remaining <= POOL_EPS && total > POOL_EPS) {
    line.lineClass = "paid";
    line.paidEur = total;
    line.remainingEur = 0;
  }
}

function rollupRowPaymentStatus(row) {
  const lines = row.financeLines || [];
  if (!lines.length) {
    row.paymentStatus = row.totalEur;
    row.paymentClass = "unpaid";
    return;
  }

  const remaining = round(lines.reduce((sum, line) => sum + financeLineRemainingEur(line), 0));
  const allPaid = lines.every((line) => line.lineClass === "paid") || remaining <= POOL_EPS;
  const anyPaid = lines.some((line) => line.lineClass === "paid" || line.lineClass === "partial");

  if (allPaid) {
    row.paymentStatus = "Plaćeno";
    row.paymentClass = "paid";
    return;
  }

  if (anyPaid || remaining < row.totalEur - POOL_EPS) {
    row.paymentStatus = remaining;
    row.paymentClass = "partial";
    return;
  }

  row.paymentStatus = row.totalEur;
  row.paymentClass = "unpaid";
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
  if (!row?.done) return 0;
  if (row.paymentClass === "paid") return 0;
  if (row.paymentClass === "partial") return numberValue(row.paymentStatus);
  if (row.paymentClass === "unpaid") return numberValue(row.totalEur);
  return 0;
}

/** Oldest-unpaid-first; within each date expenses then fee (buildFinanceLines order). */
export function simulateBulkPayAllocations(rows, amountEur) {
  let remaining = Math.max(0, numberValue(amountEur));
  const allocations = [];
  let fullyPaidCount = 0;
  let partialEventId = null;
  let partialPaidEur = 0;
  let partialOwedEur = 0;
  let partialLineKind = null;
  let partialExpenseKey = "";

  const ordered = [...(rows || [])]
    .filter((row) => row.done && row.hasDate && row.paymentClass !== "paid")
    .sort(compareFinanceRows);

  for (const row of ordered) {
    if (remaining <= POOL_EPS) break;

    let hadUnpaid = false;
    let rowComplete = true;

    for (const line of row.financeLines || []) {
      const owed = financeLineRemainingEur(line);
      if (owed <= POOL_EPS) continue;
      hadUnpaid = true;

      if (remaining >= owed - POOL_EPS) {
        allocations.push({
          eventId: row.id,
          lineKind: line.lineKind,
          expenseKey: line.expenseKey || "",
          amountEur: round(owed),
        });
        remaining = Math.max(0, remaining - owed);
        continue;
      }

      allocations.push({
        eventId: row.id,
        lineKind: line.lineKind,
        expenseKey: line.expenseKey || "",
        amountEur: round(remaining),
      });
      partialEventId = row.id;
      partialPaidEur = round(remaining);
      partialOwedEur = round(owed);
      partialLineKind = line.lineKind;
      partialExpenseKey = line.expenseKey || "";
      remaining = 0;
      rowComplete = false;
      break;
    }

    if (partialEventId) break;
    if (hadUnpaid && rowComplete) fullyPaidCount += 1;
  }

  return {
    allocations,
    fullyPaidCount,
    partialEventId,
    partialPaidEur,
    partialOwedEur,
    partialLineKind,
    partialExpenseKey,
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
 * Member/band ledger:
 * - Honorar + troškovi “meni” (member-payee, incl. legacy prevoz) on each date.
 * - One personal uplate pool applied oldest-date-first; per date expenses then fee.
 * - Undated / invalid dates never earn and never consume the pool.
 */
export function calculate(events, payments, settings, allocationRows = null, financeContext = null) {
  const dynamicRate = positiveNumber(settings.exchangeRate, DEFAULT_RATE);
  // Held/dospeo = calendar today inclusive (not settings.asOfDate — that can lag).
  const calculationDate = startOfToday();
  const ctx = financeContext || { mode: "member", userId: "" };

  const allocations = Array.isArray(allocationRows)
    ? allocationRows
    : flattenPaymentAllocations(payments);

  const legacyByEvent = new Map();
  const directByLine = new Map();
  const allocatedByPayment = new Map();

  for (const row of allocations) {
    const eventId = row.eventId;
    const amountEur = numberValue(row.amountEur);
    if (!eventId || amountEur <= 0) continue;

    const lineKind = row.lineKind || "event";
    if (lineKind === "event") {
      legacyByEvent.set(eventId, (legacyByEvent.get(eventId) || 0) + amountEur);
    } else {
      const key = financeLineKey(eventId, lineKind, row.expenseKey || "");
      directByLine.set(key, (directByLine.get(key) || 0) + amountEur);
    }

    if (row.paymentId != null) {
      allocatedByPayment.set(
        row.paymentId,
        (allocatedByPayment.get(row.paymentId) || 0) + amountEur,
      );
    }
  }

  let paidPool = 0;
  for (const payment of payments || []) {
    const totalEur = paymentAmountEur(payment, settings);
    const allocated = allocatedByPayment.get(payment.id) || 0;
    paidPool += Math.max(0, totalEur - allocated);
  }

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
      paymentStatus: "",
      paymentClass: "future",
    };
  });

  const allocationOrder = [...enriched].sort(compareFinanceRows);
  const poolRef = { value: paidPool };

  for (const row of allocationOrder) {
    if (!row.hasDate) continue;

    if (!row.done) {
      futureCount += 1;
      row.financeLines = buildFinanceLines(row, ctx);
      if (ctx.mode === "band" && row.financeLines.length) {
        row.totalEur = round(row.financeLines.reduce((sum, line) => sum + numberValue(line.totalEur), 0));
      }
      continue;
    }

    strictEur += row.totalEur;
    strictDin += memberPayeeExpenseRsd(row.expenseItems);
    row.financeLines = buildFinanceLines(row, ctx).map((line) => ({
      ...line,
      directPaid: 0,
      paidEur: 0,
      remainingEur: line.totalEur,
      lineClass: "unpaid",
    }));

    if (ctx.mode === "band" && row.financeLines.length) {
      row.totalEur = round(row.financeLines.reduce((sum, line) => sum + numberValue(line.totalEur), 0));
    }

    const legacyAmount = legacyByEvent.get(row.id) || 0;
    if (legacyAmount > 0) {
      distributeLegacyEventAllocation(row.financeLines, legacyAmount);
    }

    for (const line of row.financeLines) {
      const key = financeLineKey(line.eventId, line.lineKind, line.expenseKey);
      const direct = directByLine.get(key) || 0;
      if (direct > 0) line.directPaid = numberValue(line.directPaid) + direct;
    }

    for (const line of row.financeLines) {
      settleFinanceLine(line, poolRef);
      normalizeFinanceLine(line);
    }

    rollupRowPaymentStatus(row);
    if (row.paymentClass === "partial") {
      partialCount += 1;
      unpaidCount += 1;
    } else if (row.paymentClass === "unpaid") {
      unpaidCount += 1;
    }
  }

  const rows = [...enriched].sort(compareFinanceRows);
  const paidEur = totalPaymentsEur(payments, settings);
  const paidDin = totalPaymentsDin(payments, settings);
  const unpaidClaim = waterfallClaimEur(rows);
  const claimEur = unpaidClaim;
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
    unpaidClaimEur: unpaidClaim,
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
    if (!row?.done || !row?.hasDate) return sum;
    return sum + Math.max(0, numberValue(row.totalEur));
  }, 0);
}

/**
 * Potražuje on filtered rows: sum unpaid/partial remainders after the global
 * payment waterfall (calculate). Safe per band / year / search — parts add up.
 */
export function waterfallClaimEur(rows) {
  return (rows || []).reduce((sum, row) => {
    if (!row?.done || !row?.hasDate) return sum;
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

/**
 * Simple held − uplate (only valid on the full unfiltered ledger).
 * Do not use for per-band or per-year Potražuje — use waterfallClaimEur on
 * rows from calculate() instead.
 */
export function heldMinusPaidEur(rows, payments, settingsOrRate) {
  return Math.max(0, heldDatesEur(rows) - totalPaymentsEur(payments, settingsOrRate));
}

/** @deprecated prefer waterfallClaimEur on calculate() rows */
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
