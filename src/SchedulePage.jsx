import { useEffect, useMemo, useState } from "react";
import {
  formatScheduleDateParts,
  fromIsoDate,
  parseDate,
  sameMonth,
  toIsoDate,
  todayText,
} from "./calculations.js";
import MenuSelect from "./MenuSelect.jsx";
import RasporedSkeleton from "./RasporedSkeleton.jsx";

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
  allBandsId,
  onBandChange,
  onAdd,
  onUpdate,
  onRemove,
  loading = false,
}) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState("upcoming");
  /** desc = present → past (default); asc = past → present */
  const [dateSort, setDateSort] = useState("desc");
  const [listPage, setListPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const bandOptions = useMemo(
    () => [
      { id: allBandsId, label: "Svi bendovi" },
      ...bands.map((band) => ({
        id: band.id,
        label: band.kind === "personal" ? `${band.name} (lično)` : band.name,
      })),
    ],
    [bands, allBandsId],
  );

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
  const isEditing = editingId !== null;
  const isDirty =
    form.bandId !== initialForm.bandId ||
    form.date !== initialForm.date ||
    form.city !== initialForm.city ||
    form.venue !== initialForm.venue ||
    form.note !== initialForm.note;

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
    const next = { ...emptyForm, date: todayText(), bandId: "" };
    setEditingId(null);
    setForm(next);
    setInitialForm(next);
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(row) {
    const next = {
      bandId: row.bandId || "",
      date: row.date || "",
      city: row.city || "",
      venue: row.venue || "",
      note: row.note || "",
    };
    setEditingId(row.id);
    setForm(next);
    setInitialForm(next);
    setFormError("");
    setFormOpen(true);
  }

  function forceCloseForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError("");
    setForm(emptyForm);
    setInitialForm(emptyForm);
  }

  function requestCloseForm() {
    if (saving) return;
    if (isDirty) {
      const confirmed = window.confirm("Imaš nesačuvane izmene. Zatvoriti formu bez čuvanja?");
      if (!confirmed) return;
    }
    forceCloseForm();
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    if (formError) setFormError("");
  }

  function requestRemove(row) {
    const label = [row.date, row.city, row.venue].filter(Boolean).join(" — ") || "ovaj termin";
    const confirmed = window.confirm(`Obrisati termin?\n\n${label}\n\nOva akcija se ne može poništiti.`);
    if (!confirmed) return;
    onRemove(row.id);
  }

  async function submitForm(event) {
    event.preventDefault();

    const bandId = String(form.bandId || "").trim();
    const date = String(form.date || "").trim();
    const city = String(form.city || "").trim();
    const venue = String(form.venue || "").trim();
    const note = String(form.note || "").trim();

    if (!isEditing && !bandId) {
      setFormError("Moraš izabrati bend ili Personal.");
      return;
    }

    if (!date) {
      setFormError("Datum je obavezan.");
      return;
    }

    const parsed = parseDate(date);
    if (Number.isNaN(parsed.getTime())) {
      setFormError("Datum nije ispravan. Izaberi datum iz kalendara.");
      return;
    }

    if (!city && !venue && !note) {
      setFormError("Unesi bar mesto, lokal ili napomenu.");
      return;
    }

    if (isEditing && !isDirty) {
      setFormError("Nema izmena za čuvanje.");
      return;
    }

    if (isEditing) {
      const confirmed = window.confirm(`Sačuvati izmene termina?\n\n${date}${city ? ` — ${city}` : ""}`);
      if (!confirmed) return;
    }

    try {
      setSaving(true);
      setFormError("");
      if (isEditing) {
        await onUpdate(editingId, { date, city, venue, note });
      } else {
        await onAdd({ bandId, date, city, venue, note, priceEur: 0, transportRsd: 0 });
      }
      forceCloseForm();
    } catch (error) {
      setFormError(error.message || "Nije moguće sačuvati termin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="raspored">
      <header className="raspored-bar">
        <div className="raspored-tools raspored-tools-start" aria-label="Filteri rasporeda">
          <MenuSelect
            label="Bend"
            icon={<BandIcon />}
            value={activeBandId}
            options={bandOptions}
            onChange={onBandChange}
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

          <button
            type="button"
            className="raspored-icon-btn raspored-icon-btn-accent"
            onClick={openForm}
            aria-label="Dodaj termin"
            title="Dodaj termin"
          >
            <PlusIcon />
          </button>
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
              return (
              <li key={row.id} className={`raspored-row ${row.done ? "is-past" : ""} ${row.id === nextId ? "is-next" : ""}`}>
                <time className="raspored-date" dateTime={dateParts.dateTime || undefined}>
                  <span className="raspored-date-day">{dateParts.day}</span>
                  <span className="raspored-date-month">{dateParts.month}</span>
                </time>
                <div className="raspored-main">
                  <strong className="raspored-city">{row.city || "—"}</strong>
                  {row.venue ? <span className="raspored-venue">{row.venue}</span> : null}
                </div>
                <span className="raspored-band">{row.bandName || ""}</span>
                <div className="raspored-actions">
                  {row.done ? (
                    <span className="raspored-lock" title="Prošli termin je zaključan">
                      <LockIcon />
                    </span>
                  ) : (
                    <>
                      <button
                        className="raspored-icon-btn"
                        type="button"
                        title="Izmeni termin"
                        aria-label="Izmeni termin"
                        onClick={() => openEditForm(row)}
                      >
                        <PenIcon />
                      </button>
                      <button
                        className="raspored-icon-btn raspored-icon-btn-danger"
                        type="button"
                        aria-label="Obriši termin"
                        title="Obriši termin"
                        onClick={() => requestRemove(row)}
                      >
                        <CloseIcon />
                      </button>
                    </>
                  )}
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
            className="finansije-year-btn"
            disabled={safePage <= 0}
            onClick={() => setListPage((page) => Math.max(0, page - 1))}
            aria-label="Prethodna stranica"
          >
            ←
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
            className="finansije-year-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => setListPage((page) => Math.min(totalPages - 1, page + 1))}
            aria-label="Sledeća stranica"
          >
            →
          </button>
        </div>
      ) : null}

      {formOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="addTerminTitle">
            <div className="panel-heading compact">
              <div>
                <h2 id="addTerminTitle">{isEditing ? "Izmeni termin" : "Novi termin"}</h2>
              </div>
            </div>

            <form className="termin-form" onSubmit={submitForm}>
              <label htmlFor="terminBand" className="termin-form-full">
                Bend / Personal
                {isEditing ? (
                  <input
                    id="terminBand"
                    name="terminBand"
                    type="text"
                    value={bands.find((band) => band.id === form.bandId)?.name || form.bandId || "—"}
                    readOnly
                    disabled
                  />
                ) : (
                  <select
                    id="terminBand"
                    name="terminBand"
                    value={form.bandId}
                    onChange={(event) => updateForm("bandId", event.target.value)}
                    autoFocus
                    required
                  >
                    <option value="">— Izaberi —</option>
                    {bands.map((band) => (
                      <option key={band.id} value={band.id}>
                        {band.name}
                        {band.kind === "personal" ? " (lično)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label htmlFor="terminDate" className="termin-form-full">
                Datum
                <input
                  id="terminDate"
                  name="terminDate"
                  type="date"
                  value={toIsoDate(form.date)}
                  onChange={(event) => updateForm("date", fromIsoDate(event.target.value))}
                  required
                />
              </label>
              <label htmlFor="terminCity">
                Mesto
                <input
                  id="terminCity"
                  name="terminCity"
                  type="text"
                  placeholder="Beograd, Novi Sad..."
                  value={form.city}
                  onChange={(event) => updateForm("city", event.target.value)}
                  autoComplete="address-level2"
                />
              </label>
              <label htmlFor="terminVenue">
                Lokal
                <input
                  id="terminVenue"
                  name="terminVenue"
                  type="text"
                  placeholder="Ime kluba / prostora"
                  value={form.venue}
                  onChange={(event) => updateForm("venue", event.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label className="termin-form-full" htmlFor="terminNote">
                Napomena
                <input
                  id="terminNote"
                  name="terminNote"
                  type="text"
                  placeholder="Bend, tip događaja..."
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                  autoComplete="off"
                />
              </label>

              {formError ? <div className="app-alert termin-form-full">{formError}</div> : null}

              <div className="termin-form-actions termin-form-full">
                <button type="button" className="danger" onClick={requestCloseForm} disabled={saving}>
                  Otkaži
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? "Čuvam..." : isEditing ? "Sačuvaj izmene" : "Sačuvaj termin"}
                </button>
              </div>
            </form>
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

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 20h4.5L19.2 9.3a1.5 1.5 0 0 0 0-2.1L16.8 4.8a1.5 1.5 0 0 0-2.1 0L4 15.5V20z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.8 6.2l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function BandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.8 19c.4-2.2 1.8-3.5 3.7-3.5 1.2 0 2.2.5 2.9 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
