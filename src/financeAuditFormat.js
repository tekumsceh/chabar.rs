import { formatEur } from "./calculations.js";

export function formatExpenseAuditAmount(item) {
  if (!item) return "—";
  const amount = Number(item.amount) || 0;
  const currency = String(item.currency || "EUR").toUpperCase();
  if (currency === "EUR") return formatEur(amount);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

/** @returns {string} e.g. "Aug 21, 11:12:45" */
export function formatChangelogWhen(iso, locale = "sr") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const loc = locale === "en" ? "en-GB" : "sr-Latn-RS";
  const datePart = date.toLocaleString(loc, {
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleString(loc, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${datePart}, ${timePart}`;
}

function formatEurDelta(prev, next) {
  const delta = Math.round((next - prev) * 100) / 100;
  if (delta === 0) return "0 EUR";
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return `${sign}${body} EUR`;
}

function formatFeeAmount(eur) {
  const n = Number(eur) || 0;
  if (Number.isInteger(n)) return `${n} EUR`;
  return `${n.toFixed(2)} EUR`;
}

function expenseDesc(snap, t) {
  const raw = String(snap.description || "").trim();
  return raw || t("finance.expense");
}

/**
 * @returns {{ what: string, whom: string | null }}
 */
export function formatFinanceAuditChange(entry, t) {
  const before = entry.before || {};
  const after = entry.after || {};
  const whom = entry.memberName || null;

  if (entry.entityType === "band_member") {
    const prev = before.defaultPriceEur;
    const next = after.defaultPriceEur;
    if (next == null) {
      return {
        what: t("finance.auditChangelogClearedDefault", {
          amount: prev != null ? formatFeeAmount(prev) : "—",
        }),
        whom,
      };
    }
    return {
      what: t("finance.auditChangelogSetDefault", { amount: formatFeeAmount(next) }),
      whom,
    };
  }

  if (entry.entityType === "event_member_finance") {
    const prev = Number(before.priceEur) || 0;
    const next = Number(after.priceEur) || 0;
    if (entry.action === "insert") {
      return {
        what: t("finance.auditChangelogSetFee", { amount: formatFeeAmount(next) }),
        whom,
      };
    }
    return {
      what: t("finance.auditChangelogUpdatedFee", { delta: formatEurDelta(prev, next) }),
      whom,
    };
  }

  if (entry.entityType === "event_expense") {
    const snap = after.id != null ? after : before;
    const amount = formatExpenseAuditAmount(snap);
    const desc = expenseDesc(snap, t);
    if (entry.action === "delete") {
      return {
        what: t("finance.auditChangelogRemovedExpense", { amount, desc }),
        whom,
      };
    }
    return {
      what: t("finance.auditChangelogAddedExpense", { amount, desc }),
      whom,
    };
  }

  if (entry.entityType === "event") {
    const prevFee = Number(before.priceEur) || 0;
    const nextFee = Number(after.priceEur) || 0;
    const prevTransport = Number(before.transportRsd) || 0;
    const nextTransport = Number(after.transportRsd) || 0;

    if (prevFee !== nextFee) {
      if (entry.action === "insert") {
        return {
          what: t("finance.auditChangelogSetFee", { amount: formatFeeAmount(nextFee) }),
          whom: null,
        };
      }
      return {
        what: t("finance.auditChangelogUpdatedFee", { delta: formatEurDelta(prevFee, nextFee) }),
        whom: null,
      };
    }
    if (prevTransport !== nextTransport) {
      return {
        what: t("finance.auditChangelogUpdatedTransport", {
          from: prevTransport.toLocaleString(),
          to: nextTransport.toLocaleString(),
        }),
        whom: null,
      };
    }
  }

  return { what: entry.action, whom: null };
}

/**
 * One-line changelog: Who: when — what for whom
 * e.g. Tekumsceh: Aug 21, 11:12:45 — updated fee +30 EUR for Dejan
 */
export function formatFinanceAuditChangelog(entry, t, locale = "sr") {
  const actor = entry.actorName || t("finance.auditUnknownActor");
  const when = formatChangelogWhen(entry.createdAt, locale);
  const { what, whom } = formatFinanceAuditChange(entry, t);
  const whomPart = whom ? ` ${t("finance.auditChangelogFor", { name: whom })}` : "";
  return `${actor}: ${when} — ${what}${whomPart}`;
}

/** @deprecated use formatFinanceAuditChangelog */
export function formatFinanceAuditLine(entry, t, locale = "sr") {
  return formatFinanceAuditChangelog(entry, t, locale);
}
