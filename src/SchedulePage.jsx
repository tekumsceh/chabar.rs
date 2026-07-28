import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  formatScheduleDateParts,
  numberValue,
  parseDate,
  sameMonth,
  startOfToday,
  todayText,
} from "./calculations.js";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import { api } from "./api.js";
import { useConfirm } from "./confirmDialog.jsx";
import MenuSelect from "./MenuSelect.jsx";
import BandFilterSelect from "./BandFilterSelect.jsx";
import RasporedSkeleton from "./RasporedSkeleton.jsx";
import EventPage from "./EventPage.jsx";
import FadeScroll from "./FadeScroll.jsx";
import DateMonthPicker from "./DateMonthPicker.jsx";
import { QUICK_CREATE_CITIES } from "./quickCreateCities.js";
import { ownerBandLimit } from "../shared/bandLimits.js";

const scheduleFilters = [
  { id: "upcoming", label: "Buduće" },
  { id: "done", label: "Prošle" },
  { id: "month", label: "Ovaj mesec" },
  { id: "all", label: "Sve" },
];

const emptyForm = {
  bandId: "",
  date: "",
  city: "",
  venue: "",
  note: "",
};

export default function SchedulePage({
  events,
  bands = [],
  settings,
  activeBandId,
  allBandsId = "__all__",
  onBandChange,
  onBandsChanged,
  showToast,
  profile = null,
  onAdd,
  onUpdate,
  onRemove,
  onRefreshSchedule,
  leaveEventSignal = 0,
  focusEventId = null,
  onFocusEventConsumed,
  addActionRequest = null,
  onAddActionConsumed,
  loading = false,
}) {
  const { confirm } = useConfirm();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState("upcoming");
  /** desc = present → past (default); asc = past → present */
  const [dateSort, setDateSort] = useState("desc");
  const [listPage, setListPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createBandOpen, setCreateBandOpen] = useState(false);
  const [createBandName, setCreateBandName] = useState("");
  const [createBandBusy, setCreateBandBusy] = useState(false);

  const ownedGroupBands = profile?.ownedGroupBands ?? 0;
  const ownerLimit = profile?.ownerLimit ?? ownerBandLimit(0);
  const canCreateBand = ownedGroupBands < ownerLimit;

  const bandsById = useMemo(() => new Map(bands.map((band) => [band.id, band])), [bands]);

  const ALL_PAGE_SIZE = 20;

  const rows = useMemo(() => enrichScheduleRows(events, settings.asOfDate), [events, settings.asOfDate]);
  const filteredRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesScheduleFilter(row, search, filter, settings.asOfDate));
    const direction = dateSort === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const aOk = a.hasDate && !Number.isNaN(a.parsedDate.getTime());
      const bOk = b.hasDate && !Number.isNaN(b.parsedDate.getTime());
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return (a.parsedDate.getTime() - b.parsedDate.getTime()) * direction;
    });
  }, [rows, search, filter, settings.asOfDate, dateSort]);

  useEffect(() => {
    setListPage(0);
  }, [filter, search, activeBandId, dateSort]);

  useEffect(() => {
    setSelectedEventId(null);
  }, [activeBandId]);

  useEffect(() => {
    if (focusEventId == null || focusEventId === "") return;
    setSelectedEventId(focusEventId);
    onFocusEventConsumed?.();
  }, [focusEventId, onFocusEventConsumed]);

  const totalPages =
    filter === "all" ? Math.max(1, Math.ceil(filteredRows.length / ALL_PAGE_SIZE)) : 1;
  const safePage = Math.min(listPage, totalPages - 1);

  const visibleRows = useMemo(() => {
    if (filter !== "all") return filteredRows;
    const start = safePage * ALL_PAGE_SIZE;
    return filteredRows.slice(start, start + ALL_PAGE_SIZE);
  }, [filteredRows, filter, safePage]);

  const nextId = useMemo(() => {
    const upcoming = rows
      .filter((row) => row.hasDate && !row.done && !Number.isNaN(row.parsedDate.getTime()))
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
    return upcoming[0]?.id ?? null;
  }, [rows]);
  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((item) => item.id === selectedEventId) || null : null),
    [events, selectedEventId],
  );
  const selectedBand = selectedEvent
    ? bandsById.get(selectedEvent.bandId) || null
    : null;

  const isDirty =
    form.bandId !== initialForm.bandId ||
    form.date !== initialForm.date ||
    form.city !== initialForm.city;

  useEffect(() => {
    if (!formOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseForm();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formOpen, isDirty, saving]);

  function openForm() {
    const defaultBandId = bands.length === 1 ? bands[0].id : "";
    const next = { ...emptyForm, date: todayText(), bandId: defaultBandId };
    setForm(next);
    setInitialForm(next);
    setFormError("");
    setFormOpen(true);
    setSelectedEventId(null);
  }

  function openCreateBand() {
    setCreateBandName("");
    setCreateBandOpen(true);
  }

  useEffect(() => {
    if (!addActionRequest?.nonce) return;
    const type = addActionRequest.type;
    if (type === "termin") openForm();
    else if (type === "band") openCreateBand();
    onAddActionConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per nonce
  }, [addActionRequest?.nonce]);

  async function submitCreateBand(event) {
    event.preventDefault();
    const name = createBandName.trim();
    if (!name || createBandBusy) return;
    if (!canCreateBand) {
      showToast?.(`Limit: najviše ${ownerLimit} grupnih bendova. Zatraži grant za više.`, "error");
      return;
    }
    setCreateBandBusy(true);
    try {
      const created = await api("/api/bands", { method: "POST", body: { name } });
      showToast?.(`Bend kreiran: ${created.name}`);
      setCreateBandOpen(false);
      setCreateBandName("");
      await onBandsChanged?.();
      onBandChange?.(created.id);
    } catch (error) {
      showToast?.(error.message || "Kreiranje benda nije uspelo", "error");
    } finally {
      setCreateBandBusy(false);
    }
  }

  function forceCloseForm() {
    setFormOpen(false);
    setFormError("");
    setForm(emptyForm);
    setInitialForm(emptyForm);
  }

  async function requestCloseForm() {
    if (saving) return;
    if (isDirty) {
      const confirmed = await confirm({
        title: "Nesačuvane izmene",
        message: "Imaš nesačuvane izmene. Zatvoriti formu bez čuvanja?",
        confirmLabel: "Zatvori",
        cancelLabel: "Ostani",
        danger: true,
      });
      if (!confirmed) return;
    }
    forceCloseForm();
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    if (formError) setFormError("");
  }

  async function requestRemove(row) {
    const label = [row.date, row.city, row.venue].filter(Boolean).join(" — ") || "ovaj termin";
    const confirmed = await confirm({
      title: "Obrisati termin?",
      message: `Da li si siguran/a da želiš da obrišeš ovaj termin?\n\n${label}\n\nOva akcija se ne može poništiti.`,
      confirmLabel: "Obriši",
      cancelLabel: "Otkaži",
      danger: true,
    });
    if (!confirmed) return;
    onRemove(row.id);
  }

  async function validateAndCreate(openAfter = false) {
    const bandId = String(form.bandId || "").trim();
    const date = String(form.date || "").trim();
    const city = String(form.city || "").trim();

    if (!bandId) {
      setFormError("Moraš izabrati bend.");
      return null;
    }

    if (!date) {
      setFormError("Datum je obavezan.");
      return null;
    }

    const parsed = parseDate(date);
    if (Number.isNaN(parsed.getTime())) {
      setFormError("Datum nije ispravan. Izaberi datum iz kalendara.");
      return null;
    }

    const today = startOfToday();
    if (parsed.getTime() < today.getTime()) {
      setFormError("Datum ne sme biti u prošlosti.");
      return null;
    }

    try {
      setSaving(true);
      setFormError("");
      const created = await onAdd({
        bandId,
        date,
        city,
        venue: "",
        note: "",
        priceEur: 0,
        transportRsd: 0,
      });
      forceCloseForm();
      if (openAfter && created?.id != null) {
        setSelectedEventId(created.id);
      }
      return created;
    } catch (error) {
      setFormError(error.message || "Nije moguće sačuvati termin.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    await validateAndCreate(false);
  }

  async function submitFullDetails(event) {
    event.preventDefault();
    await validateAndCreate(true);
  }

  const eventOpen = Boolean(selectedEventId);

  return (
    <div className={`raspored ${eventOpen ? "is-event-open" : ""}`}>
      {eventOpen ? (
        <EventPage
          event={selectedEvent}
          band={selectedBand}
          bands={bands}
          onBack={() => setSelectedEventId(null)}
          onUpdate={onUpdate}
          onRefreshSchedule={onRefreshSchedule}
          leaveSignal={leaveEventSignal}
          showToast={showToast}
        />
      ) : null}

      <div className="raspored-list-view" hidden={eventOpen} aria-hidden={eventOpen}>
      <header className="raspored-bar">
        <div className="raspored-tools raspored-tools-start" aria-label="Filteri rasporeda">
          <BandFilterSelect
            bands={bands}
            activeBandId={activeBandId}
            allBandsId={allBandsId}
            onSelectBand={onBandChange}
          />
          <MenuSelect
            label="Prikaz datuma"
            icon={<CalendarFilterIcon />}
            value={filter}
            options={scheduleFilters}
            onChange={setFilter}
          />
          <button
            type="button"
            className={`raspored-icon-btn raspored-sort-btn ${dateSort === "asc" ? "is-asc" : "is-desc"}`}
            aria-label={
              dateSort === "desc"
                ? "Sortiranje: od novijeg ka starijem — klik za obrnuto"
                : "Sortiranje: od starijeg ka novijem — klik za obrnuto"
            }
            title={dateSort === "desc" ? "Novo → staro" : "Staro → novo"}
            onClick={() => setDateSort((value) => (value === "desc" ? "asc" : "desc"))}
          >
            <SortArrowIcon />
          </button>
        </div>

        <div className="raspored-tools">
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
                id="scheduleSearch"
                name="scheduleSearch"
                type="search"
                placeholder="mesto, lokal, napomena..."
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
        </div>
      </header>

      <section className="raspored-panel" aria-label="Termini">
        {loading && events.length === 0 ? (
          <RasporedSkeleton variant="schedule" />
        ) : visibleRows.length === 0 ? (
          <p className="raspored-empty">Nema termina za ovaj filter.</p>
        ) : (
          <ul className="raspored-list">
            {visibleRows.map((row) => {
              const dateParts = formatScheduleDateParts(row.date);
              const band = bandsById.get(row.bandId);
              const bandColor = resolveBandColor(band, row.bandId || row.bandName || "");
              const feeMarked =
                numberValue(row.priceEur) > 0 || numberValue(row.defaultPriceEur) > 0;
              return (
              <li
                key={row.id}
                className={`raspored-row ${row.done ? "is-past" : ""} ${row.id === nextId ? "is-next" : ""}`}
                style={bandColor ? { "--band-accent": bandColor } : undefined}
              >
                <button
                  type="button"
                  className="raspored-row-button raspored-row-open"
                  onClick={() => setSelectedEventId(row.id)}
                  aria-label={`Otvori termin ${row.date || ""} ${row.city || ""}`.trim()}
                >
                  <time className="raspored-date" dateTime={dateParts.dateTime || undefined}>
                    <span className="raspored-date-day">{dateParts.day}</span>
                    <span className="raspored-date-month">{dateParts.month}</span>
                  </time>
                  <div className="raspored-main">
                    <div className="raspored-main-line">
                      <strong className="raspored-city">{row.city || "—"}</strong>
                      {row.venue ? (
                        <span className="raspored-venue">
                          <span className="raspored-venue-pin" aria-hidden="true">
                            <VenuePinIcon />
                          </span>
                          <span className="raspored-venue-text">{row.venue}</span>
                        </span>
                      ) : (
                        <span className="raspored-venue is-empty" aria-hidden="true" />
                      )}
                    </div>
                    {row.bandName ? <span className="raspored-band">{row.bandName}</span> : null}
                  </div>
                </button>
                <div className="raspored-actions">
                  <DateRowMenu
                    feeMarked={feeMarked}
                    locked={Boolean(row.done)}
                    onDelete={() => requestRemove(row)}
                  />
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {filter === "all" && filteredRows.length > ALL_PAGE_SIZE ? (
        <div className="raspored-pagination" aria-label="Stranice">
          <button
            type="button"
            className="finansije-year-btn finansije-page-btn"
            disabled={safePage <= 0}
            onClick={() => setListPage((page) => Math.max(0, page - 1))}
            aria-label="Prethodna stranica"
          >
            <PageChevronLeftIcon />
          </button>
          <span className="raspored-pagination-label">
            {safePage + 1} / {totalPages}
            <small>
              {" "}
              ({filteredRows.length} datuma)
            </small>
          </span>
          <button
            type="button"
            className="finansije-year-btn finansije-page-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => setListPage((page) => Math.min(totalPages - 1, page + 1))}
            aria-label="Sledeća stranica"
          >
            <PageChevronRightIcon />
          </button>
        </div>
      ) : null}

      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="addTerminTitle">
            <FadeScroll>
            <div className="panel-heading compact">
              <div>
                <h2 id="addTerminTitle">Novi termin</h2>
              </div>
            </div>

            <form className="termin-form termin-form-tactile" onSubmit={submitForm}>
              <fieldset className="termin-form-section termin-form-full">
                <legend>Datum</legend>
                <DateMonthPicker value={form.date} onChange={(date) => updateForm("date", date)} />
              </fieldset>

              <fieldset className="termin-form-section termin-form-full">
                <legend>Bend</legend>
                <div className="termin-band-grid" role="group" aria-label="Izaberi bend">
                  {bands.map((band) => {
                    const selected = form.bandId === band.id;
                    const color = resolveBandColor(band, band.id);
                    const label =
                      band.kind === "personal" ? `${band.name} (lično)` : band.name;
                    return (
                      <button
                        key={band.id}
                        type="button"
                        className={`termin-band-tile ${selected ? "is-selected" : ""}`}
                        aria-label={label}
                        aria-pressed={selected}
                        title={label}
                        onClick={() => updateForm("bandId", band.id)}
                      >
                        <span
                          className={`termin-band-led ${selected ? "is-on" : ""}`}
                          aria-hidden="true"
                        />
                        <span className="termin-band-tile-inner" style={{ backgroundColor: color }}>
                          {bandInitials(band.name)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="termin-form-section termin-form-full">
                <legend>Mesto</legend>
                <div className="termin-city-grid" role="group" aria-label="Uobičajena mesta">
                  {QUICK_CREATE_CITIES.map((city) => {
                    const selected = form.city.trim() === city.name;
                    return (
                      <button
                        key={city.name}
                        type="button"
                        className={`termin-city-tile ${selected ? "is-selected" : ""}`}
                        aria-label={city.name}
                        aria-pressed={selected}
                        title={city.name}
                        onClick={() => updateForm("city", city.name)}
                      >
                        {city.short}
                      </button>
                    );
                  })}
                </div>
                <label className="termin-city-other" htmlFor="terminCity">
                  <span className="sr-only">Drugo mesto</span>
                  <input
                    id="terminCity"
                    name="terminCity"
                    type="text"
                    placeholder="Drugo mesto…"
                    value={form.city}
                    onChange={(event) => updateForm("city", event.target.value)}
                    autoComplete="address-level2"
                  />
                </label>
              </fieldset>

              {formError ? <div className="app-alert termin-form-full">{formError}</div> : null}

              <div className="termin-form-actions termin-form-full termin-form-actions-stack">
                <button type="submit" disabled={saving}>
                  {saving ? "Čuvam…" : "Sačuvaj termin"}
                </button>
                <button type="button" className="termin-form-secondary" disabled={saving} onClick={submitFullDetails}>
                  Unesi kompletne detalje
                </button>
                <button type="button" className="termin-form-ghost" onClick={requestCloseForm} disabled={saving}>
                  Otkaži
                </button>
              </div>
            </form>
            </FadeScroll>
          </div>
        </div>
      ) : null}

      {createBandOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !createBandBusy) setCreateBandOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="createBandTitle">
            <FadeScroll>
            <div className="panel-heading compact">
              <div>
                <h2 id="createBandTitle">Novi bend</h2>
              </div>
            </div>
            <form className="termin-form" onSubmit={submitCreateBand}>
              <label htmlFor="createBandName" className="termin-form-full">
                Ime benda
                <input
                  id="createBandName"
                  name="createBandName"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  maxLength={80}
                  placeholder="npr. Chabar"
                  value={createBandName}
                  onChange={(event) => setCreateBandName(event.target.value)}
                  required
                />
              </label>
              <p className="settings-note termin-form-full">
                {canCreateBand
                  ? `Grupni bend · ti si vlasnik · ${ownedGroupBands}/${ownerLimit} zauzeto`
                  : `Dostignut limit (${ownerLimit}). Zatraži grant za više benda.`}
              </p>
              <div className="termin-form-actions termin-form-full">
                <button
                  type="button"
                  className="danger"
                  disabled={createBandBusy}
                  onClick={() => setCreateBandOpen(false)}
                >
                  Otkaži
                </button>
                <button type="submit" disabled={createBandBusy || !createBandName.trim() || !canCreateBand}>
                  {createBandBusy ? "…" : "Kreiraj"}
                </button>
              </div>
            </form>
            </FadeScroll>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isFinancialOnlyEntry(event) {
  const note = String(event.note || "").trim().toLowerCase();
  return note === "od prosle godine";
}

function DateRowMenu({ feeMarked, locked, onDelete }) {
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

    function onMenuInteract() {
      armIdle();
    }

    armIdle();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const root = rootRef.current;
    root?.addEventListener("pointermove", onMenuInteract);
    root?.addEventListener("focusin", onMenuInteract);

    return () => {
      clearIdle();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      root?.removeEventListener("pointermove", onMenuInteract);
      root?.removeEventListener("focusin", onMenuInteract);
    };
  }, [open]);

  return (
    <div className={`date-row-menu ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`date-row-menu-trigger ${open ? "is-open" : ""}`}
        aria-label="Više radnji za termin"
        title="Više"
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
        <ul className="date-row-menu-list" id={menuId} role="menu" aria-label="Radnje termina">
          <li role="none">
            <div
              className={`date-row-menu-item is-status ${feeMarked ? "is-fee-set" : "is-fee-unset"}`}
              role="menuitem"
              aria-disabled="true"
            >
              {feeMarked ? "Honorar postavljen" : "Honorar nije postavljen"}
            </div>
          </li>
          {locked ? (
            <li role="none">
              <div className="date-row-menu-item is-status" role="menuitem" aria-disabled="true">
                Prošli termin — zaključan
              </div>
            </li>
          ) : (
            <li role="none">
              <button
                type="button"
                className="date-row-menu-item is-danger"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onDelete?.();
                }}
              >
                Obriši termin
              </button>
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function VenuePinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 21s6.5-5.2 6.5-11a6.5 6.5 0 1 0-13 0c0 5.8 6.5 11 6.5 11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
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

function enrichScheduleRows(events, asOfDateText) {
  const asOfDate = parseDate(asOfDateText || todayText());
  const calculationDate = Number.isNaN(asOfDate.getTime()) ? new Date() : asOfDate;

  return events
    .filter((event) => !isFinancialOnlyEntry(event))
    .map((event) => {
      const hasDate = Boolean(String(event.date || "").trim());
      const parsedDate = parseDate(event.date);
      const done = hasDate && !Number.isNaN(parsedDate.getTime()) && parsedDate <= calculationDate;

      return {
        ...event,
        hasDate,
        parsedDate,
        done,
      };
    })
    .map((event, index) => ({
      ...event,
      index,
    }));
}

function matchesScheduleFilter(row, search, filter, asOfDate) {
  const query = search.trim().toLowerCase();
  const haystack = [row.date, row.city, row.venue, row.note].join(" ").toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (filter === "upcoming") return row.hasDate && !row.done;
  if (filter === "done") return row.done;
  if (filter === "month") return sameMonth(row.parsedDate, parseDate(asOfDate));
  return true;
}

function PageChevronLeftIcon() {
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

function PageChevronRightIcon() {
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarFilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10h17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
