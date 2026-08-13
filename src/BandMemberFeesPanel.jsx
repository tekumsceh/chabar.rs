import { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatEur, numberValue } from "./calculations.js";
import FinanceAuditList from "./FinanceAuditList.jsx";
import { useI18n, useT } from "./i18n/I18nProvider.jsx";

function enrichAuditEntry(entry, members) {
  if (entry.memberName) return entry;
  let userId = entry.memberUserId || null;
  if (!userId && entry.entityType === "event_member_finance") {
    userId = String(entry.entityId || "").split(":")[1] || null;
  }
  if (!userId && entry.entityType === "band_member") {
    userId = entry.after?.userId || entry.before?.userId || entry.entityId || null;
  }
  if (!userId) return entry;
  const member = members.find((item) => item.id === userId);
  return member ? { ...entry, memberName: member.name } : entry;
}

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
  const { locale } = useI18n();
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
        if (!cancelled) {
          setAudit((data.entries || []).map((entry) => enrichAuditEntry(entry, members)));
        }
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
        <FinanceAuditList
          entries={audit}
          loading={auditLoading}
          locale={locale}
          title={t("finance.auditTitle")}
          loadingMessage={t("finance.auditLoading")}
          emptyMessage={t("finance.auditEmpty")}
          t={t}
        />
      ) : null}
    </div>
  );
}
