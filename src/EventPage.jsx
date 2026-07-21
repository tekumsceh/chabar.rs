import { useEffect, useMemo, useState } from "react";
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

const TABS = [
  { id: "osnovno", label: "Osnovno" },
  { id: "tehnicki", label: "Tehnički" },
  { id: "show", label: "Show" },
  { id: "finansije", label: "Finansije", leadOnly: true },
];

export default function EventPage({ event, band = null, settings = {}, onBack, onUpdate, showToast }) {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("osnovno");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(() => formFromEvent(event));
  const [initialForm, setInitialForm] = useState(() => formFromEvent(event));

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

  async function requestBack() {
    if (editing && isDirty) {
      const confirmed = await confirm({
        title: "Nesačuvane izmene",
        message: "Imaš nesačuvane izmene. Napustiti stranicu bez čuvanja?",
        confirmLabel: "Napusti",
        cancelLabel: "Ostani",
        danger: true,
      });
      if (!confirmed) return;
    }
    onBack?.();
  }

  async function saveEdit(submitEvent) {
    submitEvent?.preventDefault?.();
    if (saving || locked) return;

    const date = String(form.date || "").trim();
    const city = String(form.city || "").trim();
    const venue = String(form.venue || "").trim();
    const note = String(form.note || "").trim();

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

    if (!isDirty) {
      setFormError("Nema izmena za čuvanje.");
      return;
    }

    const confirmed = await confirm({
      title: "Sačuvati izmene?",
      message: `${date}${city ? ` — ${city}` : ""}`,
      confirmLabel: "Sačuvaj",
      cancelLabel: "Otkaži",
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      setFormError("");
      await onUpdate?.(event.id, { date, city, venue, note });
      setInitialForm({ date, city, venue, note });
      setForm({ date, city, venue, note });
      setEditing(false);
    } catch (error) {
      setFormError(error.message || "Nije moguće sačuvati termin.");
    } finally {
      setSaving(false);
    }
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
          <span className="event-page-lock" title="Prošli termin je zaključan">
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
                <dd>{hasFee ? formatEur(myFee) : "—"}</dd>
              </div>
            </dl>
          )}
        </section>
      ) : null}

      {tab === "tehnicki" ? (
        <section className="event-page-panel event-page-stub" role="tabpanel" aria-label="Tehnički">
          <h3 className="event-page-stub-title">Tehnički</h3>
          <p className="event-page-stub-copy">Tehnički detalji termina — uskoro.</p>
        </section>
      ) : null}

      {tab === "show" ? (
        <section className="event-page-panel event-page-stub" role="tabpanel" aria-label="Show">
          <h3 className="event-page-stub-title">Show</h3>
          <p className="event-page-stub-copy">Setlista i show materijal — uskoro.</p>
        </section>
      ) : null}

      {tab === "finansije" && canSeeFinance ? (
        <section className="event-page-panel event-page-stub" role="tabpanel" aria-label="Finansije">
          <h3 className="event-page-stub-title">Finansije</h3>
          <p className="event-page-stub-copy">Pregled finansija termina za vlasnika i lead — uskoro.</p>
        </section>
      ) : null}

      <div className="event-page-footer">
        <button
          type="button"
          className="event-page-full-details"
          aria-label="Kompletni detalji"
          title="Kompletni detalji"
          onClick={() => showToast?.("Kompletni detalji — uskoro")}
        >
          <DetailsIcon />
          <span>Kompletni detalji</span>
        </button>
      </div>
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
