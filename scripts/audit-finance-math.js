import "dotenv/config";
import { query, pool } from "../server/db.js";
import { attachAllocationsToPayments } from "../server/financePay.js";
import {
  calculate,
  heldDatesEur,
  heldMinusPaidEur,
  totalPaymentsEur,
  waterfallClaimEur,
  formatEur,
  startOfToday,
  todayText,
} from "../src/calculations.js";

const userId = process.env.AUDIT_USER_ID || "a6a994af-f962-4ad7-92cc-bde8eb67bc9a";

async function getSettings(userId) {
  const rows = await query(
    `SELECT s.setting_key, s.setting_value
     FROM settings s
     JOIN bands b ON b.id = s.band_id AND b.kind = 'personal'
     JOIN band_members bm ON bm.band_id = b.id AND bm.user_id = :userId`,
    { userId },
  );
  const settings = { exchangeRate: 116.5, asOfDate: todayText() };
  for (const row of rows.rows) {
    if (row.setting_key === "exchangeRate") settings.exchangeRate = Number(row.setting_value) || settings.exchangeRate;
    if (row.setting_key === "asOfDate") settings.asOfDate = row.setting_value || settings.asOfDate;
  }
  return settings;
}

async function loadMemberFinance(userId) {
  const events = await query(
    `SELECT e.id, e.band_id AS "bandId", b.name AS "bandName", e.event_date_text AS date,
            COALESCE(f.price_eur, 0) AS "priceEur", COALESCE(f.transport_rsd, 0) AS "transportRsd"
     FROM events e
     JOIN bands b ON b.id = e.band_id
     JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
     LEFT JOIN event_member_finance f ON f.event_id = e.id AND f.user_id = :userId
     WHERE (
       f.user_id IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM event_expenses x
         WHERE x.event_id = e.id AND x.payee_kind = 'member' AND x.payee_user_id = :userId
       )
     )
     ORDER BY e.event_date_text, e.id`,
    { userId },
  );

  const eventIds = events.rows.map((r) => r.id);
  const expensesByEvent = new Map();
  if (eventIds.length) {
    const ex = await query(
      `SELECT id, event_id, amount, currency, description, payee_kind, payee_user_id
       FROM event_expenses WHERE event_id = ANY(:ids::int[]) ORDER BY event_id, id`,
      { ids: eventIds },
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

  return events.rows.map((row) => ({
    ...row,
    priceEur: Number(row.priceEur) || 0,
    transportRsd: Number(row.transportRsd) || 0,
    expenseItems: expensesByEvent.get(row.id) || [],
  }));
}

async function loadPayments(userId) {
  const result = await query(
    `SELECT id, band_id, payment_date_text, amount, currency, exchange_rate
     FROM payments WHERE user_id = :userId ORDER BY sort_order, id`,
    { userId },
  );
  return attachAllocationsToPayments(result.rows, query);
}

const settings = await getSettings(userId);
const events = await loadMemberFinance(userId);
const payments = await loadPayments(userId);
const ctx = { mode: "member", userId };

const calc = calculate(events, payments, settings, null, ctx);
const heldRows = calc.rows.filter((r) => r.done && r.hasDate);
const futureRows = calc.rows.filter((r) => r.hasDate && !r.done);

const waterfall = waterfallClaimEur(heldRows);
const heldTotal = heldDatesEur(heldRows);
const paidTotal = totalPaymentsEur(payments, settings);
const naive = heldMinusPaidEur(heldRows, payments, settings);

console.log("=== Finance audit ===");
console.log("today:", todayText(), "user:", userId);
console.log("settings:", settings);
console.log("events in ledger:", calc.rows.length, "| held:", heldRows.length, "| future:", futureRows.length);
console.log("payments:", payments.length);
console.log("");
console.log("held dates total (EUR):     ", formatEur(heldTotal));
console.log("uplate total (EUR):         ", formatEur(paidTotal));
console.log("naive held − uplate:        ", formatEur(naive));
console.log("waterfall Potražuje:        ", formatEur(waterfall));
console.log("calc.claimEur:              ", formatEur(calc.claimEur));
console.log("delta naive vs waterfall:   ", formatEur(naive - waterfall));
console.log("");

const unallocatedPool = payments.reduce((sum, p) => {
  const total = totalPaymentsEur([p], settings);
  const alloc = (p.allocations || []).reduce((s, a) => s + Number(a.amountEur || 0), 0);
  const loose = Math.max(0, total - alloc);
  if (loose > 0.01) console.log(`  unallocated on payment #${p.id} (${p.date}): ${formatEur(loose)} of ${formatEur(total)}`);
  return sum + loose;
}, 0);
console.log("total unallocated payment EUR still in pool:", formatEur(unallocatedPool));
console.log("");

console.log("=== Held rows with money (newest first) ===");
const moneyRows = heldRows
  .filter((r) => r.totalEur > 0)
  .sort((a, b) => b.parsedDate - a.parsedDate);

for (const row of moneyRows.slice(0, 25)) {
  const rem =
    row.paymentClass === "paid"
      ? 0
      : row.paymentClass === "partial"
        ? row.paymentStatus
        : row.totalEur;
  console.log(
    `${row.date} | ${row.city || "—"} | ${row.bandName || ""} | total ${row.totalEur} | ${row.paymentClass} | rem ${rem}`,
  );
  for (const line of row.financeLines || []) {
    if (line.totalEur <= 0) continue;
    console.log(
      `    ${line.lineKind} ${line.label} ${line.totalEur} → ${line.lineClass} paid ${line.paidEur} rem ${line.remainingEur ?? "?"}`,
    );
  }
}

console.log("");
console.log("=== Status counts (held, totalEur>0) ===");
const counts = { paid: 0, partial: 0, unpaid: 0 };
for (const r of heldRows.filter((x) => x.totalEur > 0)) counts[r.paymentClass] = (counts[r.paymentClass] || 0) + 1;
console.log(counts);

console.log("");
console.log("=== Payments (newest first) ===");
for (const p of [...payments].reverse().slice(0, 15)) {
  const eur = totalPaymentsEur([p], settings);
  const allocSum = (p.allocations || []).reduce((s, a) => s + Number(a.amountEur || 0), 0);
  console.log(
    `#${p.id} ${p.date} ${p.amount} ${p.currency} (= ${formatEur(eur)}) | alloc ${formatEur(allocSum)} | ${(p.allocations || []).length} lines`,
  );
}

console.log("");
console.log("=== Integrity checks ===");
let totalMismatch = 0;
let lineClassMismatch = 0;
for (const row of heldRows) {
  const lineSum = (row.financeLines || []).reduce((s, l) => s + Number(l.totalEur || 0), 0);
  if (Math.abs(lineSum - row.totalEur) > 0.02) {
    totalMismatch += 1;
    console.log(`totalEur mismatch ${row.date} ${row.city}: row ${row.totalEur} vs lines ${lineSum.toFixed(2)} (${row.paymentClass})`);
  }
  for (const line of row.financeLines || []) {
    const rem = line.remainingEur != null ? line.remainingEur : line.totalEur - (line.paidEur || 0);
    if (line.lineClass !== "paid" && rem <= 0.01 && line.totalEur > 0) {
      lineClassMismatch += 1;
      console.log(`line should be paid ${row.date} ${line.label}: class=${line.lineClass} rem=${rem}`);
    }
  }
}
console.log(`totalEur mismatches: ${totalMismatch}, line class mismatches: ${lineClassMismatch}`);

console.log("");
console.log("=== Potražuje breakdown (unpaid/partial held rows) ===");
let claimSum = 0;
for (const row of heldRows.filter((r) => r.totalEur > 0 && r.paymentClass !== "paid").sort((a, b) => a.parsedDate - b.parsedDate)) {
  const rem = row.paymentClass === "partial" ? Number(row.paymentStatus) : row.totalEur;
  claimSum += rem;
  console.log(`${row.date} | ${row.city || "—"} | ${rem} EUR | ${row.paymentClass}`);
}
console.log("sum:", claimSum.toFixed(2), "EUR");

await pool.end();
