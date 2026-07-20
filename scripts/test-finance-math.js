/**
 * Finance ledger invariants — run: npm run test:finance
 */
import assert from "node:assert/strict";
import {
  calculate,
  DEFAULT_RATE,
  rateForDate,
  unpaidClaimEur,
} from "../src/calculations.js";

const settings = { exchangeRate: 120, asOfDate: "20.07.2026." };

function approx(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("waterfall follows calendar date, not input order", () => {
  const events = [
    { id: 2, bandId: "B", date: "10.06.2026.", priceEur: 100, transportRsd: 0 },
    { id: 1, bandId: "A", date: "01.06.2026.", priceEur: 100, transportRsd: 0 },
  ];
  const payments = [{ date: "01.06.2026.", amount: 100, currency: "EUR" }];
  const result = calculate(events, payments, settings);
  const byId = Object.fromEntries(result.rows.map((row) => [row.id, row]));
  assert.equal(byId[1].paymentClass, "paid");
  assert.equal(byId[2].paymentClass, "unpaid");
  assert.equal(byId[2].paymentStatus, 100);
  approx(unpaidClaimEur(result.rows), 100);
  approx(result.unpaidClaimEur, Math.max(0, result.claimEur));
});

test("band filter claim uses full-ledger statuses (not a re-pool)", () => {
  const events = [
    { id: 1, bandId: "A", date: "01.06.2026.", priceEur: 100, transportRsd: 0 },
    { id: 2, bandId: "B", date: "02.06.2026.", priceEur: 200, transportRsd: 0 },
    { id: 3, bandId: "A", date: "03.06.2026.", priceEur: 50, transportRsd: 0 },
  ];
  const payments = [{ date: "01.06.2026.", amount: 150, currency: "EUR" }];
  const all = calculate(events, payments, settings);
  const bandA = all.rows.filter((row) => row.bandId === "A");
  const bandB = all.rows.filter((row) => row.bandId === "B");
  const empty = all.rows.filter((row) => row.bandId === "EMPTY");

  approx(unpaidClaimEur(bandA), 50);
  approx(unpaidClaimEur(bandB), 150);
  approx(unpaidClaimEur(empty), 0);
  approx(unpaidClaimEur(all.rows), 200);
  approx(all.unpaidClaimEur, Math.max(0, all.claimEur));
});

test("empty events with payments → Potražuje 0 (not negative dump)", () => {
  const result = calculate([], [{ date: "01.06.2026.", amount: 500, currency: "EUR" }], settings);
  approx(result.strictEur, 0);
  approx(result.paidEur, 500);
  approx(result.claimEur, -500);
  approx(result.unpaidClaimEur, 0);
  approx(unpaidClaimEur(result.rows), 0);
});

test("undated / invalid dates never earn or consume pool", () => {
  const events = [
    { id: 1, bandId: "A", date: "", priceEur: 999, transportRsd: 0 },
    { id: 2, bandId: "A", date: "not-a-date", priceEur: 999, transportRsd: 0 },
    { id: 3, bandId: "A", date: "01.06.2026.", priceEur: 100, transportRsd: 0 },
  ];
  const payments = [{ date: "01.06.2026.", amount: 100, currency: "EUR" }];
  const result = calculate(events, payments, settings);
  const byId = Object.fromEntries(result.rows.map((row) => [row.id, row]));
  assert.equal(byId[1].hasDate, false);
  assert.equal(byId[2].hasDate, false);
  assert.equal(byId[3].paymentClass, "paid");
  approx(result.strictEur, 100);
  approx(result.unpaidClaimEur, 0);
});

test("legacy rate 116.5 through 20.07.2026; dynamic after", () => {
  assert.equal(rateForDate("20.07.2026.", settings), DEFAULT_RATE);
  assert.equal(rateForDate("21.07.2026.", settings), 120);
  const events = [
    { id: 1, date: "20.07.2026.", priceEur: 0, transportRsd: 116.5 },
    { id: 2, date: "21.07.2026.", priceEur: 0, transportRsd: 120 },
  ];
  const result = calculate(events, [], { ...settings, asOfDate: "21.07.2026." });
  approx(result.rows[0].totalEur, 1);
  approx(result.rows[0].rate, DEFAULT_RATE);
  approx(result.rows[1].totalEur, 1);
  approx(result.rows[1].rate, 120);
});

test("RSD payments convert with payment-date rate", () => {
  const events = [{ id: 1, date: "01.06.2026.", priceEur: 1, transportRsd: 0 }];
  const payments = [{ date: "01.06.2026.", amount: 116.5, currency: "RSD" }];
  const result = calculate(events, payments, settings);
  approx(result.paidEur, 1);
  assert.equal(result.rows[0].paymentClass, "paid");
});

test("partial remainder + unpaid sum equals max(0, claim)", () => {
  const events = [
    { id: 1, date: "01.05.2026.", priceEur: 80, transportRsd: 0 },
    { id: 2, date: "02.05.2026.", priceEur: 80, transportRsd: 0 },
  ];
  const payments = [{ date: "01.05.2026.", amount: 100, currency: "EUR" }];
  const result = calculate(events, payments, settings);
  assert.equal(result.rows[0].paymentClass, "paid");
  assert.equal(result.rows[1].paymentClass, "partial");
  approx(numberish(result.rows[1].paymentStatus), 60);
  approx(result.unpaidClaimEur, 60);
  approx(result.claimEur, 60);
});

function numberish(value) {
  return typeof value === "number" ? value : Number.parseFloat(String(value));
}

console.log("\nAll finance math checks passed.");
