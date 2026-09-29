/**
 * Read-only: freeze today's pool result into allocation lines (in memory)
 * and compare date status + Potražuje with a settlement that only reads those lines.
 * Does not write.
 */
import "dotenv/config";
import { pool, query } from "../server/db.js";
import {
  applyPoolSettlement,
  calculate,
  financeRemainingEur,
  formatEur,
  isFinanceDueRow,
  parseDate,
  totalPaymentsEur,
  waterfallClaimEur,
} from "../src/calculations.js";

function withinLookback(dateText) {
  const parsed = parseDate(dateText);
  if (!String(dateText || "").trim() || Number.isNaN(parsed.getTime())) return true;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  return parsed.getTime() >= cutoff.getTime();
}

async function settingsFor(userId) {
  const rows = await query(
    `SELECT s.setting_key, s.setting_value
     FROM settings s
     JOIN bands b ON b.id = s.band_id AND b.kind = 'personal'
     JOIN band_members bm ON bm.band_id = b.id AND bm.user_id = :userId`,
    { userId },
  );
  const settings = { exchangeRate: 116.5 };
  for (const row of rows.rows) {
    if (row.setting_key === "exchangeRate") settings.exchangeRate = Number(row.setting_value) || settings.exchangeRate;
  }
  return settings;
}

async function memberLedger(userId) {
  const events = await query(
    `SELECT e.id, e.band_id AS "bandId", e.event_date_text AS date,
            COALESCE(f.price_eur, 0) AS "priceEur", COALESCE(f.transport_rsd, 0) AS "transportRsd"
     FROM events e
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f ON f.event_id = e.id AND f.user_id = :userId
     WHERE bm.member_role IS DISTINCT FROM 'saradnik'
       AND (
         f.user_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM event_expenses x
           WHERE x.event_id = e.id AND x.payee_kind = 'member' AND x.payee_user_id = :userId
         )
       )`,
    { userId },
  );
  const visible = events.rows.filter((row) => withinLookback(row.date));
  const ids = visible.map((row) => row.id);
  const expensesByEvent = new Map();
  if (ids.length) {
    const ex = await query(
      `SELECT id, event_id, amount, currency, description, payee_kind, payee_user_id
       FROM event_expenses WHERE event_id = ANY(:ids::int[])`,
      { ids },
    );
    for (const row of ex.rows) {
      const list = expensesByEvent.get(row.event_id) || [];
      list.push({
        id: row.id,
        amount: Number(row.amount) || 0,
        currency: row.currency || "EUR",
        description: row.description || "",
        payeeKind: row.payee_kind,
        payeeUserId: row.payee_user_id || null,
      });
      expensesByEvent.set(row.event_id, list);
    }
  }
  const payments = await query(
    `SELECT id, band_id AS "bandId", payment_date_text AS date, amount, currency, exchange_rate AS "exchangeRate"
     FROM payments WHERE user_id = :userId ORDER BY sort_order, id`,
    { userId },
  );
  return {
    events: visible.map((row) => ({
      ...row,
      priceEur: Number(row.priceEur) || 0,
      transportRsd: Number(row.transportRsd) || 0,
      expenseItems: expensesByEvent.get(row.id) || [],
    })),
    payments: payments.rows
      .filter((row) => withinLookback(row.date))
      .map((row) => ({
        ...row,
        amount: Number(row.amount) || 0,
        exchangeRate: row.exchangeRate == null ? null : Number(row.exchangeRate),
        allocations: [],
      })),
  };
}

function remainder(row) {
  return financeRemainingEur(row);
}

function compareLedger(label, poolRows, storedRows) {
  const mismatches = [];
  const byId = new Map(storedRows.map((row) => [Number(row.id), row]));
  for (const row of poolRows) {
    if (!isFinanceDueRow(row)) continue;
    const other = byId.get(Number(row.id));
    const poolRem = remainder(row);
    const storedRem = other ? remainder(other) : null;
    const classDiff = !other || other.paymentClass !== row.paymentClass;
    const remDiff = storedRem == null || Math.abs(poolRem - storedRem) > 0.02;
    if (classDiff || remDiff) {
      mismatches.push(
        `${row.date} #${row.id} pool ${row.paymentClass} ${formatEur(poolRem)} | stored ${other?.paymentClass || "missing"} ${storedRem == null ? "—" : formatEur(storedRem)}`,
      );
    }
  }
  const poolClaim = waterfallClaimEur(poolRows);
  const storedClaim = waterfallClaimEur(storedRows);
  return { mismatches, poolClaim, storedClaim };
}

const users = await query(
  `SELECT DISTINCT user_id AS id FROM (
     SELECT user_id FROM payments
     UNION
     SELECT user_id FROM event_member_finance
   ) t WHERE user_id IS NOT NULL`,
);

let ledgers = 0;
let mismatchedLedgers = 0;
let classMismatches = 0;
const frozenByPayment = new Map();

