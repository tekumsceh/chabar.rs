import { formatFinanceAuditChangelog } from "./financeAuditFormat.js";

/**
 * Plain condensed changelog (one line per mutation).
 */
export default function FinanceAuditList({
  entries = [],
  loading = false,
  emptyMessage,
  loadingMessage,
  title,
  t,
  locale = "sr",
  className = "finance-changelog-wrap",
}) {
  return (
    <div className={className}>
      {title ? <h4 className="finance-changelog-title">{title}</h4> : null}
      {loading ? (
        <p className="finance-changelog-empty">{loadingMessage}</p>
      ) : entries.length ? (
        <ul className="finance-changelog-list">
          {entries.map((entry) => (
            <li key={entry.id} className="finance-changelog-line">
              {formatFinanceAuditChangelog(entry, t, locale)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="finance-changelog-empty">{emptyMessage}</p>
      )}
    </div>
  );
}
