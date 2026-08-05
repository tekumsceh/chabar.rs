import { parseDate } from "./calculations.js";

/** Same calendar day (DD.MM.YYYY. text). */
export function sameCalendarDay(first, second) {
  const a = parseDate(first);
  const b = parseDate(second);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatEventConflictLabel(row = {}) {
  const parts = [row.bandName, row.city, row.venue].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return String(row.date || "—").trim() || "—";
}

/**
 * Find schedule rows on the same day as `date` for the active band (sameBand)
 * and other bands the user can see (crossBand).
 */
export function findScheduleDuplicates({ events = [], bandId, date, excludeEventId = null }) {
  const sameBand = [];
  const crossBand = [];
  const targetBand = String(bandId || "");

  for (const row of events) {
    if (excludeEventId != null && String(row.id) === String(excludeEventId)) continue;
    if (!sameCalendarDay(row.date, date)) continue;

    const entry = {
      id: row.id,
      bandId: row.bandId,
      bandName: row.bandName || "",
      city: row.city || "",
      venue: row.venue || "",
      date: row.date || "",
      label: formatEventConflictLabel(row),
    };

    if (String(row.bandId) === targetBand) sameBand.push(entry);
    else crossBand.push(entry);
  }

  return { sameBand, crossBand };
}

export function buildDuplicateConfirmMessage(t, { sameBand, crossBand, date }) {
  const lines = [t("schedule.duplicateIntro", { date })];

  if (sameBand.length) {
    lines.push("", t("schedule.duplicateSameBand"));
    for (const row of sameBand) lines.push(`• ${row.label}`);
  }

  if (crossBand.length) {
    lines.push("", t("schedule.duplicateCrossBand"));
    for (const row of crossBand) lines.push(`• ${row.label}`);
  }

  lines.push("", t("schedule.duplicateProceedHint"));
  return lines.join("\n");
}

export function hasScheduleDuplicates(result) {
  return Boolean(result?.sameBand?.length || result?.crossBand?.length);
}
