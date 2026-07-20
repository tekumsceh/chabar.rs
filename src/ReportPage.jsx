import { useEffect, useMemo, useState } from "react";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import { calculate, formatEur, formatRsd, formatScheduleDateParts, parseDate, unpaidClaimEur } from "./calculations.js";
import MenuSelect from "./MenuSelect.jsx";
import RasporedSkeleton from "./RasporedSkeleton.jsx";

const statusOptions = [
  { id: "all", label: "Sve stavke" },
  { id: "done", label: "Samo dospele" },
  { id: "future", label: "Buduće" },
  { id: "unpaid", label: "Dospele neplaćene" },
  { id: "paid", label: "Plaćene" },
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
}) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState("dates");
  const [selectedId, setSelectedId] = useState(null);

  const bandOptions = useMemo(
    () => [
      { id: allBandsId, label: "Svi bendovi", icon: <BandIcon /> },
      ...bands.map((band) => {
        const color = resolveBandColor(band, band.id);
        return {
          id: band.id,
          label: band.kind === "personal" ? `${band.name} (lično)` : band.name,
          icon: (
            <span className="band-chip menu-band-chip" style={{ backgroundColor: color }} title={band.name}>
              {bandInitials(band.name)}
            </span>
          ),
        };
      }),
    ],
    [bands, allBandsId],
  );

  // Waterfall always runs on the full loaded ledger (member: all bands; band-mode: that band).
  // Band dropdown only scopes the list + Potražuje — never re-runs calculate with a partial payment pool.
  const calculations = useMemo(
    () => calculate(events, payments, settings),
    [events, payments, settings],
  );

  const bandRows = useMemo(() => {
    if (!activeBandId || activeBandId === allBandsId) return calculations.rows;
    return calculations.rows.filter((row) => row.bandId === activeBandId);
  }, [calculations.rows, activeBandId, allBandsId]);

  /** Potražuje for the selected band + year (statuses still come from the full-ledger waterfall). */
  const claimEur = useMemo(() => {
    const yearRows = bandRows.filter((row) => yearFromDate(row.date, row.parsedDate) === viewYear);
    return unpaidClaimEur(yearRows);
  }, [bandRows, viewYear]);

  const bandsById = useMemo(() => new Map(bands.map((band) => [band.id, band])), [bands]);

  const availableYears = useMemo(() => {
    const years = new Set();
    for (const row of bandRows) {
      const year = yearFromDate(row.date, row.parsedDate);
      if (year != null) years.add(year);
    }
    for (const payment of payments) {
      const year = yearFromDate(payment.date);
      if (year != null) years.add(year);
    }
    if (years.size === 0) years.add(new Date().getFullYear());
    return [...years].sort((a, b) => a - b);
  }, [bandRows, payments]);

  useEffect(() => {
    if (!availableYears.includes(viewYear)) {
      setViewYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, viewYear]);

  const yearIndex = availableYears.indexOf(viewYear);
  const prevYear = yearIndex > 0 ? availableYears[yearIndex - 1] : null;
  const nextYear = yearIndex >= 0 && yearIndex < availableYears.length - 1 ? availableYears[yearIndex + 1] : null;

  const visibleRows = useMemo(
    () =>
      bandRows.filter((row) => {
        const year = yearFromDate(row.date, row.parsedDate);
        if (year !== viewYear) return false;
        return matchesFilters(row, search, statusFilter);
      }),
    [bandRows, search, statusFilter, viewYear],
  );

  const visiblePayments = useMemo(
    () => payments.filter((payment) => yearFromDate(payment.date) === viewYear),
    [payments, viewYear],
  );

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
      <header className="raspored-bar">
        <div className="raspored-tools raspored-tools-start" aria-label="Filteri finansija">
          <MenuSelect
            label="Bend"
            icon={<BandIcon />}
            value={activeBandId}
            options={bandOptions}
            onChange={onBandChange}
          />
          {canUseBandMode ? (
            <button
              type="button"
              className={`raspored-icon-btn finance-mode-btn ${financeMode === "band" ? "is-active-filter" : ""}`}
              aria-pressed={financeMode === "band"}
              aria-label={financeMode === "band" ? "Bend mod uključen" : "Bend mod isključen"}
              title={
                financeMode === "band"
                  ? "Bend mod: svi članovi i zajednički troškovi"
                  : "Član mod: samo tvoji iznosi — klik za bend mod"
              }
              onClick={() => onFinanceModeChange?.(financeMode === "band" ? "member" : "band")}
            >
              <BandModeIcon />
            </button>
          ) : null}
          <MenuSelect
            label="Status"
            icon={<StatusFilterIcon />}
            value={statusFilter}
            options={statusOptions}
            onChange={setStatusFilter}
          />
        </div>

        <div className="finansije-year-cluster" aria-label="Godina">
          <button
            type="button"
            className="finansije-year-btn"
            disabled={!prevYear}
            onClick={() => prevYear && setViewYear(prevYear)}
            aria-label={prevYear ? `Godina ${prevYear}` : "Nema ranije godine"}
            title={prevYear ? String(prevYear) : undefined}
          >
            ←
          </button>
          <strong className="finansije-year-label">{viewYear}</strong>
          <button
            type="button"
            className="finansije-year-btn"
            disabled={!nextYear}
            onClick={() => nextYear && setViewYear(nextYear)}
            aria-label={nextYear ? `Godina ${nextYear}` : "Nema kasnije godine"}
            title={nextYear ? String(nextYear) : undefined}
          >
            →
          </button>
        </div>

        <div className="raspored-tools" aria-label="Alati finansija">
          <div className={`raspored-search ${searchOpen || search ? "is-open" : ""}`}>
            <button
              type="button"
              className="raspored-icon-btn"
              aria-label="Pretraga"
              title="Pretraga"
              onClick={() => setSearchOpen((open) => !open)}
            >
              <SearchIcon />
            </button>
            {searchOpen || search ? (
              <input
                id="financeSearch"
                name="financeSearch"
                type="search"
                placeholder="mesto, lokal..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onBlur={() => {
                  if (!search.trim()) setSearchOpen(false);
                }}
                autoComplete="off"
                autoFocus={searchOpen && !search}
              />
            ) : null}
          </div>

          <div className="finansije-tools-slot" aria-hidden="true">
            <button type="button" className="raspored-icon-btn" disabled title="Uskoro" aria-label="Alat (uskoro)">
              <PlusIcon />
            </button>
            <button type="button" className="raspored-icon-btn" disabled title="Uskoro" aria-label="Alat (uskoro)">
              <WrenchIcon />
            </button>
          </div>
        </div>
      </header>

      <div className="finansije-year-meta-bar">
        <span className="finansije-year-meta">
          {financeMode === "band" ? <em className="finansije-mode-tag">Bend mod</em> : null}
          Potražuje <strong>{formatEur(claimEur)}</strong>
        </span>
      </div>

      <div className="finansije-tabs" role="tablist" aria-label="Finansije sekcije">
        <button
          type="button"
          role="tab"
          className={`finansije-tab ${activeTab === "dates" ? "is-active" : ""}`}
          aria-selected={activeTab === "dates"}
          onClick={() => setActiveTab("dates")}
        >
          Datumi
        </button>
        <button
          type="button"
          role="tab"
          className={`finansije-tab ${activeTab === "payments" ? "is-active" : ""}`}
          aria-selected={activeTab === "payments"}
          onClick={() => setActiveTab("payments")}
        >
          Uplate
        </button>
      </div>

      {activeTab === "dates" ? (
        <section className="raspored-panel finansije-panel-full" aria-label="Datumi" role="tabpanel">
          {loading && events.length === 0 ? (
            <RasporedSkeleton variant="finance" />
          ) : visibleRows.length === 0 ? (
            <p className="raspored-empty">Nema stavki za {viewYear}.</p>
          ) : (
            <ul className="raspored-list">
              {visibleRows.map((row) => {
                const band = bandsById.get(row.bandId);
                const name = band?.name || row.bandName || "";
                const color = resolveBandColor(band, row.bandId || name);
                const dateParts = formatScheduleDateParts(row.date);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`raspored-row raspored-row-finance raspored-row-button ${row.done ? "is-past" : ""}`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <time className="raspored-date" dateTime={dateParts.dateTime || undefined}>
                        <span className="raspored-date-day">{dateParts.day}</span>
                        <span className="raspored-date-month">{dateParts.month}</span>
                      </time>
                      <div className="raspored-main">
                        <strong>{row.city || "—"}</strong>
                      </div>
                      <span
                        className="band-chip"
                        style={{ backgroundColor: color }}
                        title={name || "Bend"}
                        aria-label={name || "Bend"}
                      >
                        {bandInitials(name)}
                      </span>
                      <span
                        className={`pay-icon pay-icon-${row.done ? row.paymentClass : "future"}`}
                        title={payStatusLabel(row)}
                        aria-label={payStatusLabel(row)}
                      >
                        <DollarIcon />
                      </span>
                      <span className="raspored-fee">{row.hasDate ? formatEur(row.totalEur) : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="raspored-panel finansije-panel-full" aria-label="Uplate" role="tabpanel">
          {loading && payments.length === 0 ? (
            <RasporedSkeleton variant="pay" rows={5} />
          ) : visiblePayments.length === 0 ? (
            <p className="raspored-empty">Nema uplata za {viewYear}.</p>
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
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {selectedRow ? (
        <FinanceDetailModal
          row={selectedRow}
          band={bandsById.get(selectedRow.bandId)}
          rate={selectedRow.rate || calculations.rate}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function FinanceDetailModal({ row, band, rate, onClose }) {
  const name = band?.name || row.bandName || "";
  const color = resolveBandColor(band, row.bandId || name);
  const transportEur = rate > 0 ? row.transportRsd / rate : 0;
  const memberWages = Array.isArray(row.memberWages) ? row.memberWages.filter(Boolean) : [];
  const expenseItems = Array.isArray(row.expenseItems) ? row.expenseItems.filter(Boolean) : [];
  const honorarTotal = memberWages.length
    ? memberWages.reduce((sum, member) => sum + numberish(member.priceEur), 0)
    : numberish(row.priceEur);
  const honorarLabel = memberWages.length > 1 ? "Honorari" : "Honorar";
  const extraExpensesEur = expenseItems.reduce((sum, item) => {
    const amount = numberish(item.amount);
    return sum + (item.currency === "RSD" ? amount / (rate || 1) : amount);
  }, 0);
  const detailTotalEur = honorarTotal + transportEur + extraExpensesEur;
  const remaining =
    row.paymentClass === "partial" || row.paymentClass === "unpaid"
      ? numberish(row.paymentStatus)
      : row.paymentClass === "paid"
        ? 0
        : detailTotalEur;
  const bandPay = bandPaymentNote(row, detailTotalEur, remaining);

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
            <p className="finance-detail-kicker">Detalj termina</p>
            <h2 id="financeDetailTitle">
              {String(row.date || "").replace(/\.$/, "") || "Bez datuma"}
              {row.city ? ` — ${row.city}` : ""}
            </h2>
          </div>
          <button type="button" className="raspored-icon-btn" onClick={onClose} aria-label="Zatvori" title="Zatvori">
            <CloseIcon />
          </button>
        </header>

        <div className="finance-detail-body">
          <section className="finance-detail-section">
            <h3>Osnovno</h3>
            <dl className="finance-detail-grid">
              <div>
                <dt>Bend</dt>
                <dd className="finance-detail-band">
                  <span className="band-chip" style={{ backgroundColor: color }} title={name}>
                    {bandInitials(name)}
                  </span>
                  <span>{name || "—"}</span>
                </dd>
              </div>
              <div>
                <dt>Mesto</dt>
                <dd>{row.city || "—"}</dd>
              </div>
              <div>
                <dt>Lokal</dt>
                <dd>{row.venue || "—"}</dd>
              </div>
              <div>
                <dt>Napomena</dt>
                <dd>{row.note || "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className="finance-detail-status">
                  <span className={`pay-icon pay-icon-${row.done ? row.paymentClass : "future"}`}>
                    <DollarIcon />
                  </span>
                  {payStatusLabel(row)}
                  {row.done && remaining > 0 ? ` · ostaje ${formatEur(remaining)}` : null}
                </dd>
              </div>
            </dl>
          </section>

          <section className="finance-detail-section">
            <h3>Obračun</h3>
            <ul className="finance-detail-lines">
              <li className={memberWages.length > 1 ? "has-hover-tip" : ""}>
                <span
                  className={memberWages.length > 1 ? "finance-tip-trigger" : undefined}
                  tabIndex={memberWages.length > 1 ? 0 : undefined}
                >
                  {honorarLabel}
                  {memberWages.length > 1 ? (
                    <span className="finance-tip" role="tooltip">
                      {memberWages.map((member) => (
                        <span key={member.id || member.name} className="finance-tip-row">
                          <span>{member.name || "Član"}</span>
                          <strong>{formatEur(numberish(member.priceEur))}</strong>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <strong>{formatEur(honorarTotal)}</strong>
              </li>
              <li>
                <span>Prevoz</span>
                <strong>
                  {formatRsd(row.transportRsd)}
                  <small> ({formatEur(transportEur)})</small>
                </strong>
              </li>
              {expenseItems.map((item) => (
                <li key={item.id || item.label}>
                  <span>{item.label || "Trošak"}</span>
                  <strong>
                    {item.currency === "RSD"
                      ? formatRsd(numberish(item.amount))
                      : formatEur(numberish(item.amount))}
                    {item.currency === "RSD" ? (
                      <small> ({formatEur(numberish(item.amount) / (rate || 1))})</small>
                    ) : null}
                  </strong>
                </li>
              ))}
            </ul>
            {memberWages.length > 1 ? (
              <ul className="finance-detail-members" aria-label="Honorari po članu">
                {memberWages.map((member) => (
                  <li key={member.id || member.name}>
                    <span>{member.name || "Član"}</span>
                    <strong>{formatEur(numberish(member.priceEur))}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="finance-detail-section">
            <h3>Uplata bendu</h3>
            <p className={`finance-detail-paynote finance-detail-paynote-${bandPay.kind}`}>
              {bandPay.text}
            </p>
          </section>

          <section className="finance-detail-section">
            <ul className="finance-detail-lines">
              <li className="is-total">
                <span>Ukupno</span>
                <strong>{formatEur(detailTotalEur)}</strong>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function numberish(value) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Short note: did the band receive money for this date (not a full payment ledger). */
function bandPaymentNote(row, totalEur, remaining) {
  if (!row.done || row.paymentClass === "unpaid" || row.paymentClass === "future") {
    return { kind: "none", text: "Nema uplata za ovaj datum." };
  }

  if (row.paymentClass === "paid") {
    return {
      kind: "paid",
      text: `Datum je plaćen — ${formatEur(totalEur)}.`,
    };
  }

  if (row.paymentClass === "partial") {
    const paid = Math.max(0, totalEur - remaining);
    return {
      kind: "partial",
      text: `Datum je delimično plaćen — ${formatEur(paid)} od ${formatEur(totalEur)}.`,
    };
  }

  return { kind: "none", text: "Nema uplata za ovaj datum." };
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
  if (status === "done") return row.done;
  if (status === "future") return row.hasDate && !row.done;
  if (status === "paid") return row.paymentClass === "paid";
  if (status === "unpaid") return row.done && row.paymentClass !== "paid";
  return true;
}

function payStatusLabel(row) {
  if (!row.done) return "Otvoreno";
  if (row.paymentClass === "paid") return "Plaćeno";
  if (row.paymentClass === "partial") return "Delimično";
  if (row.paymentClass === "unpaid") return "Neplaćeno";
  return "Otvoreno";
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17l3 3 5.1-5.1a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.5-2.5 2.5-2.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M14.8 19c.4-2.2 1.8-3.5 3.7-3.5 1.2 0 2.2.5 2.9 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 3 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
