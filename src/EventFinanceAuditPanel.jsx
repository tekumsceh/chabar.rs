import { useEffect, useState } from "react";
import { api } from "./api.js";
import FinanceAuditList from "./FinanceAuditList.jsx";
import { useI18n, useT } from "./i18n/I18nProvider.jsx";

/**
 * Per-date finance changelog (honorari + troškovi mutations).
 */
export default function EventFinanceAuditPanel({ eventId, bandId, refreshKey = 0 }) {
  const t = useT();
  const { locale } = useI18n();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!eventId || !bandId) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    api(`/api/events/${eventId}/finance-audit?limit=80`, { bandId })
      .then((data) => {
        if (!cancelled) setEntries(data.entries || []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, bandId, refreshKey]);

  return (
    <FinanceAuditList
      className="finance-changelog-wrap is-event"
      entries={entries}
      loading={loading}
      locale={locale}
      title={t("finance.auditTitle")}
      loadingMessage={t("finance.auditLoading")}
      emptyMessage={t("finance.auditEmptyEvent")}
      t={t}
    />
  );
}
