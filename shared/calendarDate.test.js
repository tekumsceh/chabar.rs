import assert from "node:assert/strict";
import test from "node:test";
import { parseStrictCalendarDate } from "./calendarDate.js";

test("accepts the app date form, including a trailing dot", () => {
  const parsed = parseStrictCalendarDate("20.07.2026.");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.date.getFullYear(), 2026);
  assert.equal(parsed.date.getMonth(), 6);
  assert.equal(parsed.date.getDate(), 20);
});

test("empty date stays allowed", () => {
  const parsed = parseStrictCalendarDate("  ");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.empty, true);
});

test("rejects impossible dates instead of rolling them", () => {
  for (const value of ["31.02.2027.", "00.00.2027.", "99.99.2027", "32.01.2026."]) {
    assert.equal(parseStrictCalendarDate(value).ok, false, value);
  }
});
