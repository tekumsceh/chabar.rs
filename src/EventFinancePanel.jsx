import { useEffect, useMemo, useState } from "react";
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

function parseDraftAmount(raw) {
  const trimmed = String(raw ?? "").trim().replace(",", ".");
  if (!trimmed) return null;
  const priceEur = numberValue(trimmed);
  if (!Number.isFinite(priceEur) || priceEur < 0) return null;
  return priceEur;
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
  onDefaultChanged,
  solo = false,
  members = [],
  loading = false,
  error = "",
}) {
  const t = useT();
  const [drafts, setDrafts] = useState(() => draftsFromMembers(members));
  const [busyId, setBusyId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const membersKey = (members || [])
    .map(
      (member) =>
        `${member.id}:${numberValue(member.priceEur)}:${member.defaultPriceEur ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    setDrafts(draftsFromMembers(members || []));
  }, [membersKey]);

  const membersWithDefaults = useMemo(
    () =>
      (members || []).filter(
        (member) =>
          member.defaultPriceEur != null && !Number.isNaN(Number(member.defaultPriceEur)),
      ),
    [members],
  );

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

  function applyAllDefaults() {
    if (!membersWithDefaults.length) {
      showToast?.(t("finance.noDefaultsConfigured"), "error");
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      for (const member of membersWithDefaults) {
        next[member.id] = String(numberValue(member.defaultPriceEur));
      }
      return next;
    });
    showToast?.(t("finance.defaultsFilled"));
  }

  async function applyAndSaveAllDefaults() {
    if (readOnly || bulkBusy || busyId || !eventId || !bandId) return;
    if (!membersWithDefaults.length) {
      showToast?.(t("finance.noDefaultsConfigured"), "error");
      return;
    }
    setBulkBusy(true);
    try {
      const data = await api(`/api/events/${eventId}/member-finance/apply-defaults`, {
        method: "POST",
        bandId,
        body: {},
      });
      const applied = data.applied || [];
      setDrafts((current) => {
        const next = { ...current };
        for (const row of applied) {
          next[row.userId] = row.priceEur > 0 ? String(row.priceEur) : "";
        }
        return next;
      });
      showToast?.(t("finance.defaultsAppliedCount", { count: applied.length }));
      await onChanged?.();
    } catch (requestError) {
      showToast?.(requestError.message || t("finance.saveFail"), "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function setFee(member) {
    if (readOnly || busyId || bulkBusy || !eventId || !bandId) return;
    const priceEur = parseDraftAmount(drafts[member.id]);
    if (priceEur == null) {
      showToast?.(
        hasValidDraft(drafts[member.id]) ? t("finance.invalidAmount") : t("finance.enterAmount"),
        "error",
      );
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

  async function setAsDefault(member) {
    if (readOnly || busyId || bulkBusy || !bandId) return;
    const priceEur = parseDraftAmount(drafts[member.id]);
    if (priceEur == null) {
      showToast?.(
        hasValidDraft(drafts[member.id]) ? t("finance.invalidAmount") : t("finance.enterAmount"),
        "error",
      );
      return;
    }

    setBusyId(member.id);
    try {
      await api(`/api/bands/${bandId}/members/${member.id}/default-fee`, {
        method: "PATCH",
        bandId,
        body: { defaultPriceEur: priceEur },
      });
      showToast?.(
        t("finance.defaultSavedToast", { name: member.name, amount: formatEur(priceEur) }),
      );
      await onDefaultChanged?.(member.id, priceEur);
    } catch (requestError) {
      showToast?.(requestError.message || t("finance.defaultSaveFail"), "error");
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

  const rowBusy = Boolean(busyId) || bulkBusy;

  return (
    <div className="event-finance-wrap">
      {!solo && !readOnly ? (
        <div className="event-finance-toolbar">
          <button
            type="button"
            className="event-finance-toolbar-btn"
            disabled={rowBusy || !membersWithDefaults.length}
            onClick={applyAllDefaults}
          >
            {t("finance.useDefaultsAll")}
          </button>
          <button
            type="button"
            className="event-finance-toolbar-btn event-finance-toolbar-btn-accent"
            disabled={rowBusy || !membersWithDefaults.length}
            onClick={applyAndSaveAllDefaults}
          >
            {bulkBusy ? "…" : t("finance.applyDefaultsAll")}
          </button>
        </div>
      ) : null}
      <ul
        className={`event-finance-list ${solo ? "is-solo" : ""}`.trim()}
        aria-label={solo ? t("event.myFee") : t("finance.feesByMember")}
      >
        {members.map((member) => {
          const busy = busyId === member.id;
          const amountReady = hasValidDraft(drafts[member.id]);
          const hasDefault =
            member.defaultPriceEur != null && !Number.isNaN(Number(member.defaultPriceEur));
          return (
            <li key={member.id} className="event-finance-row">
              {solo ? null : (
                <strong className="event-finance-name" title={member.name}>
                  {member.name}
                  {hasDefault ? (
                    <small className="event-finance-default-hint">
                      {formatEur(member.defaultPriceEur)}
                    </small>
                  ) : null}
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
                    <>
                      <button
                        type="button"
                        className="event-finance-icon-btn"
                        aria-label={t("finance.defaultFee", { name: member.name })}
                        title={t("finance.defaultShort")}
                        disabled={rowBusy || !hasDefault}
                        onClick={() => applyDefault(member)}
                      >
                        <DefaultIcon />
                      </button>
                      <button
                        type="button"
                        className="event-finance-icon-btn"
                        aria-label={t("finance.setDefaultFor", { name: member.name })}
                        title={t("finance.setAsDefault")}
                        disabled={rowBusy || !amountReady}
                        onClick={() => setAsDefault(member)}
                      >
                        <PinDefaultIcon />
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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

function PinDefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 17v4M8 3h8l1 7h3v2h-3.2L16 21h-2l-1.8-9H8V3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
