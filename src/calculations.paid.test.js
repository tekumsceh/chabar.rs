import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPoolSettlement,
  calculate,
  freezeAllocationsFromRows,
  numberValue,
  parseDate,
} from "./calculations.js";

test("parseDate no longer rolls impossible days forward", () => {
  assert.equal(Number.isNaN(parseDate("31.02.2027.").getTime()), true);
  assert.equal(parseDate("20.07.2026.").getDate(), 20);
});

test("numberValue reads a Serbian amount", () => {
  assert.equal(numberValue("1.200,50"), 1200.5);
});

test("stored money stays on the date it was saved on", () => {
  const events = [
    { id: 1, date: "12.01.2020.", priceEur: 100, expenseItems: [] },
    { id: 2, date: "15.01.2020.", priceEur: 100, expenseItems: [] },
  ];
  const payments = [
    {
      id: 1,
      date: "15.01.2020.",
      amount: 100,
      currency: "EUR",
      exchangeRate: 117,
      allocations: [{ eventId: 2, amountEur: 100, lineKind: "event", expenseKey: "" }],
    },
  ];
  const calc = calculate(events, payments, { exchangeRate: 117 });
  const older = calc.rows.find((row) => row.id === 1);
  const newer = calc.rows.find((row) => row.id === 2);
  assert.equal(older.paymentClass, "unpaid");
  assert.equal(newer.paymentClass, "paid");
  assert.equal(calc.claimEur, 100);
});

test("a partial amount is read back on the next load", () => {
  const events = [{ id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] }];
  const payments = [
    {
      id: 1,
      date: "02.01.2020.",
      amount: 40,
      currency: "EUR",
      exchangeRate: 117,
      allocations: [{ eventId: 1, amountEur: 40, lineKind: "event", expenseKey: "" }],
    },
  ];
  const calc = calculate(events, payments, { exchangeRate: 117 });
  assert.equal(calc.rows[0].paymentClass, "partial");
  assert.equal(calc.rows[0].paymentStatus, 60);
  assert.equal(calc.claimEur, 60);
});

test("freezing the old pool matches the stored lines", () => {
  const events = [
    { id: 1, date: "12.01.2020.", priceEur: 100, expenseItems: [] },
    { id: 2, date: "15.01.2020.", priceEur: 100, expenseItems: [] },
  ];
  const payments = [{ id: 10, date: "16.01.2020.", amount: 150, currency: "EUR", exchangeRate: 117, allocations: [] }];
  const settings = { exchangeRate: 117 };
  const base = calculate(events, payments, settings);
  const poolRows = base.rows.map((row) => ({ ...row, paymentClass: "future", paymentStatus: "" }));
  applyPoolSettlement(poolRows, base.paidEur);
  const lines = freezeAllocationsFromRows(poolRows, payments, settings);
  const stored = calculate(
    events,
    payments.map((payment) => ({
      ...payment,
      allocations: lines.filter((line) => Number(line.paymentId) === Number(payment.id)),
    })),
    settings,
  );
  for (const row of poolRows) {
    const other = stored.rows.find((item) => item.id === row.id);
    assert.equal(other.paymentClass, row.paymentClass);
    assert.equal(Number(other.paymentStatus) || other.paymentStatus, Number(row.paymentStatus) || row.paymentStatus);
  }
  assert.equal(stored.claimEur, 50);
});
