import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPoolSettlement,
  calculate,
  freezeAllocationsFromRows,
  isClearedEur,
  numberValue,
  parseDate,
  round,
  simulateBulkPayAllocations,
} from "./calculations.js";

test("parseDate no longer rolls impossible days forward", () => {
  assert.equal(Number.isNaN(parseDate("31.02.2027.").getTime()), true);
  assert.equal(parseDate("20.07.2026.").getDate(), 20);
});

test("numberValue reads a Serbian amount", () => {
  assert.equal(numberValue("1.200,50"), 1200.5);
});

test("leftover owed sits on the last unpaid date; older dates are paid", () => {
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
  assert.equal(older.paymentClass, "paid");
  assert.equal(newer.paymentClass, "unpaid");
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

test("a leftover that displays as 0,00 is fully paid", () => {
  const events = [{ id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] }];
  const payments = [
    {
      id: 1,
      date: "02.01.2020.",
      amount: 99.996,
      currency: "EUR",
      exchangeRate: 117,
      allocations: [{ eventId: 1, amountEur: 99.996, lineKind: "event", expenseKey: "" }],
    },
  ];
  const calc = calculate(events, payments, { exchangeRate: 117 });
  assert.equal(calc.rows[0].paymentClass, "paid");
  assert.equal(calc.claimEur, 0);
  assert.equal(isClearedEur(0.004), true);
});

test("a leftover under 1 EUR is paid", () => {
  const events = [{ id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] }];
  const payments = [
    {
      id: 1,
      date: "02.01.2020.",
      amount: 99.8,
      currency: "EUR",
      exchangeRate: 117,
      allocations: [{ eventId: 1, amountEur: 99.8, lineKind: "event", expenseKey: "" }],
    },
  ];
  const calc = calculate(events, payments, { exchangeRate: 117 });
  assert.equal(calc.rows[0].paymentClass, "paid");
  assert.equal(calc.claimEur, 0);
});

test("a leftover of 1 EUR stays open", () => {
  const events = [{ id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] }];
  const payments = [
    {
      id: 1,
      date: "02.01.2020.",
      amount: 99,
      currency: "EUR",
      exchangeRate: 117,
      allocations: [{ eventId: 1, amountEur: 99, lineKind: "event", expenseKey: "" }],
    },
  ];
  const calc = calculate(events, payments, { exchangeRate: 117 });
  assert.equal(calc.rows[0].paymentClass, "partial");
  assert.equal(round(calc.rows[0].paymentStatus), 1);
  assert.equal(calc.claimEur, 1);
});

test("claim rounds once after summing precise remainders", () => {
  const events = [
    { id: 1, date: "01.01.2020.", priceEur: 10.004, expenseItems: [] },
    { id: 2, date: "02.01.2020.", priceEur: 10.004, expenseItems: [] },
  ];
  const calc = calculate(events, [], { exchangeRate: 117 });
  assert.equal(calc.rows[0].paymentClass, "unpaid");
  assert.equal(calc.rows[1].paymentClass, "unpaid");
  assert.equal(calc.claimEur, 20.01);
});


test("bulk pay covering a date at display precision marks it fully paid", () => {
  const events = [{ id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] }];
  const calc = calculate(events, [], { exchangeRate: 117 });
  const plan = simulateBulkPayAllocations(calc.rows, 99.996);
  assert.equal(plan.fullyPaidCount, 1);
  assert.equal(plan.partialEventId, null);
  assert.equal(plan.allocations[0].amountEur, 100);
  assert.equal(plan.unallocatedEur, 0);
});

test("bulk pay in cents does not leave rounding dust on covered dates", () => {
  const events = [
    { id: 1, date: "01.01.2020.", priceEur: 100 / 3, expenseItems: [] },
    { id: 2, date: "02.01.2020.", priceEur: 100 / 3, expenseItems: [] },
    { id: 3, date: "03.01.2020.", priceEur: 100 / 3, expenseItems: [] },
  ];
  const settings = { exchangeRate: 117 };
  const calc = calculate(events, [], settings);
  const plan = simulateBulkPayAllocations(calc.rows, 100);
  assert.equal(plan.fullyPaidCount, 3);
  assert.equal(plan.partialEventId, null);
  const stored = calculate(
    events,
    [
      {
        id: 1,
        date: "04.01.2020.",
        amount: 100,
        currency: "EUR",
        exchangeRate: 117,
        allocations: plan.allocations,
      },
    ],
    settings,
  );
  assert.equal(stored.rows.every((row) => row.paymentClass === "paid"), true);
  assert.equal(stored.claimEur, 0);
});

test("a real bulk shortfall stays on the last date only", () => {
  const events = [
    { id: 1, date: "01.01.2020.", priceEur: 50, expenseItems: [] },
    { id: 2, date: "02.01.2020.", priceEur: 50, expenseItems: [] },
  ];
  const settings = { exchangeRate: 117 };
  const calc = calculate(events, [], settings);
  const plan = simulateBulkPayAllocations(calc.rows, 75);
  assert.equal(plan.fullyPaidCount, 1);
  assert.equal(plan.partialEventId, 2);
  assert.equal(plan.allocations[0].amountEur, 50);
  assert.equal(plan.allocations[1].amountEur, 25);
  const stored = calculate(
    events,
    [
      {
        id: 1,
        date: "03.01.2020.",
        amount: 75,
        currency: "EUR",
        exchangeRate: 117,
        allocations: plan.allocations,
      },
    ],
    settings,
  );
  assert.equal(stored.rows.find((row) => row.id === 1).paymentClass, "paid");
  const partial = stored.rows.find((row) => row.id === 2);
  assert.equal(partial.paymentClass, "partial");
  assert.equal(round(partial.paymentStatus), 25);
  assert.equal(stored.claimEur, 25);
});

test("if leftover is larger than the last date, older dates reopen from the end", () => {
  const events = [
    { id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] },
    { id: 2, date: "02.01.2020.", priceEur: 100, expenseItems: [] },
    { id: 3, date: "03.01.2020.", priceEur: 100, expenseItems: [] },
  ];
  const payments = [
    {
      id: 1,
      date: "04.01.2020.",
      amount: 50,
      currency: "EUR",
      exchangeRate: 117,
      allocations: [],
    },
  ];
  const calc = calculate(events, payments, { exchangeRate: 117 });
  assert.equal(calc.rows.find((row) => row.id === 1).paymentClass, "partial");
  assert.equal(round(calc.rows.find((row) => row.id === 1).paymentStatus), 50);
  assert.equal(calc.rows.find((row) => row.id === 2).paymentClass, "unpaid");
  assert.equal(calc.rows.find((row) => row.id === 3).paymentClass, "unpaid");
  assert.equal(calc.claimEur, 250);
});

test("bulk pay short by under 1 EUR still closes the date", () => {
  const events = [{ id: 1, date: "01.01.2020.", priceEur: 100, expenseItems: [] }];
  const calc = calculate(events, [], { exchangeRate: 117 });
  const plan = simulateBulkPayAllocations(calc.rows, 99.2);
  assert.equal(plan.fullyPaidCount, 1);
  assert.equal(plan.partialEventId, null);
  const stored = calculate(
    events,
    [
      {
        id: 1,
        date: "02.01.2020.",
        amount: 99.2,
        currency: "EUR",
        exchangeRate: 117,
        allocations: plan.allocations,
      },
    ],
    { exchangeRate: 117 },
  );
  assert.equal(stored.rows[0].paymentClass, "paid");
  assert.equal(stored.claimEur, 0);
});
