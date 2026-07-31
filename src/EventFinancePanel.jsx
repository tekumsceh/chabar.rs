import { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatEur, numberValue } from "./calculations.js";
import { useT } from "./i18n/I18nProvider.jsx";

function hasValidDraft(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return false;
  const priceEur = numberValue(trimmed.replace(",", "."));
  return Number.isFinite(priceEur) && priceEur >= 0;
}

function draftsFromMembers(list) {
  const nextDrafts = {};
  for (const member of list) {
    nextDrafts[member.id] =
      numberValue(member.priceEur) > 0 ? String(numberValue(member.priceEur)) : "";
  }
  return nextDrafts;
}

/**
 * Owner/lead: set per-member honorar for one date.
 * Data comes from EventPage finance prefetch (no self-fetch).
 */
export default function EventFinancePanel({
  eventId,
  bandId,
  readOnly = false,
  showToast,
  onChanged,
  solo = false,
  members = [],
  loading = false,
  error = "",
}) {
  const t = useT();
  const [drafts, setDrafts] = useState(() => draftsFromMembers(members));
  const [busyId, setBusyId] = useState("");
  const membersKey = (members || [])
    .map((member) => `${member.id}:${numberValue(member.priceEur)}`)
    .join("|");

  useEffect(() => {
    setDrafts(draftsFromMembers(members || []));
  }, [membersKey]);

  function updateDraft(userId, value) {
    setDrafts((current) => ({ ...current, [userId]: value }));
  }

  function applyDefault(member) {
    if (member.defaultPriceEur == null || Number.isNaN(Number(member.defaultPriceEur))) {
      showToast?.(t("finance.defaultNotSet"), "error");
      return;
    }
    updateDraft(member.id, String(numberValue(member.defaultPriceEur)));
  }

  async function setFee(member) {
    if (readOnly || busyId || !eventId || !bandId) return;
    const raw = String(drafts[member.id] ?? "").trim().replace(",", ".");
    if (raw === "") {
      showToast?.(t("finance.enterAmount"), "error");
      return;
    }
    const priceEur = numberValue(raw);
    if (!Number.isFinite(priceEur) || priceEur < 0) {
      showToast?.(t("finance.invalidAmount"), "error");
      return;
    }

    setBusyId(member.id);
    try {
      await api(`/api/events/${eventId}/member-finance/${member.id}`, {
        method: "PUT",
        bandId,
        body: { priceEur },
      });
      updateDraft(member.id, priceEur > 0 ? String(priceEur) : "");
      showToast?.(t("finance.feeSetToast", { name: member.name, amount: formatEur(priceEur) }));
      await onChanged?.(member.id, priceEur);
    } catch (requestError) {
      showToast?.(requestError.message || t("finance.saveFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <p className="event-finance-status">{t("finance.loadingMembers")}</p>;
  }

  if (error) {
    return <p className="event-finance-status is-error">{error}</p>;
  }

  if (!members.length) {
    return <p className="event-finance-status">{t("finance.noMembers")}</p>;
  }

  return (
    <ul
      className={`event-finance-list ${solo ? "is-solo" : ""}`.trim()}
      aria-label={solo ? t("event.myFee") : t("finance.feesByMember")}
    >
      {members.map((member) => {
        const busy = busyId === member.id;
        const amountReady = hasValidDraft(drafts[member.id]);
        const rowBusy = busy || Boolean(busyId);
        return (
          <li key={member.id} className="event-finance-row">
            {solo ? null : (
              <strong className="event-finance-name" title={member.name}>
                {member.name}
              </strong>
            )}
            <label className="event-finance-amount">
              <span className="sr-only">
                {solo
                  ? t("finance.amount")
                  : t("finance.amountFor", { name: member.name })}
              </span>
              <input
                id={`fee-${member.id}`}
                name={`fee-${member.id}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                maxLength={6}
                placeholder="€"
                value={drafts[member.id] ?? ""}
                disabled={readOnly || rowBusy}
                readOnly={readOnly}
                onChange={(event) => updateDraft(member.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && amountReady) {
                    event.preventDefault();
                    setFee(member);
                  }
                }}
              />
            </label>
            {readOnly ? null : (
              <>
                <button
                  type="button"
                  className="event-finance-icon-btn event-finance-icon-btn-accent"
                  aria-label={
                    solo ? t("finance.setFee") : t("finance.setFeeFor", { name: member.name })
                  }
                  title={t("finance.set")}
                  disabled={rowBusy || !amountReady}
                  onClick={() => setFee(member)}
                >
                  {busy ? "…" : <CheckIcon />}
                </button>
                {solo ? null : (
                  <button
                    type="button"
                    className="event-finance-icon-btn"
                    aria-label={t("finance.defaultFee", { name: member.name })}
                    title={t("finance.defaultShort")}
                    disabled={rowBusy}
                    onClick={() => applyDefault(member)}
                  >
                    <DefaultIcon />
                  </button>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5 10 17.5 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 12a8 8 0 0 1 14.2-5M20 12a8 8 0 0 1-14.2 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M18 3.5v4h-4M6 20.5v-4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
