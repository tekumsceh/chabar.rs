import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatEur,
  formatScheduleDateParts,
  fromIsoDate,
  numberValue,
  parseDate,
  toIsoDate,
  todayText,
} from "./calculations.js";
import { useConfirm } from "./confirmDialog.jsx";
import EventFinancePanel from "./EventFinancePanel.jsx";
import EventExpensesPanel from "./EventExpensesPanel.jsx";

const TABS = [
  { id: "osnovno", label: "Osnovno" },
  { id: "tehnicki", label: "Tehnički" },
  { id: "show", label: "Show" },
  { id: "finansije", label: "Finansije", leadOnly: true },
];

export default function EventPage({
  event,
  band = null,
  settings = {},
  onBack,
  onUpdate,
  onRefreshSchedule,
  leaveSignal = 0,
  showToast,
}) {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("osnovno");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(() => formFromEvent(event));
  const [initialForm, setInitialForm] = useState(() => formFromEvent(event));
  const lastLeaveSignalRef = useRef(leaveSignal);
  const editingRef = useRef(editing);
  const dirtyRef = useRef(false);
  const formRef = useRef(form);
  const savingRef = useRef(saving);
  const eventRef = useRef(event);

  const memberRole = band?.memberRole || "member";
  const canSeeFinance = memberRole === "owner" || memberRole === "lead";
  const visibleTabs = useMemo(
    () => TABS.filter((item) => !item.leadOnly || canSeeFinance),
    [canSeeFinance],
  );

  const asOfDate = parseDate(settings.asOfDate || todayText());
  const calculationDate = Number.isNaN(asOfDate.getTime()) ? new Date() : asOfDate;
  const parsedDate = parseDate(event?.date);
  const hasDate = Boolean(String(event?.date || "").trim());
  const locked =
    hasDate && !Number.isNaN(parsedDate.getTime()) && parsedDate <= calculationDate;

  const dateParts = formatScheduleDateParts(event?.date);
  const myFee = numberValue(event?.priceEur);
  const hasFee = myFee > 0;
  const bandName = band?.name || event?.bandName || "—";

  const isDirty =
    form.date !== initialForm.date ||
    form.city !== initialForm.city ||
    form.venue !== initialForm.venue ||
    form.note !== initialForm.note;

  editingRef.current = editing;
  dirtyRef.current = isDirty;
  formRef.current = form;
  savingRef.current = saving;
  eventRef.current = event;

  useEffect(() => {
    const next = formFromEvent(event);
    setForm(next);
    setInitialForm(next);
    setEditing(false);
    setFormError("");
  }, [event?.id, event?.date, event?.city, event?.venue, event?.note, event?.priceEur]);

  useEffect(() => {
    if (tab === "finansije" && !canSeeFinance) setTab("osnovno");
  }, [tab, canSeeFinance]);

  useEffect(() => {
    if (leaveSignal === lastLeaveSignalRef.current) return;
    lastLeaveSignalRef.current = leaveSignal;
    void requestLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to nav leave signals
  }, [leaveSignal]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    if (formError) setFormError("");
  }

  function startEdit() {
    if (locked) return;
    setForm(formFromEvent(event));
    setInitialForm(formFromEvent(event));
    setFormError("");
    setEditing(true);
    setTab("osnovno");
  }

  async function cancelEdit() {
    if (saving) return;
    if (isDirty) {
      const confirmed = await confirm({
        title: "Nesačuvane izmene",
        message: "Imaš nesačuvane izmene. Odbaciti izmene?",
        confirmLabel: "Odbaci",
        cancelLabel: "Ostani",
        danger: true,
      });
      if (!confirmed) return;
    }
    setForm(formFromEvent(event));
    setInitialForm(formFromEvent(event));
    setFormError("");
    setEditing(false);
  }

  function validateForm(current) {
    const date = String(current.date || "").trim();
    const city = String(current.city || "").trim();
    const venue = String(current.venue || "").trim();
    const note = String(current.note || "").trim();

    if (!date) return { error: "Datum je obavezan." };
    const parsed = parseDate(date);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Datum nije ispravan. Izaberi datum iz kalendara." };
    }
    if (!city && !venue && !note) {
      return { error: "Unesi bar mesto, lokal ili napomenu." };
    }
    return { date, city, venue, note };
  }

  async function persistEdit({ askConfirm = true } = {}) {
    if (savingRef.current || locked) return false;
    const current = formRef.current;
    const validated = validateForm(current);
    if (validated.error) {
      setFormError(validated.error);
      setTab("osnovno");
      setEditing(true);
      return false;
    }

    const { date, city, venue, note } = validated;
    if (!dirtyRef.current) {
      setEditing(false);
      return true;
    }

    if (askConfirm) {
      const confirmed = await confirm({
        title: "Sačuvati izmene?",
        message: `${date}${city ? ` — ${city}` : ""}`,
        confirmLabel: "Sačuvaj",
        cancelLabel: "Otkaži",
      });
      if (!confirmed) return false;
    }

    try {
      setSaving(true);
      setFormError("");
      await onUpdate?.(eventRef.current.id, { date, city, venue, note });
      setInitialForm({ date, city, venue, note });
      setForm({ date, city, venue, note });
      setEditing(false);
      return true;
    } catch (error) {
      setFormError(error.message || "Nije moguće sačuvati termin.");
      setTab("osnovno");
      setEditing(true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Back / Raspored: prompt Sačuvaj or Otkaži when Osnovno edits are dirty. */
  async function requestLeave() {
    if (savingRef.current) return false;

    if (editingRef.current && dirtyRef.current) {
      const save = await confirm({
        title: "Nesačuvane izmene",
        message: "Imaš nesačuvane izmene. Sačuvati pre povratka na raspored?",
        confirmLabel: "Sačuvaj",
        cancelLabel: "Otkaži",
      });
      if (!save) return false;
      const saved = await persistEdit({ askConfirm: false });
      if (!saved) return false;
    } else if (editingRef.current) {
      setEditing(false);
    }

    onBack?.();
    return true;
  }

  async function requestBack() {
    await requestLeave();
  }

  async function saveEdit(submitEvent) {
    submitEvent?.preventDefault?.();
    await persistEdit({ askConfirm: true });
  }

  if (!event) {
    return (
      <div className="event-page">
        <header className="event-page-head">
          <button type="button" className="event-page-back" aria-label="Nazad" title="Nazad" onClick={onBack}>
            <ChevronLeftIcon />
          </button>
          <div className="event-page-title-wrap">
            <h2 className="event-page-title">Termin nije pronađen</h2>
          </div>
        </header>
        <p className="raspored-empty">Ovaj termin više nije u rasporedu.</p>
      </div>
    );
  }

  return (
    <div className="event-page">
      <header className="event-page-head">
        <button
          type="button"
          className="event-page-back"
          aria-label="Nazad na raspored"
          title="Nazad na raspored"
          onClick={requestBack}
        >
          <ChevronLeftIcon />
        </button>
        <div className="event-page-title-wrap">
          <h2 className="event-page-title">
            {dateParts.day}
            {dateParts.month ? ` ${dateParts.month}` : ""}
            {event.city ? ` · ${event.city}` : ""}
          </h2>
          <p className="event-page-sub">{[event.venue, bandName].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        {locked ? (
          <span className="event-page-lock" title="Prošli termin je zaključan" aria-label="Zaključan termin">
            <LockIcon />
          </span>
        ) : (
          <button
            type="button"
            className={`raspored-icon-btn ${editing ? "is-active-filter" : ""}`}
            title={editing ? "U režimu izmene" : "Izmeni termin"}
            aria-label={editing ? "U režimu izmene" : "Izmeni termin"}
            aria-pressed={editing}
            onClick={() => (editing ? cancelEdit() : startEdit())}
            disabled={saving}
          >
            <PenIcon />
          </button>
        )}
      </header>

      <div className="finansije-tabs" role="tablist" aria-label="Sekcije termina">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={`finansije-tab ${tab === item.id ? "is-active" : ""}`}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "osnovno" ? (
        <section className="event-page-panel" role="tabpanel" aria-label="Osnovno">
          {editing ? (
            <form className="event-page-form termin-form" onSubmit={saveEdit}>
              <label className="termin-form-full">
                Bend / Personal
                <input type="text" value={bandName} readOnly disabled />
              </label>
              <label htmlFor="eventDate" className="termin-form-full">
                Datum
                <input
                  id="eventDate"
                  name="eventDate"
                  type="date"
                  value={toIsoDate(form.date)}
                  onChange={(e) => updateForm("date", fromIsoDate(e.target.value))}
                  required
                />
              </label>
              <label htmlFor="eventCity">
                Mesto
                <input
                  id="eventCity"
                  name="eventCity"
                  type="text"
                  placeholder="Beograd, Novi Sad..."
                  value={form.city}
                  onChange={(e) => updateForm("city", e.target.value)}
                  autoComplete="address-level2"
                />
              </label>
              <label htmlFor="eventVenue">
                Lokal
                <input
                  id="eventVenue"
                  name="eventVenue"
                  type="text"
                  placeholder="Ime kluba / prostora"
                  value={form.venue}
                  onChange={(e) => updateForm("venue", e.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label className="termin-form-full" htmlFor="eventNote">
                Napomena
                <input
                  id="eventNote"
                  name="eventNote"
                  type="text"
                  placeholder="Bend, tip događaja..."
                  value={form.note}
                  onChange={(e) => updateForm("note", e.target.value)}
                  autoComplete="off"
                />
              </label>

              <div className="event-page-fee termin-form-full" aria-label="Moj honorar">
                <span className="event-page-fee-label">Moj honorar</span>
                <strong>{hasFee ? formatEur(myFee) : "—"}</strong>
              </div>

              {formError ? <div className="app-alert termin-form-full">{formError}</div> : null}

              <div className="termin-form-actions termin-form-full">
                <button type="button" className="danger" onClick={cancelEdit} disabled={saving}>
                  Otkaži
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? "Čuvam..." : "Sačuvaj izmene"}
                </button>
              </div>
            </form>
          ) : (
            <dl className="event-page-fields">
              <div>
                <dt>Datum</dt>
                <dd>{event.date || "—"}</dd>
              </div>
              <div>
                <dt>Bend</dt>
                <dd>{bandName}</dd>
              </div>
              <div>
                <dt>Mesto</dt>
                <dd>{event.city || "—"}</dd>
              </div>
              <div>
                <dt>Lokal</dt>
                <dd>{event.venue || "—"}</dd>
              </div>
              <div className="event-page-fields-full">
                <dt>Napomena</dt>
                <dd>{event.note || "—"}</dd>
              </div>
              <div className="event-page-fields-full event-page-fee-row">
                <dt>Moj honorar</dt>
                <dd className={hasFee ? "is-set" : "is-empty"}>{hasFee ? formatEur(myFee) : "—"}</dd>
              </div>
            </dl>
          )}
        </section>
      ) : null}

      {tab === "tehnicki" ? (
        <section className="event-page-panel event-page-stub" role="tabpanel" aria-label="Tehnički">
          <div className="event-page-empty">
            <span className="event-page-empty-icon" aria-hidden="true">
              <TechIcon />
            </span>
            <h3 className="event-page-stub-title">Tehnički</h3>
            <p className="event-page-stub-copy">Rider, stage i tehnika — uskoro.</p>
          </div>
        </section>
      ) : null}

      {tab === "show" ? (
        <section className="event-page-panel event-page-stub" role="tabpanel" aria-label="Show">
          <div className="event-page-empty">
            <span className="event-page-empty-icon" aria-hidden="true">
              <ShowIcon />
            </span>
            <h3 className="event-page-stub-title">Show</h3>
            <p className="event-page-stub-copy">Setlista i show materijal — uskoro.</p>
          </div>
        </section>
      ) : null}

      {tab === "finansije" && canSeeFinance ? (
        <section className="event-page-panel event-page-finance" role="tabpanel" aria-label="Finansije">
          <h3 className="event-page-section-title">
            <HonorarIcon />
            <span>Honorari</span>
          </h3>
          <EventFinancePanel
            eventId={event.id}
            bandId={event.bandId || band?.id}
            showToast={showToast}
            onChanged={async () => {
              await onRefreshSchedule?.();
            }}
          />
          <h3 className="event-page-section-title event-page-section-title-spaced">
            <ExpenseIcon />
            <span>Troškovi</span>
          </h3>
          <EventExpensesPanel
            eventId={event.id}
            bandId={event.bandId || band?.id}
            showToast={showToast}
            onChanged={async () => {
              await onRefreshSchedule?.();
            }}
          />
        </section>
      ) : null}

      {tab === "osnovno" ? (
        <div className="event-page-footer">
          <button
            type="button"
            className="event-page-full-details is-muted"
            aria-label="Kompletni detalji — uskoro"
            title="Uskoro"
            disabled
          >
            <DetailsIcon />
            <span>Kompletni detalji</span>
            <em className="event-page-full-details-soon">uskoro</em>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formFromEvent(event) {
  return {
    date: event?.date || "",
    city: event?.city || "",
    venue: event?.venue || "",
    note: event?.note || "",
  };
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
      <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 10V8a4 4 0 0 1 8 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DetailsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8 7h11M8 12h11M8 17h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="5" cy="7" r="1.1" fill="currentColor" />
      <circle cx="5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="5" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

function TechIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="6" width="16" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 7h14v11H5zM9 7V5.5A3 3 0 0 1 15 5.5V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HonorarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 8v8M14.5 9.5c0-1-1.1-1.75-2.5-1.75s-2.5.75-2.5 1.75 1.1 1.75 2.5 1.75 2.5.75 2.5 1.75-1.1 1.75-2.5 1.75-2.5-.75-2.5-1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExpenseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6 7h12v12H6zM9 7V5.8A3 3 0 0 1 15 5.8V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