for (const user of users.rows) {
  const settings = await settingsFor(user.id);
  const { events, payments } = await memberLedger(user.id);
  if (!events.length && !payments.length) continue;
  ledgers += 1;
  const ids = payments.map((row) => row.id);
  const storedLines = ids.length
    ? await query(
        `SELECT payment_id, event_id, amount_eur, line_kind, expense_key
         FROM payment_allocations WHERE payment_id = ANY(:ids::int[])`,
        { ids },
      )
    : { rows: [] };
  const withLines = payments.map((row) => ({
    ...row,
    allocations: storedLines.rows
      .filter((line) => Number(line.payment_id) === Number(row.id))
      .map((line) => ({
        eventId: line.event_id,
        amountEur: Number(line.amount_eur),
        lineKind: line.line_kind,
        expenseKey: line.expense_key || "",
      })),
  }));
  for (const payment of withLines) {
    const list = frozenByPayment.get(Number(payment.id)) || [];
    frozenByPayment.set(Number(payment.id), payment.allocations);
    list.push(...payment.allocations);
  }
  const stored = calculate(events, withLines, settings, null, { mode: "member", userId: user.id });
  const poolRows = stored.rows.map((row) => ({ ...row, paymentClass: "future", paymentStatus: "" }));
  applyPoolSettlement(poolRows, totalPaymentsEur(payments, settings));
  const { mismatches, poolClaim, storedClaim } = compareLedger(user.id, poolRows, stored.rows);
  const claimDiff = Math.abs(poolClaim - storedClaim) > 0.02;
  if (mismatches.length || claimDiff) {
    mismatchedLedgers += 1;
    classMismatches += mismatches.length;
    console.log(`\nuser ${user.id}`);
    console.log(`  pool ${formatEur(poolClaim)} | stored ${formatEur(storedClaim)} | payments ${payments.length} | lines ${lines.length}`);
    for (const line of mismatches.slice(0, 12)) console.log(`  ${line}`);
  }
}

const bands = await query(
  `SELECT id FROM bands WHERE kind = 'group'`,
);
let bandMismatch = 0;
for (const band of bands.rows) {
  const eventsResult = await query(
    `SELECT e.id, e.band_id AS "bandId", e.event_date_text AS date
     FROM events e WHERE e.band_id = :bandId`,
    { bandId: band.id },
  );
  const events = eventsResult.rows.filter((row) => withinLookback(row.date));
  if (!events.length) continue;
  const ids = events.map((row) => row.id);
  const finance = await query(
    `SELECT event_id, user_id, price_eur, transport_rsd
     FROM event_member_finance WHERE event_id = ANY(:ids::int[])`,
    { ids },
  );
  const expenses = await query(
    `SELECT id, event_id, amount, currency, description, payee_kind, payee_user_id
     FROM event_expenses WHERE event_id = ANY(:ids::int[])`,
    { ids },
  );
  const wagesByEvent = new Map();
  for (const row of finance.rows) {
    const list = wagesByEvent.get(row.event_id) || [];
    list.push({
      id: row.user_id,
      priceEur: Number(row.price_eur) || 0,
      transportRsd: Number(row.transport_rsd) || 0,
    });
    wagesByEvent.set(row.event_id, list);
  }
  const expensesByEvent = new Map();
  for (const row of expenses.rows) {
    const list = expensesByEvent.get(row.event_id) || [];
    list.push({
      id: row.id,
      amount: Number(row.amount) || 0,
      currency: row.currency || "EUR",
      description: row.description || "",
      payeeKind: row.payee_kind,
      payeeUserId: row.payee_user_id || null,
    });
    expensesByEvent.set(row.event_id, list);
  }
  const payRows = await query(
    `SELECT id, band_id AS "bandId", payment_date_text AS date, amount, currency, exchange_rate AS "exchangeRate"
     FROM payments WHERE band_id = :bandId ORDER BY sort_order, id`,
    { bandId: band.id },
  );
  const payments = payRows.rows
    .filter((row) => withinLookback(row.date))
    .map((row) => ({
      ...row,
      amount: Number(row.amount) || 0,
      exchangeRate: row.exchangeRate == null ? null : Number(row.exchangeRate),
      allocations: frozenByPayment.get(Number(row.id)) || [],
    }));
  const shaped = events.map((row) => {
    const memberWages = wagesByEvent.get(row.id) || [];
    return {
      ...row,
      priceEur: memberWages.reduce((sum, member) => sum + member.priceEur, 0),
      transportRsd: memberWages.reduce((sum, member) => sum + member.transportRsd, 0),
      memberWages,
      expenseItems: expensesByEvent.get(row.id) || [],
    };
  });
  const settings = { exchangeRate: 116.5 };
  const stored = calculate(shaped, payments, settings, null, { mode: "band", userId: "" });
  const poolRows = stored.rows.map((row) => ({ ...row, paymentClass: "future", paymentStatus: "" }));
  applyPoolSettlement(poolRows, totalPaymentsEur(payments, settings));
  const { mismatches, poolClaim, storedClaim } = compareLedger(band.id, poolRows, stored.rows);
  if (mismatches.length || Math.abs(poolClaim - storedClaim) > 0.02) {
    bandMismatch += 1;
    console.log(`\nband ${band.id}`);
    console.log(`  pool ${formatEur(poolClaim)} | stored ${formatEur(storedClaim)}`);
    for (const line of mismatches.slice(0, 8)) console.log(`  ${line}`);
  }
}

console.log("\n=== Member ledgers ===");
console.log("checked:", ledgers);
console.log("ledgers with a difference:", mismatchedLedgers);
console.log("date mismatches:", classMismatches);
console.log("group bands whose pool differs from the member freeze:", bandMismatch);

const existing = await query(`SELECT COUNT(*)::int AS n FROM payment_allocations`);
console.log("allocation rows stored:", existing.rows[0].n);

await pool.end();
process.exit(mismatchedLedgers ? 1 : 0);
