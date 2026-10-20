import { useEffect, useId, useMemo, useRef, useState } from "react";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import {
  calculate,
  financeExpenseItems,
  financeLineKey,
  financeLineRemainingEur,
  financeRemainingEur,
  formatEur,
  formatRsd,
  formatScheduleDateParts,
  isFinanceDueRow,
  memberPayeeExpenseEur,
  numberValue,
  waterfallClaimEur,
  parseDate,
} from "./calculations.js";
import FieldSelect from "./FieldSelect.jsx";
import MenuSelect from "./MenuSelect.jsx";
import RasporedSkeleton from "./RasporedSkeleton.jsx";
import FadeScroll from "./FadeScroll.jsx";
import FinanceHistoryModal from "./FinanceHistoryModal.jsx";
import PageHeader from "./PageHeader.jsx";
import { PaidDoubleCheckIcon, SettlePayIcon } from "./appIcons.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

const STATUS_OPTION_KEYS = [
  { id: "all", labelKey: "report.statusAll" },
  { id: "unpaid", labelKey: "report.statusUnpaid" },
  { id: "paid", labelKey: "report.statusPaid" },
];

export default function ReportPage({
  events,
  payments,
  bands = [],
  activeBandId,
  allBandsId,
  financeMode = "member",
  canUseBandMode = false,
  onFinanceModeChange,
  settings,
  loading = false,
  showToast,
  userId = "",
  searchQuery = "",
  focusEventId = null,
  onFocusEventConsumed,
  focusTab = null,
  onFocusTabConsumed,
  onBack,
  onOpenLiveEvent,
  onPayEvent,
  onPayLine,
  onBulkPay,
  payingEventId = null,
  payingLineKey = "",
  bulkPayBusy = false,
}) {
  const t = useT();
  const search = searchQuery;
  const [statusFilter, setStatusFilter] = useState("all");
  /** desc = novo → staro (default); asc = staro → novo */
  const [dateSort, setDateSort] = useState("desc");
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState("dates");
  const [selectedId, setSelectedId] = useState(null);
  const [listPage, setListPage] = useState(0);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkCurrency, setBulkCurrency] = useState("EUR");
  const [historyRow, setHistoryRow] = useState(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);

  useEffect(() => {
    if (focusEventId == null || focusEventId === "") return;
    setSelectedId(focusEventId);
    onFocusEventConsumed?.();
  }, [focusEventId, onFocusEventConsumed]);

  useEffect(() => {
    if (focusTab !== "payments" && focusTab !== "dates") return;
    setActiveTab(focusTab);
    onFocusTabConsumed?.();
  }, [focusTab, onFocusTabConsumed]);

  const statusOptions = useMemo(
    () => STATUS_OPTION_KEYS.map((item) => ({ id: item.id, label: t(item.labelKey) })),
    [t],
  );

  const DATES_PAGE_SIZE = 20;

  // Row colors + Potražuje: stored paid / partial amounts on each date.
  const calculations = useMemo(
    () => calculate(events, payments, settings, null, { mode: financeMode, userId }),
    [events, payments, settings, financeMode, userId],
  );

  const bandRows = useMemo(() => {
    if (!activeBandId || activeBandId === allBandsId) return calculations.rows;
    return calculations.rows.filter((row) => String(row.bandId) === String(activeBandId));
  }, [calculations.rows, activeBandId, allBandsId]);

  const bandsById = useMemo(() => new Map(bands.map((band) => [band.id, band])), [bands]);
  const eventsById = useMemo(
    () => new Map(calculations.rows.map((row) => [Number(row.id), row])),
    [calculations.rows],
  );

  const availableYears = useMemo(() => {
    const years = new Set();
    for (const row of bandRows) {
      if (!isFinanceDueRow(row)) continue;
      const year = yearFromDate(row.date, row.parsedDate);
      if (year != null) years.add(year);
    }
    for (const payment of payments) {
      if (activeBandId && activeBandId !== allBandsId && String(payment.bandId) !== String(activeBandId)) {
        continue;
      }
      const year = yearFromDate(payment.date);
      if (year != null) years.add(year);
    }
    if (years.size === 0) years.add(new Date().getFullYear());
    return [...years].sort((a, b) => a - b);
  }, [bandRows, payments, activeBandId, allBandsId]);

  useEffect(() => {
    if (!availableYears.includes(viewYear)) {
      setViewYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, viewYear]);

  const yearOptions = useMemo(
    () => availableYears.map((year) => ({ id: year, label: String(year) })),
    [availableYears],
  );

  const filteredRows = useMemo(() => {
    const filtered = bandRows.filter((row) => {
      if (!isFinanceDueRow(row)) return false;
      const year = yearFromDate(row.date, row.parsedDate);
      if (year !== viewYear) return false;
      return matchesFilters(row, search, statusFilter);
    });
    const direction = dateSort === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const aOk = a.hasDate && !Number.isNaN(a.parsedDate.getTime());
      const bOk = b.hasDate && !Number.isNaN(b.parsedDate.getTime());
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return (a.parsedDate.getTime() - b.parsedDate.getTime()) * direction;
    });
  }, [bandRows, search, statusFilter, viewYear, dateSort]);

  /** Uplate: payment log; expand a row to see stored date allocations. */
  const scopedPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (yearFromDate(payment.date) !== viewYear) return false;
      if (activeBandId && activeBandId !== allBandsId && String(payment.bandId) !== String(activeBandId)) {
        return false;
      }
      return true;
    });
  }, [payments, viewYear, activeBandId, allBandsId]);

  /**
   * Filtered Potražuje = sum of row remainders on held rows in view (matches slices of global claim).
   */
  const claimEur = useMemo(() => {
    const pastRows = bandRows.filter((row) => {
      if (!isFinanceDueRow(row)) return false;
      if (yearFromDate(row.date, row.parsedDate) !== viewYear) return false;
      return matchesFilters(row, search, "all");
    });
    return waterfallClaimEur(pastRows);
  }, [bandRows, viewYear, search]);

  useEffect(() => {
    if (statusFilter === "future" || statusFilter === "done") {
      setStatusFilter("all");
    }
  }, [statusFilter]);

  useEffect(() => {
    setListPage(0);
  }, [viewYear, statusFilter, search, activeBandId, dateSort, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / DATES_PAGE_SIZE));
  const safePage = Math.min(listPage, totalPages - 1);

  const visibleRows = useMemo(() => {
    const start = safePage * DATES_PAGE_SIZE;
    return filteredRows.slice(start, start + DATES_PAGE_SIZE);
  }, [filteredRows, safePage]);

  const visiblePayments = useMemo(() => {
    const direction = dateSort === "desc" ? -1 : 1;
    return [...scopedPayments].sort((a, b) => {
      const aParsed = parseDate(a.date);
      const bParsed = parseDate(b.date);
      const aOk = !Number.isNaN(aParsed.getTime());
      const bOk = !Number.isNaN(bParsed.getTime());
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return (aParsed.getTime() - bParsed.getTime()) * direction;
    });
  }, [scopedPayments, dateSort]);

  const selectedRow = useMemo(
    () => bandRows.find((row) => row.id === selectedId) || null,
    [bandRows, selectedId],
  );

  useEffect(() => {
    if (!selectedRow) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setSelectedId(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRow]);

  return (
    <div className="raspored finansije">
      <PageHeader title={t("report.title")} onBack={onBack} />

      <header className="raspored-bar finansije-toolbar">
        <div className="raspored-tools raspored-tools-start" aria-label={t("report.filters")}>
          {canUseBandMode ? (
            <button
              type="button"
              className={`raspored-icon-btn finance-mode-btn ${financeMode === "band" ? "is-active-filter" : ""}`}
              aria-pressed={financeMode === "band"}
              aria-label={financeMode === "band" ? t("report.bandModeOn") : t("report.bandModeOff")}
              title={
                financeMode === "band" ? t("report.bandModeTitleOn") : t("report.bandModeTitleOff")
              }
              onClick={() => onFinanceModeChange?.(financeMode === "band" ? "member" : "band")}
            >
              <BandModeIcon />
            </button>
          ) : null}
          {activeTab === "dates" ? (
            <MenuSelect
              label={t("report.status")}
              icon={<StatusFilterIcon />}
              value={statusFilter}
              options={statusOptions}
              onChange={setStatusFilter}
            />
          ) : null}
          <button
            type="button"
            className={`raspored-icon-btn raspored-sort-btn ${dateSort === "asc" ? "is-asc" : "is-desc"}`}
            aria-label={dateSort === "desc" ? t("report.sortDescAria") : t("report.sortAscAria")}
            title={dateSort === "desc" ? t("report.sortDesc") : t("report.sortAsc")}
            onClick={() => setDateSort((value) => (value === "desc" ? "asc" : "desc"))}
          >
            <SortArrowIcon />
          </button>
        </div>

        <div className="finansije-year-cluster">
          <label className="finansije-year-select-wrap">
            <span className="sr-only">{t("report.year")}</span>
            <FieldSelect
              id="financeYear"
              label={t("report.year")}
              className="finansije-year-field"
              value={viewYear}
              options={yearOptions}
              onChange={(id) => setViewYear(Number(id))}
            />
          </label>
        </div>

      </header>

      <div className="finansije-year-meta-bar">
        {activeTab === "dates" && claimEur > 0 && onBulkPay ? (
          <button
            type="button"
            className="finansije-bulk-pay-btn btn-primary"
            disabled={bulkPayBusy}
            title={t("report.bulkPayTitle")}
            onClick={() => setBulkPayOpen(true)}
          >
            {bulkPayBusy ? "…" : t("report.bulkPay")}
          </button>
        ) : null}
        <span className="finansije-year-meta">
          {financeMode === "band" ? <em className="finansije-mode-tag">{t("report.bandModeTag")}</em> : null}
          <span
            className="finansije-meta-item finansije-meta-owed"
            title={t("report.claimTitle")}
          >
            <span className="finansije-meta-label">{t("report.claim")}</span>
            <strong>{formatEur(claimEur)}</strong>
          </span>
        </span>
      </div>

      <div className="finansije-tabs" role="tablist" aria-label={t("report.tabs")}>
        <button
          type="button"
          role="tab"
          className={`finansije-tab ${activeTab === "dates" ? "is-active" : ""}`}
          aria-selected={activeTab === "dates"}
          onClick={() => setActiveTab("dates")}
        >
          {t("report.tabDates")}
        </button>
        <button
          type="button"
          role="tab"
          className={`finansije-tab ${activeTab === "payments" ? "is-active" : ""}`}
          aria-selected={activeTab === "payments"}
          onClick={() => setActiveTab("payments")}
        >
          {t("report.tabPayments")}
        </button>
      </div>

      {activeTab === "dates" ? (
        <section className="raspored-panel finansije-panel-full" aria-label={t("report.tabDates")} role="tabpanel">
          {loading && events.length === 0 ? (
            <RasporedSkeleton variant="finance" />
          ) : filteredRows.length === 0 ? (
            <p className="raspored-empty">{t("report.emptyYear", { year: viewYear })}</p>
          ) : (
            <ul className="raspored-list">
              {visibleRows.map((row) => {
                const band = bandsById.get(row.bandId);
                const bandLabel = financeBandLabel(band, row, t);
                const color = resolveBandColor(band, row.bandId || bandLabel);
                const dateParts = formatScheduleDateParts(row.date);
                const financeDue = isFinanceDueRow(row);
                const isSettled = financeDue && row.paymentClass === "paid";
                const isLive = Boolean(row.hasDate && !row.done);
                const owed = financeDue ? financeRemainingEur(row) : 0;
                const rowPaying = payingEventId === row.id;
                const showPay = Boolean(financeDue && !isSettled && owed > 0 && onPayEvent);
                const showAmount = Boolean(financeDue && !isSettled && owed > 0);
                const hasFinanceTrail = isSettled || showAmount || showPay;
                return (
                  <li
                    key={row.id}
                    className={`raspored-row raspored-row-finance ${isSettled ? "is-finance-settled" : ""}${isLive ? " is-live" : ""}${hasFinanceTrail ? " has-finance-trail" : ""}`}
                    style={color ? { "--band-accent": color } : undefined}
                  >
                    <button
                      type="button"
                      className="raspored-row-button raspored-row-open"
                      onClick={() => {
                        if (isLive && onOpenLiveEvent) {
                          onOpenLiveEvent(row.id);
                          return;
                        }
                        setSelectedId(row.id);
                      }}
                      aria-label={
                        isLive
                          ? t("schedule.openEvent", {
                              label: `${row.date || ""} ${row.city || ""} ${bandLabel}`.trim(),
                            })
                          : t("report.detail", {
                              label: `${row.date || ""} ${row.city || ""} ${bandLabel}`.trim(),
                            })
                      }
                    >
                      <time className="raspored-date" dateTime={dateParts.dateTime || undefined}>
                        <span className="raspored-date-day">{dateParts.day}</span>
                        <span className="raspored-date-month">{dateParts.month}</span>
                      </time>
                      <div className="raspored-main">
                        <strong className="raspored-city">{row.city || "—"}</strong>
                        {bandLabel ? <span className="raspored-band">{bandLabel}</span> : null}
                      </div>
                    </button>
                    <div className="finansije-row-trail">
                      {isSettled ? (
                        <span
                          className="finansije-settled-mark"
                          title={t("report.payPaid")}
                          aria-label={t("report.payPaid")}
                        >
                          <PaidDoubleCheckIcon />
                        </span>
                      ) : (
                        <>
                          {showAmount ? (
                            <span
                              className="finansije-row-amount raspored-fee raspored-fee-unpaid"
                              title={t("report.payBtnTitle", { amount: formatEur(owed) })}
                            >
                              {formatEur(owed)}
                            </span>
                          ) : (
                            <span className="finansije-row-amount is-empty" aria-hidden="true" />
                          )}
                          <div className="finansije-row-slot finansije-row-slot-pay">
                            {showPay ? (
                              <button
                                type="button"
                                className="finansije-pay-btn"
                                disabled={Boolean(payingEventId)}
                                aria-label={t("report.payBtnAria", { amount: formatEur(owed) })}
                                title={t("report.payBtnTitle", { amount: formatEur(owed) })}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onPayEvent(row.id, row.bandId);
                                }}
                              >
                                {rowPaying ? (
                                  "…"
                                ) : (
                                  <>
                                    <SettlePayIcon />
                                    {t("report.payBtn")}
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="finansije-row-slot-spacer" aria-hidden="true" />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="finansije-row-slot finansije-row-slot-menu">
                      <div className="raspored-actions">
                        <FinanceRowMenu
                          onOpenDetail={() => setSelectedId(row.id)}
                          onOpenHistory={() => setHistoryRow(row)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="raspored-panel finansije-panel-full" aria-label={t("report.tabPayments")} role="tabpanel">
          {loading && payments.length === 0 ? (
            <RasporedSkeleton variant="pay" rows={5} />
          ) : visiblePayments.length === 0 ? (
            <p className="raspored-empty">{t("report.emptyPayments", { year: viewYear })}</p>
          ) : (
            <ul className="raspored-list">
              {visiblePayments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  eventsById={eventsById}
                  expanded={Number(expandedPaymentId) === Number(payment.id)}
                  onToggle={() =>
                    setExpandedPaymentId((current) =>
                      Number(current) === Number(payment.id) ? null : payment.id,
                    )
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === "dates" && filteredRows.length > DATES_PAGE_SIZE ? (
        <div className="raspored-pagination" aria-label={t("report.pages")}>
          <button
            type="button"
            className="finansije-year-btn finansije-page-btn"
            disabled={safePage <= 0}
            onClick={() => setListPage((page) => Math.max(0, page - 1))}
            aria-label={t("report.prevPage")}
          >
            <ChevronLeftIcon />
          </button>
          <span className="raspored-pagination-label">
            {safePage + 1} / {totalPages}
            <small> {t("report.dateCountYear", { count: filteredRows.length, year: viewYear })}</small>
          </span>
          <button
            type="button"
            className="finansije-year-btn finansije-page-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => setListPage((page) => Math.min(totalPages - 1, page + 1))}
            aria-label={t("report.nextPage")}
          >
            <ChevronRightIcon />
          </button>
        </div>
      ) : null}

      {selectedRow ? (
        <FinanceDetailModal
          row={selectedRow}
          band={bandsById.get(selectedRow.bandId)}
          rate={selectedRow.rate || calculations.rate}
          financeMode={financeMode}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onPayLine={onPayLine}
          payingLineKey={payingLineKey}
        />
      ) : null}

      {historyRow ? (
        <FinanceHistoryModal
          row={historyRow}
          band={bandsById.get(historyRow.bandId)}
          onClose={() => setHistoryRow(null)}
        />
      ) : null}

      {bulkPayOpen ? (
        <BulkPayModal
          amount={bulkAmount}
          currency={bulkCurrency}
          exchangeRate={settings?.exchangeRate}
          busy={bulkPayBusy}
          onAmountChange={setBulkAmount}
          onCurrencyChange={setBulkCurrency}
          onClose={() => setBulkPayOpen(false)}
          onSubmit={async () => {
            const ok = await onBulkPay?.({ amount: bulkAmount, currency: bulkCurrency });
            if (ok) {
              setBulkPayOpen(false);
              setBulkAmount("");
            }
          }}
        />
      ) : null}
    </div>
  );
}

function FinanceDetailModal({
  row,
  band,
  rate,
  financeMode = "member",
  userId = "",
  onClose,
  onPayLine,
  payingLineKey = "",
}) {
  const t = useT();
  const isBandMode = financeMode === "band";
  const name = band?.name || row.bandName || "";
  const color = resolveBandColor(band, row.bandId || name);
  const detailLines = [...(Array.isArray(row.financeLines) ? row.financeLines : [])].sort((a, b) => {
    const rank = (line) => (line.lineKind === "expense" ? 1 : 0);
    return rank(a) - rank(b);
  });
  const detailTotalEur = detailLines.length
    ? detailLines.reduce((sum, line) => sum + numberish(line.totalEur), 0)
    : numberish(row.totalEur);
  const remaining = financeRemainingEur(row);
  const bandPay = bandPaymentNote(row, detailTotalEur, remaining, t);
  const dateLabel = String(row.date || "").replace(/\.$/, "") || t("report.noDate");

  function linePayLabel(line) {
    if (line.lineKind === "expense") return line.label || t("report.expense");
    return line.label || t("report.fee");
  }

  function lineAmountLabel(line) {
    if (line.lineKind === "expense" && line.item) return formatExpenseAmount(line.item, rate);
    return formatEur(numberish(line.totalEur));
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel finance-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="financeDetailTitle"
      >
        <header className="finance-detail-head">
          <div>
            <p className="finance-detail-kicker">{t("report.financeDetail")}</p>
            <h2 id="financeDetailTitle">
              {dateLabel}
              {row.city ? ` — ${row.city}` : ""}
            </h2>
            {name ? (
              <p className="finance-detail-bandline">
                <span className="band-chip" style={{ backgroundColor: color }} title={name} aria-hidden="true">
                  {bandInitials(name)}
                </span>
                <span>{name}</span>
              </p>
            ) : null}
          </div>
          <button type="button" className="raspored-icon-btn" onClick={onClose} aria-label={t("common.close")} title={t("common.close")}>
            <CloseIcon />
          </button>
        </header>

        <FadeScroll viewportClassName="finance-detail-body">
          <section className="finance-detail-section">
            <p className={`finance-detail-status finance-detail-status-${row.paymentClass || "future"}`}>
              {payStatusLabel(row, t)}
              {isFinanceDueRow(row) && remaining > 0 ? t("report.remains", { amount: formatEur(remaining) }) : null}
            </p>
          </section>

          <section className="finance-detail-section">
            <h3>{isBandMode ? t("report.bandCalc") : t("report.myCalc")}</h3>
            <ul className="finance-detail-lines finance-detail-lines-payable">
              {detailLines.length ? (
                detailLines.map((line) => {
                  const lineKey = financeLineKey(line.eventId, line.lineKind, line.expenseKey);
                  const lineOwed = financeLineRemainingEur(line);
                  const linePaid = numberish(line.paidEur);
                  const isPaid = line.lineClass === "paid";
                  const isPartial = line.lineClass === "partial";
                  return (
                    <li key={lineKey} className={`finance-detail-line-${line.lineClass || "unpaid"}`}>
                      <div className="finance-detail-line-main">
                        <span>
                          {linePayLabel(line)}
                          {isBandMode && line.item?.payeeName ? (
                            <small className="finance-detail-payee"> · {line.item.payeeName}</small>
                          ) : null}
                        </span>
                        <strong className="finance-detail-line-amount">{lineAmountLabel(line)}</strong>
                      </div>
                      {isFinanceDueRow(row) ? (
                        <div className="finance-detail-line-meta">
                          {isPaid ? (
                            <>
                              <span className="finance-detail-line-status">{t("report.payPaid")}</span>
                              <div className="finance-detail-line-pay-slot">
                                <span className="finansije-paid-badge is-compact">{t("report.paidBadge")}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="finance-detail-line-status">
                                {isPartial
                                  ? t("report.linePartial", {
                                      paid: formatEur(linePaid),
                                      total: formatEur(line.totalEur),
                                    })
                                  : t("report.lineUnpaid")}
                                {lineOwed > 0 ? t("report.remains", { amount: formatEur(lineOwed) }) : null}
                              </span>
                              <div className="finance-detail-line-pay-slot">
                                {lineOwed > 0 && onPayLine ? (
                                  <button
                                    type="button"
                                    className="finansije-pay-btn is-compact"
                                    disabled={Boolean(payingLineKey)}
                                    onClick={() =>
                                      onPayLine(row.id, row.bandId, line.lineKind, line.expenseKey || "")
                                    }
                                  >
                                    {payingLineKey === lineKey ? (
                                      "…"
                                    ) : (
                                      t("report.payBtn")
                                    )}
                                  </button>
                                ) : (
                                  <span className="finansije-row-slot-spacer" aria-hidden="true" />
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })
              ) : (
                <li className="finance-detail-empty">{t("report.noAmounts")}</li>
              )}
            </ul>
          </section>

          {isFinanceDueRow(row) ? (
            <section className="finance-detail-section">
              <h3>{t("report.payment")}</h3>
              <p className={`finance-detail-paynote finance-detail-paynote-${bandPay.kind}`}>
                {bandPay.text}
              </p>
            </section>
          ) : null}

          <section className="finance-detail-section">
            <ul className="finance-detail-lines">
              <li className="is-total">
                <span>{t("report.total")}</span>
                <strong>{formatEur(detailTotalEur)}</strong>
              </li>
            </ul>
          </section>
        </FadeScroll>
      </div>
    </div>
  );
}

function filterMyExpenseItems(items, userId) {
  return (items || []).filter((item) => {
    if (String(item?.payeeKind || "").toLowerCase() !== "member") return false;
    if (!item.payeeUserId) return true;
    return userId && String(item.payeeUserId) === String(userId);
  });
}

function sumExpensesEur(items, rate) {
  return memberPayeeExpenseEur(items, rate) + sumNonMemberExpensesEur(items, rate);
}

function sumNonMemberExpensesEur(items, rate) {
  const safeRate = rate > 0 ? rate : 116.5;
  return (items || []).reduce((sum, item) => {
    if (String(item?.payeeKind || "").toLowerCase() === "member") return sum;
    const amount = numberish(item.amount);
    if (amount <= 0) return sum;
    return sum + (String(item.currency || "EUR").toUpperCase() === "RSD" ? amount / safeRate : amount);
  }, 0);
}

function formatExpenseAmount(item, rate) {
  const amount = numberish(item.amount);
  if (String(item.currency || "EUR").toUpperCase() === "RSD") {
    return (
      <>
        <span>{formatRsd(amount)}</span>
        <small>({formatEur(amount / (rate || 1))})</small>
      </>
    );
  }
  if (item.currency && item.currency !== "EUR") {
    return `${formatNumberish(amount)} ${item.currency}`;
  }
  return formatEur(amount);
}

function numberish(value) {
  return numberValue(value);
}

function formatNumberish(value) {
  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(numberish(value));
}

/** Short note: did the band receive money for this date (not a full payment ledger). */
function bandPaymentNote(row, totalEur, remaining, t) {
  if (!isFinanceDueRow(row) || row.paymentClass === "unpaid" || row.paymentClass === "future" || row.paymentClass === "none") {
    return { kind: "none", text: t("report.noPayments") };
  }

  if (row.paymentClass === "paid") {
    return {
      kind: "paid",
      text: t("report.paidFull", { amount: formatEur(totalEur) }),
    };
  }

  if (row.paymentClass === "partial") {
    const paid = Math.max(0, totalEur - remaining);
    return {
      kind: "partial",
      text: t("report.paidPartial", { paid: formatEur(paid), total: formatEur(totalEur) }),
    };
  }

  return { kind: "none", text: t("report.noPayments") };
}

function yearFromDate(value, parsed) {
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : parseDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function matchesFilters(row, search, status) {
  const query = search.trim().toLowerCase();
  const haystack = [row.date, row.city, row.venue, row.bandName].join(" ").toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (status === "paid") return row.paymentClass === "paid";
  if (status === "unpaid") return row.paymentClass !== "paid";
  return true;
}

function payStatusLabel(row, t) {
  if (!isFinanceDueRow(row) || !row.done) return t("report.payOpen");
  if (row.paymentClass === "paid") return t("report.payPaid");
  if (row.paymentClass === "partial") return t("report.payPartial");
  if (row.paymentClass === "unpaid") return t("report.payUnpaid");
  return t("report.payOpen");
}

function financeBandLabel(band, row, t) {
  const name = band?.name || row.bandName || "";
  if (!name) return "";
  if (band?.kind === "personal") return `${name} ${t("event.personalSuffix")}`;
  return name;
}

function formatPaymentRate(rate) {
  const parsed = Number(rate);
  if (!(parsed > 0)) return "";
  return parsed.toLocaleString("sr-RS", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
}

function paymentAllocationLines(payment, eventsById, t) {
  const lines = [...(payment?.allocations || [])]
    .filter((item) => Number(item.amountEur) > 0)
    .sort((a, b) => {
      const aEvent = eventsById.get(Number(a.eventId));
      const bEvent = eventsById.get(Number(b.eventId));
      const aTime = aEvent?.parsedDate?.getTime?.() || 0;
      const bTime = bEvent?.parsedDate?.getTime?.() || 0;
      if (aTime !== bTime) return aTime - bTime;
      return Number(a.eventId) - Number(b.eventId);
    });

  return lines.map((item) => {
    const event = eventsById.get(Number(item.eventId));
    const parts = event ? formatScheduleDateParts(event.date) : null;
    const city = String(event?.city || "").trim();
    const venue = String(event?.venue || "").trim();
    const place = [city, venue].filter(Boolean).join(" · ");
    const isExpense = String(item.lineKind || "event") !== "event";
    return {
      key: `${item.eventId}:${item.lineKind || "event"}:${item.expenseKey || ""}`,
      day: parts?.day || "—",
      month: parts?.month || "",
      label: place || (event ? t("report.paymentAllocMissing") : t("report.paymentAllocMissing")),
      expense: isExpense,
      amount: formatEur(item.amountEur),
    };
  });
}

function PaymentRow({ payment, eventsById, expanded, onToggle }) {
  const t = useT();
  const [rateOpen, setRateOpen] = useState(false);
  const rateRef = useRef(null);
  const dateParts = formatScheduleDateParts(payment.date);
  const rateText = formatPaymentRate(payment.exchangeRate);
  const rateLabel = rateText
    ? t("report.paymentRateNote", { rate: rateText })
    : t("report.paymentRateMissing");
  const allocs = paymentAllocationLines(payment, eventsById, t);

  useEffect(() => {
    if (!rateOpen) return undefined;
    function onPointerDown(event) {
      if (!rateRef.current?.contains(event.target)) setRateOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setRateOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rateOpen]);

  return (
    <li className={`raspored-row raspored-row-pay ${expanded ? "is-open" : ""}`}>
      <button
        type="button"
        className="raspored-row-button raspored-row-open"
        aria-expanded={expanded}
        aria-label={t("report.paymentOpenAria")}
        onClick={onToggle}
      >
        <time className="raspored-date" dateTime={dateParts.dateTime || undefined}>
          <span className="raspored-date-day">{dateParts.day}</span>
          <span className="raspored-date-month">{dateParts.month}</span>
        </time>
        <span className="raspored-fee">
          {Number(payment.amount || 0).toLocaleString("sr-RS")} {payment.currency || "EUR"}
        </span>
      </button>
      <div className="finansije-payment-info-wrap" ref={rateRef}>
        <button
          type="button"
          className={`raspored-icon-btn ${rateOpen ? "is-active-filter" : ""}`}
          aria-label={t("report.paymentRateAria")}
          aria-expanded={rateOpen}
          title={rateLabel}
          onClick={(event) => {
            event.stopPropagation();
            setRateOpen((current) => !current);
          }}
        >
          <InfoIcon />
        </button>
        {rateOpen ? (
          <div className="finansije-payment-rate-pop" role="status">
            {rateLabel}
          </div>
        ) : null}
      </div>
      {expanded ? (
        <ul className="finansije-payment-allocs">
          {allocs.length === 0 ? (
            <li className="finansije-payment-alloc-empty">{t("report.paymentNoAllocations")}</li>
          ) : (
            allocs.map((line) => (
              <li key={line.key} className="finansije-payment-alloc">
                <time className="finansije-payment-alloc-date">
                  <span className="raspored-date-day">{line.day}</span>
                  <span className="raspored-date-month">{line.month}</span>
                </time>
                <span className="finansije-payment-alloc-place">
                  {line.label}
                  {line.expense ? ` · ${t("report.paymentAllocExpense")}` : ""}
                </span>
                <span className="finansije-payment-alloc-amount">{line.amount}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

function BulkPayModal({
  amount,
  currency,
  exchangeRate,
  busy,
  onAmountChange,
  onCurrencyChange,
  onClose,
  onSubmit,
}) {
  const t = useT();

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel finansije-bulk-pay-panel" role="dialog" aria-modal="true" aria-labelledby="bulk-pay-title">
        <header className="modal-head">
          <h2 id="bulk-pay-title">{t("report.bulkPay")}</h2>
          <button type="button" className="modal-close" aria-label={t("report.bulkPayCancel")} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="finansije-bulk-pay-body">
          <p className="finansije-bulk-pay-note">
            {t("report.bulkPayRateNote", { rate: exchangeRate || "—" })}
          </p>
          <label className="finansije-bulk-pay-field">
            <span>{t("report.bulkPayAmount")}</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </label>
          <label className="finansije-bulk-pay-field">
            <span>{t("report.bulkPayCurrency")}</span>
            <select value={currency} onChange={(event) => onCurrencyChange(event.target.value)}>
              <option value="EUR">EUR</option>
              <option value="RSD">RSD</option>
            </select>
          </label>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            {t("report.bulkPayCancel")}
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={onSubmit}>
            {busy ? "…" : t("report.bulkPaySubmit")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FinanceRowMenu({ onOpenDetail, onOpenHistory }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const idleTimerRef = useRef(0);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const IDLE_MS = 5000;

    function clearIdle() {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = 0;
    }

    function armIdle() {
      clearIdle();
      idleTimerRef.current = window.setTimeout(() => setOpen(false), IDLE_MS);
    }

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        return;
      }
      armIdle();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (rootRef.current?.contains(event.target)) armIdle();
    }

    armIdle();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearIdle();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`date-row-menu ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`date-row-menu-trigger ${open ? "is-open" : ""}`}
        aria-label={t("report.financeActions")}
        title={t("schedule.more")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MoreDotsIcon />
      </button>
      {open ? (
        <ul className="date-row-menu-list" id={menuId} role="menu" aria-label={t("report.financeActions")}>
          <li role="none">
            <button
              type="button"
              className="date-row-menu-item"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onOpenHistory?.();
              }}
            >
              <HistoryIcon />
              {t("finance.auditOpen")}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              className="date-row-menu-item"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onOpenDetail?.();
              }}
            >
              {t("report.calcDetail")}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function MoreDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="6" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-2.64-6.36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BandModeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 7h16M4 12h10M4 17h13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="18.5" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function StatusFilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SortArrowIcon() {
  return (
    <svg className="raspored-sort-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 5v14M12 5l-4 4M12 5l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" />
    </svg>
  );
}
