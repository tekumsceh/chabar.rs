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
      member.defaultPriceEur != null && !Number.isNaN(Number(member.defaultPriceEur))
        ? String(numberValue(member.defaultPriceEur))
        : "";
  }
  return nextDrafts;
}

function formatAuditLine(entry, t) {
  const before = entry.before || {};
  const after = entry.after || {};
  if (entry.entityType === "band_member") {
    const prev = before.defaultPriceEur;
    const next = after.defaultPriceEur;
    if (next == null) {
      return t("finance.auditDefaultCleared", {
        amount: prev != null ? formatEur(prev) : "—",
      });
    }
    return t("finance.auditDefaultSet", {
      amount: formatEur(next),
    });
  }
  if (entry.entityType === "event_member_finance") {
    const prev = before.priceEur;
    const next = after.priceEur;
    if (entry.action === "insert") {
      return t("finance.auditEventFeeSet", { amount: formatEur(next) });
    }
    return t("finance.auditEventFeeChanged", {
      from: formatEur(prev),
      to: formatEur(next),
    });
  }
  return entry.action;
}

/**
 * Band management: per-member default honorari + recent audit log.
 */
export default function BandMemberFeesPanel({
  bandId,
  members = [],
  readOnly = false,
  busy = false,
  showToast,
  onSaved,
}) {
  const t = useT();
  const [drafts, setDrafts] = useState(() => draftsFromMembers(members));
  const [savingId, setSavingId] = useState("");
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const membersKey = (members || [])
    .map((member) => `${member.id}:${member.defaultPriceEur ?? ""}`)
    .join("|");

  useEffect(() => {
    setDrafts(draftsFromMembers(members));
  }, [membersKey]);

  useEffect(() => {
    let cancelled = false;
    if (!bandId || readOnly) {
      setAudit([]);
      setAuditLoading(false);
      return undefined;
    }
    (async () => {
      setAuditLoading(true);
      try {
        const data = await api(`/api/bands/${bandId}/fee-audit?limit=40`, { bandId });
        if (!cancelled) setAudit(data.entries || []);
      } catch {
        if (!cancelled) setAudit([]);
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bandId, readOnly, membersKey]);

  async function saveDefault(member) {
    if (readOnly || busy || savingId || !bandId) return;
    const raw = String(drafts[member.id] ?? "").trim().replace(",", ".");
    const defaultPriceEur = raw === "" ? null : numberValue(raw);
    if (raw !== "" && (!Number.isFinite(defaultPriceEur) || defaultPriceEur < 0)) {
      showToast?.(t("finance.invalidAmount"), "error");
      return;
    }

    setSavingId(member.id);
    try {
      await api(`/api/bands/${bandId}/members/${member.id}/default-fee`, {
        method: "PATCH",
        bandId,
        body: { defaultPriceEur },
      });
      showToast?.(
        defaultPriceEur == null
          ? t("finance.defaultClearedToast", { name: member.name })
          : t("finance.defaultSavedToast", {
              name: member.name,
              amount: formatEur(defaultPriceEur),
            }),
      );
      await onSaved?.();
    } catch (error) {
      showToast?.(error.message || t("finance.defaultSaveFail"), "error");
    } finally {
      setSavingId("");
    }
  }

  const rowBusy = Boolean(savingId) || busy;

  return (
    <div className="band-fees-panel band-manage-panel" aria-label={t("band.feesPanel")}>
      <p className="band-add-hint">{t("band.feesHint")}</p>
      <ul className="band-fees-list">
        {members.map((member) => {
          const saving = savingId === member.id;
          const ready = hasValidDraft(drafts[member.id]) || String(drafts[member.id] ?? "").trim() === "";
          const stored =
            member.defaultPriceEur != null && !Number.isNaN(Number(member.defaultPriceEur));
          return (
            <li key={member.id} className="band-fees-row">
              <span className="band-fees-name">{member.name}</span>
              <label className="band-fees-amount">
                <span className="sr-only">{t("finance.amountFor", { name: member.name })}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={6}
                  placeholder="€"
                  value={drafts[member.id] ?? ""}
                  disabled={readOnly || rowBusy}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [member.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && ready) {
                      event.preventDefault();
                      saveDefault(member);
                    }
                  }}
                />
              </label>
              {readOnly ? (
                stored ? (
                  <span className="band-fees-stored">{formatEur(member.defaultPriceEur)}</span>
                ) : (
                  <span className="band-fees-stored is-empty">{t("finance.defaultNotSet")}</span>
                )
              ) : (
                <button
                  type="button"
                  className="band-fees-save"
                  disabled={rowBusy || !ready}
                  onClick={() => saveDefault(member)}
                >
                  {saving ? "…" : t("finance.setAsDefault")}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly ? (
        <div className="band-fees-audit">
          <h4>{t("finance.auditTitle")}</h4>
          {auditLoading ? (
            <p className="band-home-note">{t("finance.auditLoading")}</p>
          ) : audit.length ? (
            <ul className="band-fees-audit-list">
              {audit.map((entry) => (
                <li key={entry.id}>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span>{entry.actorName}</span>
                  <span>{formatAuditLine(entry, t)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="band-home-note">{t("finance.auditEmpty")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
