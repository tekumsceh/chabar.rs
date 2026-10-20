import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNbsMiddleRates } from "./exchangeRate.js";

const NBS_FIXTURE = `
<table>
  <tr>
    <td>EUR</td>
    <td>978</td>
    <td>EMU</td>
    <td>1</td>
    <td>117,4144</td>
  </tr>
  <tr>
    <td>USD</td>
    <td>840</td>
    <td>SAD</td>
    <td>1</td>
    <td>104,5077</td>
  </tr>
</table>
<p>20.10.2026. ГОДИНЕ</p>
`;

test("parseNbsMiddleRates reads EUR and USD middle rates", () => {
  const parsed = parseNbsMiddleRates(NBS_FIXTURE);
  assert.equal(parsed.rates.EUR, 117.4144);
  assert.equal(parsed.rates.USD, 104.5077);
  assert.equal(parsed.asOf, "20.10.2026");
});

test("parseNbsMiddleRates ignores missing USD without dropping EUR", () => {
  const parsed = parseNbsMiddleRates(`
    <tr>
      <td>EUR</td>
      <td>978</td>
      <td>EMU</td>
      <td>1</td>
      <td>117,0000</td>
    </tr>
  `);
  assert.equal(parsed.rates.EUR, 117);
  assert.equal(parsed.rates.USD, undefined);
});
