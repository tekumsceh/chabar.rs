import { useEffect, useId, useMemo, useRef, useState } from "react";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import {
  calculate,
  expectedFutureEur,
  financeExpenseItems,
  financeLineKey,
  financeLineRemainingEur,
  financeRemainingEur,
  formatEur,
  formatRsd,
  formatScheduleDateParts,
  memberPayeeExpenseEur,
  numberValue,
  waterfallClaimEur,
  parseDate,
} from "./calculations.js";
import FieldSelect from "./FieldSelect.jsx";
import MenuSelect from "./MenuSelect.jsx";
import BandFilterSelect from "./BandFilterSelect.jsx";
import RasporedSkeleton from "./RasporedSkeleton.jsx";
import FadeScroll from "./FadeScroll.jsx";
import PageHeader from "./PageHeader.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

const STATUS_OPTION_KEYS = [
  { id: "all", labelKey: "report.statusAll" },
  { id: "done", labelKey: "report.statusDone" },
  { id: "future", labelKey: "report.statusFuture" },
  { id: "unpaid", labelKey: "report.statusUnpaid" },
  { id: "paid", labelKey: "report.statusPaid" },
];

export default function ReportPage({
  events,
  payments,
  bands = [],
  activeBandId,
  allBandsId,
  onBandChange,
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

  // Row colors + Potražuje share one global payment waterfall (calculate).
  const calculations = useMemo(
    () => calculate(events, payments, settings, null, { mode: financeMode, userId }),
    [events, payments, settings, financeMode, userId],
  );

  const bandRows = useMemo(() => {
    if (!activeBandId || activeBandId === allBandsId) return calculations.rows;
    return calculations.rows.filter((row) => String(row.bandId) === String(activeBandId));
  }, [calculations.rows, activeBandId, allBandsId]);

  const bandsById = useMemo(() => new Map(bands.map((band) => [band.id, band])), [bands]);

  const availableYears = useMemo(() => {
    const years = new Set();
    for (const row of bandRows) {
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

  /** Uplate: same band tile + year as Datumi. */
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
   * Potražuje = unpaid remainders on past rows (band/year/search), after the
   * global uplate waterfall — not held minus scoped uplate (that breaks per band).
   */
  const claimEur = useMemo(() => {
    const pastRows = bandRows.filter((row) => {
      if (!row.done || !row.hasDate) return false;
      if (yearFromDate(row.date, row.parsedDate) !== viewYear) return false;
      return matchesFilters(row, search, "all");
    });
    return waterfallClaimEur(pastRows);
  }, [bandRows, viewYear, search]);

  /** Očekivano = future totals for year/band/search (not status). */
  const expectedEur = useMemo(() => {
    const futureRows = bandRows.filter((row) => {
      const year = yearFromDate(row.date, row.parsedDate);
      if (year !== viewYear) return false;
      if (!row.hasDate || row.done) return false;
      return matchesFilters(row, search, "all");
    });
    return expectedFutureEur(futureRows);
  }, [bandRows, viewYear, search]);

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
          <BandFilterSelect
            bands={bands}
            activeBandId={activeBandId}
            allBandsId={allBandsId}
            onSelectBand={onBandChange}
          />
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
        <span className="finansije-year-meta">
          {financeMode === "band" ? <em className="finansije-mode-tag">{t("report.bandModeTag")}</em> : null}
          <span
            className="finansije-meta-item finansije-meta-owed"
            title={t("report.claimTitle")}
          >
            <span className="finansije-meta-label">{t("report.claim")}</span>{" "}
            <strong>{formatEur(claimEur)}</strong>
          </span>
          <span className="finansije-meta-sep" aria-hidden="true">
            ·
          </span>
          <span className="finansije-meta-item finansije-meta-expected" title={t("report.expectedTitle")}>
            <span className="finansije-meta-label">{t("report.expected")}</span>{" "}
            <strong>{formatEur(expectedEur)}</strong>
          </span>
          {activeTab === "dates" && claimEur > 0 && onBulkPay ? (
            <>
              <span className="finansije-meta-sep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="finansije-bulk-pay-btn"
                disabled={bulkPayBusy}
                title={t("report.bulkPayTitle")}
                onClick={() => setBulkPayOpen(true)}
              >
                {bulkPayBusy ? "…" : t("report.bulkPay")}
              </button>
            </>
          ) : null}
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
                const amountTone = feeAmountTone(row);
                const isSettled = row.done && row.paymentClass === "paid";
                const owed = financeRemainingEur(row);
                const rowPaying = payingEventId === row.id;
                return (
                  <li
                    key={row.id}
                    className={`raspored-row raspored-row-finance ${isSettled ? "is-settled" : ""}`}
                    style={color ? { "--band-accent": color } : undefined}
                  >
                    <button
                      type="button"
                      className="raspored-row-button raspored-row-open"
                      onClick={() => setSelectedId(row.id)}
                      aria-label={t("report.detail", {
                        label: `${row.date || ""} ${row.city || ""} ${bandLabel}`.trim(),
                      })}
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
                      {row.done && row.paymentClass === "paid" ? (
                        <span className="finansije-paid-badge" title={t("report.payPaid")}>
                          {t("report.paidBadge")}
                        </span>
                      ) : null}
                      {row.done && owed > 0 && onPayEvent ? (
                        <button
                          type="button"
                          className="finansije-pay-btn"
                          disabled={Boolean(payingEventId)}
                          aria-label={t("report.payBtnAria", { amount: formatEur(owed) })}
                          title={formatEur(owed)}
                          onClick={(event) => {
                            event.stopPropagation();
                            onPayEvent(row.id, row.bandId);
                          }}
                        >
                          {rowPaying ? "…" : t("report.payBtn")}
                        </button>
                      ) : null}
                      <span
                        className={`finansije-row-amount raspored-fee raspored-fee-${amountTone}`}
                        title={
                          row.hasDate
                            ? `${payStatusLabel(row, t)} · ${formatEur(row.totalEur)}`
                            : undefined
                        }
                      >
                        {row.hasDate ? formatEurCeil(row.totalEur) : "—"}
                      </span>
                      <div className="raspored-actions">
                        <FinanceRowMenu
                          row={row}
                          owed={owed}
                          onOpenDetail={() => setSelectedId(row.id)}
                          onPay={() => onPayEvent?.(row.id, row.bandId)}
                          payDisabled={Boolean(payingEventId)}
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
              {visiblePayments.map((payment) => {
                const dateParts = formatScheduleDateParts(payment.date);
                return (
                  <li key={payment.id} className="raspored-row raspored-row-pay">
                    <time className="raspored-date" dateTime={dateParts.dateTime || undefined}>
                      <span className="raspored-date-day">{dateParts.day}</span>
                      <span className="raspored-date-month">{dateParts.month}</span>
                    </time>
                    <span className="raspored-fee">
                      {Number(payment.amount || 0).toLocaleString("sr-RS")} {payment.currency || "EUR"}
                      {String(payment.currency || "EUR").toUpperCase() === "RSD" && payment.exchangeRate ? (
                        <small className="finansije-payment-rate">
                          {" "}
                          · {t("report.paymentRateNote", { rate: payment.exchangeRate })}
                        </small>
                      ) : null}
                    </span>
                  </li>
                );
              })}
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
  const detailLines = Array.isArray(row.financeLines) ? row.financeLines : [];
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
              {row.done && remaining > 0 ? t("report.remains", { amount: formatEur(remaining) }) : null}
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
                        <strong>{lineAmountLabel(line)}</strong>
                      </div>
                      {row.done ? (
                        <div className="finance-detail-line-meta">
                          {isPaid ? (
                            <span className="finansije-paid-badge is-compact">{t("report.paidBadge")}</span>
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
                              {lineOwed > 0 && onPayLine ? (
                                <button
                                  type="button"
                                  className="finansije-pay-btn is-compact"
                                  disabled={Boolean(payingLineKey)}
                                  onClick={() =>
                                    onPayLine(row.id, row.bandId, line.lineKind, line.expenseKey || "")
                                  }
                                >
                                  {payingLineKey === lineKey ? "…" : t("report.payBtn")}
                                </button>
                              ) : null}
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

          {row.done ? (
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
        {formatRsd(amount)}
        <small> ({formatEur(amount / (rate || 1))})</small>
      </>
    );
  }
  if (item.currency && item.currency !== "EUR") {
    return `${formatNumberish(amount)} ${item.currency}`;
  }
  return formatEur(amount);
}

function numberish(value) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberish(value) {
  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(numberish(value));
}

/** Short note: did the band receive money for this date (not a full payment ledger). */
function bandPaymentNote(row, totalEur, remaining, t) {
  if (!row.done || row.paymentClass === "unpaid" || row.paymentClass === "future") {
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

/** List view: whole euros rounded up. Detail modal keeps exact formatEur(). */
function formatEurCeil(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return formatEur(0);
  return `${Math.ceil(n - Number.EPSILON).toLocaleString("sr-RS")} EUR`;
}

function matchesFilters(row, search, status) {
  const query = search.trim().toLowerCase();
  const haystack = [row.date, row.city, row.venue, row.bandName].join(" ").toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (status === "done") return row.done;
  if (status === "future") return row.hasDate && !row.done;
  if (status === "paid") return row.paymentClass === "paid";
  if (status === "unpaid") return row.done && row.paymentClass !== "paid";
  return true;
}

function payStatusLabel(row, t) {
  if (!row.done) return t("report.payOpen");
  if (row.paymentClass === "paid") return t("report.payPaid");
  if (row.paymentClass === "partial") return t("report.payPartial");
  if (row.paymentClass === "unpaid") return t("report.payUnpaid");
  return t("report.payOpen");
}

/** Amount color: paid green, partial yellow, held unpaid red, future/open brand. */
function feeAmountTone(row) {
  if (!row.done) return "open";
  if (row.paymentClass === "paid") return "paid";
  if (row.paymentClass === "partial") return "partial";
  return "unpaid";
}

function financeBandLabel(band, row, t) {
  const name = band?.name || row.bandName || "";
  if (!name) return "";
  if (band?.kind === "personal") return `${name} ${t("event.personalSuffix")}`;
  return name;
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

function FinanceRowMenu({ row, onOpenDetail, onPay, owed = 0, payDisabled = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const idleTimerRef = useRef(0);
  const menuId = useId();
  const needsPay = row.done && owed > 0;

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
          {needsPay ? (
            <li role="none">
              <button
                type="button"
                className="date-row-menu-item is-pay"
                role="menuitem"
                disabled={payDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onPay?.();
                }}
              >
                {t("report.payThisDate")}
                <small>{formatEur(owed)}</small>
              </button>
            </li>
          ) : null}
          {!row.done ? (
            <li role="none">
              <div className="date-row-menu-item is-status" role="menuitem" aria-disabled="true">
                {t("report.futureNotDue")}
              </div>
            </li>
          ) : null}
          {row.done && row.paymentClass === "paid" ? (
            <li role="none">
              <div className="date-row-menu-item is-status is-fee-set" role="menuitem" aria-disabled="true">
                {t("report.payPaid")}
              </div>
            </li>
          ) : null}
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
