import {
  calculate,
  eurToPaymentAmount,
  expenseItemEur,
  financeLineRemainingEur,
  financeLineKey,
  financeRemainingEur,
  flattenPaymentAllocations,
  numberValue,
  positiveNumber,
  round,
  simulateBulkPayAllocations,
  todayText,
  DEFAULT_RATE,
} from "../src/calculations.js";
import { getEurRsdRate } from "./exchangeRate.js";
import { writeAudit, snapshotPayment } from "./audit.js";

export async function fetchAndPersistExchangeRate(userId, query, getPersonalSettings) {
  const rateResult = await getEurRsdRate({ force: true });
  const rate = positiveNumber(rateResult.rate, DEFAULT_RATE);
  const personalBand = await query(
    `SELECT b.id
     FROM bands b
     JOIN band_members m ON m.band_id = b.id AND m.user_id = :userId
     WHERE b.kind = 'personal'
     LIMIT 1`,
    { userId },
  );
  const bandId = personalBand.rows[0]?.id;
  if (bandId) {
    await query(
      `INSERT INTO settings (band_id, setting_key, setting_value)
       VALUES (:bandId, 'exchangeRate', :value)
       ON CONFLICT (band_id, setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value`,
      { bandId, value: String(rate) },
    );
  }
  const settings = await getPersonalSettings(userId);
  return { rate, settings: { ...settings, exchangeRate: rate } };
}

export function mapPaymentRow(row, allocations = []) {
  return {
    id: row.id,
    bandId: row.band_id,
    date: row.payment_date_text,
    amount: Number(row.amount),
    currency: row.currency,
    exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate),
    allocations: allocations.map((item) => ({
      eventId: item.event_id,
      amountEur: Number(item.amount_eur),
      lineKind: item.line_kind || "event",
      expenseKey: item.expense_key || "",
    })),
  };
}

export async function loadAllocationsForPayments(paymentIds, runQuery) {
  if (!paymentIds.length) return new Map();
  const result = await runQuery(
    `SELECT payment_id, event_id, amount_eur, line_kind, expense_key
     FROM payment_allocations
     WHERE payment_id = ANY(:ids::int[])`,
    { ids: paymentIds },
  );
  const byPayment = new Map();
  for (const row of result.rows) {
    const list = byPayment.get(row.payment_id) || [];
    list.push(row);
    byPayment.set(row.payment_id, list);
  }
  return byPayment;
}

export async function attachAllocationsToPayments(payments, runQuery) {
  const ids = payments.map((row) => row.id).filter(Boolean);
  const byPayment = await loadAllocationsForPayments(ids, runQuery);
  return payments.map((row) => mapPaymentRow(row, byPayment.get(row.id) || []));
}

function buildFinanceContext(events, payments, settings, financeContext) {
  const allocationRows = flattenPaymentAllocations(payments);
  const calc = calculate(events, payments, settings, allocationRows, financeContext);
  return { calc, allocationRows };
}

export async function createPaymentWithAllocations({
  tx,
  userId,
  bandId,
  amount,
  currency,
  exchangeRate,
  allocations,
  actorUserId,
}) {
  const created = await tx(
    `INSERT INTO payments (user_id, band_id, sort_order, payment_date_text, amount, currency, exchange_rate)
     VALUES (
       :userId,
       :bandId,
       COALESCE((SELECT max_order + 1 FROM (
         SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM payments WHERE band_id = :bandId
       ) AS t), 1),
       :date,
       :amount,
       :currency,
       :exchangeRate
     )
     RETURNING id, user_id, band_id, payment_date_text, amount, currency, exchange_rate`,
    {
      userId,
      bandId,
      date: todayText(),
      amount,
      currency,
      exchangeRate,
    },
  );
  const row = created.rows[0];
  const savedAllocations = [];

  for (const item of allocations) {
    const amountEur = Number(item.amountEur) || 0;
    if (amountEur <= 0 || !item.eventId) continue;
    const lineKind = item.lineKind || "event";
    const expenseKey = item.expenseKey || "";

    await tx(
      `INSERT INTO payment_allocations (payment_id, event_id, amount_eur, line_kind, expense_key)
       VALUES (:paymentId, :eventId, :amountEur, :lineKind, :expenseKey)
       ON CONFLICT (payment_id, event_id, line_kind, expense_key) DO UPDATE
       SET amount_eur = EXCLUDED.amount_eur`,
      { paymentId: row.id, eventId: item.eventId, amountEur, lineKind, expenseKey },
    );

    savedAllocations.push({ eventId: item.eventId, amountEur, lineKind, expenseKey });
  }

  await writeAudit(
    {
      entityType: "payment",
      entityId: row.id,
      bandId,
      actorUserId,
      action: "insert",
      before: null,
      after: {
        ...snapshotPayment(row),
        exchangeRate: Number(row.exchange_rate) || null,
        allocations: savedAllocations,
      },
    },
    tx,
  );

  return mapPaymentRow(
    row,
    savedAllocations.map((item) => ({
      event_id: item.eventId,
      amount_eur: item.amountEur,
      line_kind: item.lineKind,
      expense_key: item.expenseKey,
    })),
  );
}

