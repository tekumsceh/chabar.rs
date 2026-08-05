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
import { useT } from "./i18n/I18nProvider.jsx";
import RasporedSkeleton from "./RasporedSkeleton.jsx";
import EventPage from "./EventPage.jsx";
import FadeScroll from "./FadeScroll.jsx";
import DateMonthPicker from "./DateMonthPicker.jsx";
import ScheduleToolbar from "./ScheduleToolbar.jsx";
import ScheduleEventCard, { scheduleCanSeeFinance, scheduleFeeMarked } from "./ScheduleEventCard.jsx";
import {
  buildDuplicateConfirmMessage,
  findScheduleDuplicates,
  hasScheduleDuplicates,
} from "./scheduleConflicts.js";
import { MoneyIcon } from "./appIcons.jsx";
import { QUICK_CREATE_CITIES } from "./quickCreateCities.js";
import { ownerBandLimit } from "../shared/bandLimits.js";

const emptyForm = {
  bandId: "",
  date: "",
  city: "",
  venue: "",
  note: "",
};

const SCHEDULE_LAYOUT_KEY = "chabar.scheduleLayout";

function readScheduleLayout() {
  try {
    return localStorage.getItem(SCHEDULE_LAYOUT_KEY) === "card" ? "card" : "list";
  } catch {
    return "list";
  }
}

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
  searchQuery = "",
  canManageBand = false,
  onManageBand,
}) {
  const t = useT();
  const { confirm } = useConfirm();
  const search = searchQuery;
  const [filter, setFilter] = useState("upcoming");
  const [layoutView, setLayoutView] = useState(readScheduleLayout);
  const [eventOpenFocus, setEventOpenFocus] = useState(null);
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

  const rows = useMemo(() => enrichScheduleRows(events), [events]);
  const filteredRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesScheduleFilter(row, search, filter));
    const direction = dateSort === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const aOk = a.hasDate && !Number.isNaN(a.parsedDate.getTime());
      const bOk = b.hasDate && !Number.isNaN(b.parsedDate.getTime());
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return (a.parsedDate.getTime() - b.parsedDate.getTime()) * direction;
    });
  }, [rows, search, filter, dateSort]);

  useEffect(() => {
    setListPage(0);
  }, [filter, search, activeBandId, dateSort, layoutView]);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_LAYOUT_KEY, layoutView);
    } catch {
      /* ignore */
    }
  }, [layoutView]);

  function openEvent(eventId, focus = null) {
    setEventOpenFocus(focus);
    setSelectedEventId(eventId);
  }

  function closeEvent() {
    setSelectedEventId(null);
    setEventOpenFocus(null);
  }

  useEffect(() => {
    setSelectedEventId(null);
    setEventOpenFocus(null);
  }, [activeBandId]);

  useEffect(() => {
    if (focusEventId == null || focusEventId === "") return;
    openEvent(focusEventId);
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
      showToast?.(t("nav.bandLimitToast", { limit: ownerLimit }), "error");
      return;
    }
    setCreateBandBusy(true);
    try {
      const created = await api("/api/bands", { method: "POST", body: { name } });
      showToast?.(t("schedule.created", { name: created.name }));
      setCreateBandOpen(false);
      setCreateBandName("");
      await onBandsChanged?.();
      onBandChange?.(created.id);
    } catch (error) {
      showToast?.(error.message || t("schedule.createFail"), "error");
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
        title: t("schedule.unsavedTitle"),
        message: t("schedule.closeFormMessage"),
        confirmLabel: t("schedule.closeForm"),
        cancelLabel: t("schedule.stay"),
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
    const label = [row.date, row.city, row.venue].filter(Boolean).join(" — ") || t("schedule.thisEvent");
    const confirmed = await confirm({
      title: t("schedule.deleteTitle"),
      message: t("schedule.deleteMessage", { label }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
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
      setFormError(t("schedule.validation.band"));
      return null;
    }

    if (!date) {
      setFormError(t("event.validation.dateRequired"));
      return null;
    }

    const parsed = parseDate(date);
    if (Number.isNaN(parsed.getTime())) {
      setFormError(t("event.validation.dateInvalid"));
      return null;
    }

    const today = startOfToday();
    if (parsed.getTime() < today.getTime()) {
      setFormError(t("schedule.validation.datePast"));
      return null;
    }

    const duplicates = findScheduleDuplicates({ events, bandId, date });
    if (hasScheduleDuplicates(duplicates)) {
      const confirmed = await confirm({
        title: t("schedule.duplicateTitle"),
        message: buildDuplicateConfirmMessage(t, { ...duplicates, date }),
        confirmLabel: t("schedule.duplicateProceed"),
        cancelLabel: t("common.cancel"),
        danger: true,
      });
      if (!confirmed) return null;
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
      setFormError(error.message || t("schedule.saveFail"));
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
          events={events}
          profile={profile}
          onBack={closeEvent}
          onUpdate={onUpdate}
          onRefreshSchedule={onRefreshSchedule}
          leaveSignal={leaveEventSignal}
          showToast={showToast}
          initialTab={eventOpenFocus?.tab || "osnovno"}
          initialTechSubTab={eventOpenFocus?.techSubTab || ""}
          initialShowSubTab={eventOpenFocus?.showSubTab || ""}
          initialDetailsOpen={Boolean(eventOpenFocus?.detailsOpen)}
        />
      ) : (
      <div className="raspored-list-view">
      <ScheduleToolbar
        filter={filter}
        onFilterChange={setFilter}
        layoutView={layoutView}
        onLayoutViewChange={setLayoutView}
        dateSort={dateSort}
        onDateSortChange={setDateSort}
        canManageBand={canManageBand}
        onManageBand={onManageBand}
      />

      <FadeScroll
        viewportClassName={`raspored-panel ${layoutView === "card" ? "is-card-view" : ""}`.trim()}
        viewportAriaLabel={t("schedule.eventsAria")}
      >
        {loading && events.length === 0 ? (
          <RasporedSkeleton variant={layoutView === "card" ? "schedule-card" : "schedule"} />
        ) : visibleRows.length === 0 ? (
          <p className="raspored-empty">{t("schedule.emptyFilter")}</p>
        ) : layoutView === "card" ? (
          <div className="raspored-card-grid" role="list">
            {visibleRows.map((row) => {
              const band = bandsById.get(row.bandId);
              const bandColor = resolveBandColor(band, row.bandId || row.bandName || "");
              const feeMarked = scheduleFeeMarked(row);
              return (
                <ScheduleEventCard
                  key={row.id}
                  row={row}
                  bandColor={bandColor}
                  feeMarked={feeMarked}
                  isNext={row.id === nextId}
                  canSeeFinance={scheduleCanSeeFinance(band)}
                  onOpen={openEvent}
                  actions={
                    <DateRowMenu
                      feeMarked={feeMarked}
                      locked={Boolean(row.done)}
                      onDelete={() => requestRemove(row)}
                    />
                  }
                />
              );
            })}
          </div>
        ) : (
          <ul className="raspored-list">
            {visibleRows.map((row) => {
              const dateParts = formatScheduleDateParts(row.date);
              const band = bandsById.get(row.bandId);
              const bandColor = resolveBandColor(band, row.bandId || row.bandName || "");
              const feeMarked = scheduleFeeMarked(row);
              return (
              <li
                key={row.id}
                className={`raspored-row ${row.done ? "is-past" : ""} ${row.id === nextId ? "is-next" : ""}`}
                style={bandColor ? { "--band-accent": bandColor } : undefined}
              >
                <button
                  type="button"
                  className="raspored-row-button raspored-row-open"
                  onClick={() => openEvent(row.id)}
                  aria-label={t("schedule.openEvent", {
                    label: `${row.date || ""} ${row.city || ""}`.trim(),
                  })}
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
                  <span
                    className={`raspored-fee-mark ${feeMarked ? "is-set" : "is-unset"}`}
                    aria-label={feeMarked ? t("schedule.feeSet") : t("schedule.feeUnset")}
                    title={feeMarked ? t("schedule.feeSet") : t("schedule.feeUnset")}
                  >
                    <MoneyIcon />
                  </span>
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
      </FadeScroll>

      {filter === "all" && filteredRows.length > ALL_PAGE_SIZE ? (
        <div className="raspored-pagination" aria-label={t("schedule.pages")}>
          <button
            type="button"
            className="finansije-year-btn finansije-page-btn"
            disabled={safePage <= 0}
            onClick={() => setListPage((page) => Math.max(0, page - 1))}
            aria-label={t("schedule.prevPage")}
          >
            <PageChevronLeftIcon />
          </button>
          <span className="raspored-pagination-label">
            {safePage + 1} / {totalPages}
            <small> {t("schedule.dateCount", { count: filteredRows.length })}</small>
          </span>
          <button
            type="button"
            className="finansije-year-btn finansije-page-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => setListPage((page) => Math.min(totalPages - 1, page + 1))}
            aria-label={t("schedule.nextPage")}
          >
            <PageChevronRightIcon />
          </button>
        </div>
      ) : null}

      </div>
      )}

      {formOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="addTerminTitle">
            <FadeScroll>
            <div className="panel-heading compact">
              <div>
                <h2 id="addTerminTitle">{t("schedule.add")}</h2>
              </div>
            </div>

            <form className="termin-form termin-form-tactile" onSubmit={submitForm}>
              <fieldset className="termin-form-section termin-form-full">
                <legend>{t("schedule.date")}</legend>
                <DateMonthPicker value={form.date} onChange={(date) => updateForm("date", date)} />
              </fieldset>

              <fieldset className="termin-form-section termin-form-full">
                <legend>{t("schedule.band")}</legend>
                <div className="termin-band-grid" role="group" aria-label={t("schedule.selectBand")}>
                  {bands.map((band) => {
                    const selected = form.bandId === band.id;
                    const color = resolveBandColor(band, band.id);
                    const label =
                      band.kind === "personal"
                        ? `${band.name} ${t("event.personalSuffix")}`
                        : band.name;
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
                <legend>{t("schedule.city")}</legend>
                <div className="termin-city-grid" role="group" aria-label={t("schedule.commonPlaces")}>
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
                  <span className="sr-only">{t("schedule.otherCityLabel")}</span>
                  <input
                    id="terminCity"
                    name="terminCity"
                    type="text"
                    placeholder={t("schedule.otherCity")}
                    value={form.city}
                    onChange={(event) => updateForm("city", event.target.value)}
                    autoComplete="address-level2"
                  />
                </label>
              </fieldset>

              {formError ? <div className="app-alert termin-form-full">{formError}</div> : null}

              <div className="termin-form-actions termin-form-full termin-form-actions-stack">
                <button type="submit" disabled={saving}>
                  {saving ? t("common.saving") : t("schedule.saveEvent")}
                </button>
                <button type="button" className="termin-form-secondary" disabled={saving} onClick={submitFullDetails}>
                  {t("schedule.fullDetails")}
                </button>
                <button type="button" className="termin-form-ghost" onClick={requestCloseForm} disabled={saving}>
                  {t("common.cancel")}
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
                <h2 id="createBandTitle">{t("schedule.createBand")}</h2>
              </div>
            </div>
            <form className="termin-form" onSubmit={submitCreateBand}>
              <label htmlFor="createBandName" className="termin-form-full">
                {t("schedule.createBandName")}
                <input
                  id="createBandName"
                  name="createBandName"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  maxLength={80}
                  placeholder={t("schedule.createBandPlaceholder")}
                  value={createBandName}
                  onChange={(event) => setCreateBandName(event.target.value)}
                  required
                />
              </label>
              <p className="settings-note termin-form-full">
                {canCreateBand
                  ? t("schedule.createBandNote", { owned: ownedGroupBands, limit: ownerLimit })
                  : t("schedule.createBandLimit", { limit: ownerLimit })}
              </p>
              <div className="termin-form-actions termin-form-full">
                <button
                  type="button"
                  className="danger"
                  disabled={createBandBusy}
                  onClick={() => setCreateBandOpen(false)}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={createBandBusy || !createBandName.trim() || !canCreateBand}>
                  {createBandBusy ? "…" : t("schedule.create")}
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
        aria-label={t("schedule.moreActions")}
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
        <ul className="date-row-menu-list" id={menuId} role="menu" aria-label={t("schedule.eventActions")}>
          <li role="none">
            <div
              className={`date-row-menu-item is-status ${feeMarked ? "is-fee-set" : "is-fee-unset"}`}
              role="menuitem"
              aria-disabled="true"
            >
              {feeMarked ? t("schedule.feeSet") : t("schedule.feeUnset")}
            </div>
          </li>
          {locked ? (
            <li role="none">
              <div className="date-row-menu-item is-status" role="menuitem" aria-disabled="true">
                {t("schedule.pastLocked")}
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
                {t("schedule.deleteEvent")}
              </button>
            </li>
          )}
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

function enrichScheduleRows(events) {
  const calculationDate = startOfToday();

  return events
    .filter((event) => !isFinancialOnlyEntry(event))
    .map((event) => {
      const hasDate = Boolean(String(event.date || "").trim());
      const parsedDate = parseDate(event.date);
      const done =
        hasDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() <= calculationDate.getTime();

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

function matchesScheduleFilter(row, search, filter) {
  const query = search.trim().toLowerCase();
  const haystack = [row.date, row.city, row.venue, row.note, row.bandName].join(" ").toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (filter === "upcoming") return row.hasDate && !row.done;
  if (filter === "done") return row.done;
  if (filter === "month") return sameMonth(row.parsedDate, startOfToday());
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
