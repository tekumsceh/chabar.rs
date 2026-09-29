const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/;

/**
 * Strict calendar date in the app's DD.MM.YYYY text form.
 * Empty is allowed. Impossible days (31.02, 00.00, 99.99) are rejected
 * instead of rolling into another month.
 */
export function parseStrictCalendarDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true, empty: true, date: null };

  const match = text.match(DATE_RE);
  if (!match) return { ok: false, empty: false, date: null };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { ok: false, empty: false, date: null };
  }

  return { ok: true, empty: false, date };
}