function findFinanceLine(calcRows, eventId, lineKind, expenseKey = "") {
  const row = calcRows.find((item) => Number(item.id) === Number(eventId));
  if (!row) return null;
  return (row.financeLines || []).find(
    (line) =>
      line.lineKind === lineKind &&
      String(line.expenseKey || "") === String(expenseKey || ""),
  );
}

export function payLinePlan(events, payments, settings, eventId, lineKind, expenseKey, financeContext) {
  const { calc } = buildFinanceContext(events, payments, settings, financeContext);
  const line = findFinanceLine(calc.rows, eventId, lineKind, expenseKey);
  if (!line) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  const row = calc.rows.find((item) => Number(item.id) === Number(eventId));
  if (!row?.done) {
    const err = new Error("Budući termini se ne plaćaju.");
    err.status = 400;
    throw err;
  }
  const owedEur = financeLineRemainingEur(line);
  if (owedEur <= 0) {
    const err = new Error("Stavka je već plaćena.");
    err.status = 400;
    throw err;
  }
  return {
    owedEur,
    line,
    allocations: [
      {
        eventId: row.id,
        lineKind: line.lineKind,
        expenseKey: line.expenseKey || "",
        amountEur: owedEur,
      },
    ],
  };
}

/** Store payment in EUR or RSD; ledger allocations stay in EUR. */
export function resolvePaymentFromPlan({ owedEur, currency, exchangeRate, line }) {
  const rate = positiveNumber(exchangeRate, DEFAULT_RATE);
  const owed = Math.max(0, numberValue(owedEur));

  if (currency !== "RSD" && currency !== "EUR" && line?.lineKind === "expense" && line?.item) {
    const itemCurrency = String(line.item.currency || "EUR").toUpperCase();
    if (itemCurrency === "RSD") {
      const fullEur = expenseItemEur(line.item, rate);
      const nativeAmount = numberValue(line.item.amount);
      if (fullEur > 0 && owed >= fullEur - 0.009) {
        return { amount: round(nativeAmount), currency: "RSD" };
      }
      return { amount: eurToPaymentAmount(owed, "RSD", rate), currency: "RSD" };
    }
  }

  const paymentCurrency = currency === "RSD" ? "RSD" : "EUR";
  return {
    amount: eurToPaymentAmount(owed, paymentCurrency, rate),
    currency: paymentCurrency,
  };
}

export function payEventPlan(events, payments, settings, eventId, financeContext) {
  const { calc } = buildFinanceContext(events, payments, settings, financeContext);
  const row = calc.rows.find((item) => Number(item.id) === Number(eventId));
  if (!row) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  if (!row.done) {
    const err = new Error("Budući termini se ne plaćaju.");
    err.status = 400;
    throw err;
  }

  const allocations = [];
  let owedEur = 0;
  for (const line of row.financeLines || []) {
    const lineOwed = financeLineRemainingEur(line);
    if (lineOwed <= 0) continue;
    owedEur += lineOwed;
    allocations.push({
      eventId: row.id,
      lineKind: line.lineKind,
      expenseKey: line.expenseKey || "",
      amountEur: lineOwed,
    });
  }

  if (owedEur <= 0) {
    const err = new Error("Datum je već plaćen.");
    err.status = 400;
    throw err;
  }

  return { owedEur, allocations };
}

export function bulkPayPlan(events, payments, settings, amount, currency, exchangeRate, financeContext) {
  const { calc } = buildFinanceContext(events, payments, settings, financeContext);
  const amountEur =
    String(currency).toUpperCase() === "RSD"
      ? Number(amount) / positiveNumber(exchangeRate, DEFAULT_RATE)
      : Number(amount);
  if (amountEur <= 0) {
    const err = new Error("Unesi iznos uplate.");
    err.status = 400;
    throw err;
  }
  const plan = simulateBulkPayAllocations(calc.rows, amountEur);
  if (!plan.allocations.length) {
    const err = new Error("Nema neplaćenih stavki za ovu uplatu.");
    err.status = 400;
    throw err;
  }
  const allocatedEur = plan.allocations.reduce((sum, row) => sum + Number(row.amountEur), 0);
  const paymentAmount = eurToPaymentAmount(allocatedEur, currency, exchangeRate);
  return { ...plan, paymentAmount, amountEur: allocatedEur };
}

export function paymentSummaryText(plan) {
  const parts = [];
  if (plan.fullyPaidCount) {
    parts.push(`${plan.fullyPaidCount} datuma u potpunosti`);
  }
  if (plan.partialEventId) {
    parts.push(
      `poslednja stavka delimično (${plan.partialPaidEur} EUR od ${plan.partialOwedEur} EUR)`,
    );
  }
  if (plan.unallocatedEur > 0.009) {
    parts.push(`neiskorišćeno ${plan.unallocatedEur} EUR`);
  }
  return parts.join("; ") || "Uplata zabeležena";
}

export { financeLineKey };
