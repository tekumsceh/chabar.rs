/**
 * Parse a money field the way sr-RS users type it.
 * The last comma or dot is the decimal mark only when 1 or 2 digits follow it.
 * A group of 3 digits is thousands, so "1.500" is 1500 and "1.200,50" is 1200.50.
 * Anything else is rejected.
 */
export function parseMoneyAmount(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { ok: false, value: null };
    return { ok: true, value, empty: false };
  }

  let text = String(value ?? "")
    .trim()
    .replace(/[\s\u00a0]/g, "");
  if (!text) return { ok: true, value: 0, empty: true };
  if (!/^[+-]?[0-9.,]+$/.test(text)) return { ok: false, value: null };

  const sign = text.startsWith("-") ? -1 : 1;
  if (text.startsWith("+") || text.startsWith("-")) text = text.slice(1);
  if (!text) return { ok: false, value: null };

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  let digits;
  if (lastSep === -1) {
    digits = text;
  } else {
    const fraction = text.slice(lastSep + 1);
    const head = text.slice(0, lastSep);
    if (/^\d{1,2}$/.test(fraction)) {
      if (!thousandsGroupsOk(head)) return { ok: false, value: null };
      digits = `${head.replace(/[.,]/g, "")}.${fraction}`;
    } else if (/^\d{3}$/.test(fraction) && thousandsGroupsOk(text)) {
      digits = text.replace(/[.,]/g, "");
    } else {
      return { ok: false, value: null };
    }
  }

  if (!/^\d+(\.\d+)?$/.test(digits)) return { ok: false, value: null };
  const amount = sign * Number(digits);
  if (!Number.isFinite(amount)) return { ok: false, value: null };
  return { ok: true, value: amount, empty: false };
}

function thousandsGroupsOk(text) {
  if (!text) return false;
  if (!/^[0-9.,]+$/.test(text)) return false;
  if (text.includes(".") && text.includes(",")) return false;
  const parts = text.split(/[.,]/);
  if (parts.some((part) => !/^\d+$/.test(part))) return false;
  if (parts.length === 1) return true;
  return parts.slice(1).every((part) => part.length === 3);
}

/** Canonical field text after a successful parse, so the user sees what was stored. */
export function moneyInputText(value) {
  const parsed = parseMoneyAmount(value);
  if (!parsed.ok || parsed.empty) return "";
  const rounded = Math.round(parsed.value * 100) / 100;
  return String(rounded);
}
