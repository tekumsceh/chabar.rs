import assert from "node:assert/strict";
import test from "node:test";
import { moneyInputText, parseMoneyAmount } from "./money.js";

test("reads Serbian and mixed money text", () => {
  assert.equal(parseMoneyAmount("1.200,50").value, 1200.5);
  assert.equal(parseMoneyAmount("1 200,50").value, 1200.5);
  assert.equal(parseMoneyAmount("1,200.50").value, 1200.5);
  assert.equal(parseMoneyAmount("1.500").value, 1500);
  assert.equal(parseMoneyAmount("1,5").value, 1.5);
  assert.equal(parseMoneyAmount(80).value, 80);
});

test("rejects ambiguous or junk amounts", () => {
  assert.equal(parseMoneyAmount("1.2.3").ok, false);
  assert.equal(parseMoneyAmount("abc").ok, false);
  assert.equal(parseMoneyAmount("1,20,50").ok, false);
});

test("shows the parsed value back as a plain number", () => {
  assert.equal(moneyInputText("1.200,50"), "1200.5");
  assert.equal(moneyInputText(""), "");
});
