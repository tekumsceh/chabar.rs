import { useEffect, useState } from "react";
import { api } from "./api.js";
import FadeScroll from "./FadeScroll.jsx";
import FinanceAuditList from "./FinanceAuditList.jsx";
import { useI18n, useT } from "./i18n/I18nProvider.jsx";

export default function FinanceHistoryModal({ row, onClose }) {
  const t = useT();
  const { locale } = useI18n();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dateLabel = String(row?.date || "").replace(/\.$/, "") || t("report.noDate");
  const title = `${dateLabel}${row?.city ? ` — ${row.city}` : ""}`;

  useEffect(() => {
    if (!row?.id || !row?.bandId) return undefined;

    let cancelled = false;
    setLoading(true);
    setError("");

    api(`/api/events/${row.id}/finance-audit?limit=150`, { bandId: row.bandId })
      .then((data) => {
        if (!cancelled) setEntries(data.entries || []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setEntries([]);
          setError(requestError.message || t("finance.auditLoadFail"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [row?.id, row?.bandId, t]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-panel finance-history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="financeHistoryTitle"
      >
        <header className="finance-history-head">
          <h2 id="financeHistoryTitle">{t("finance.auditTitle")}</h2>
          <p className="finance-history-sub">{title}</p>
          <button
            type="button"
            className="raspored-icon-btn finance-history-close"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <CloseIcon />
          </button>
        </header>

        <FadeScroll viewportClassName="finance-history-body">
          {error ? (
            <p className="finance-changelog-empty is-error">{error}</p>
          ) : (
            <FinanceAuditList
              className="finance-changelog-wrap is-modal"
              entries={entries}
              loading={loading}
              locale={locale}
              loadingMessage={t("finance.auditLoading")}
              emptyMessage={t("finance.auditEmptyEvent")}
              t={t}
            />
          )}
        </FadeScroll>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
