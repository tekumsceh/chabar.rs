import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { numberValue } from "./calculations.js";
import FieldSelect from "./FieldSelect.jsx";

const FALLBACK_CURRENCIES = ["EUR", "USD", "GBP", "RSD", "CHF", "JPY", "CAD", "AUD", "SEK", "PLN"];

const emptyForm = {
  amount: "",
  currency: "EUR",
  description: "",
  payee: "",
};

function parseAmount(raw) {
  return numberValue(String(raw || "").replace(",", "."));
}

function hasValidAmount(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  const amount = parseAmount(trimmed);
  return Number.isFinite(amount) && amount >= 0;
}

/**
 * Owner/lead: event expenses (troškovi) — amount, currency, opis, kome.
 * Past dates: read-only list (no add/delete).
 * Data comes from EventPage finance prefetch (no self-fetch).
 */
export default function EventExpensesPanel({
  eventId,
  bandId,
  readOnly = false,
  showToast,
  onChanged,
  members = [],
  expenses = [],
  currencies = null,
  loading = false,
  error = "",
  onExpensesChange,
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const descWrapRef = useRef(null);
  const descInputRef = useRef(null);

  const currencyList = currencies?.length ? currencies : FALLBACK_CURRENCIES;

  const payeeOptions = useMemo(() => {
    const options = [
      { id: "band", label: "Bend" },
      { id: "external", label: "Spoljnji" },
      ...members.map((member) => ({ id: `member:${member.id}`, label: member.name })),
    ];
    return options;
  }, [members]);

  const currencyOptions = useMemo(
    () => currencyList.map((code) => ({ id: code, label: code })),
    [currencyList],
  );

  const amountReady = hasValidAmount(form.amount);
  const descriptionReady = Boolean(String(form.description || "").trim());

  useEffect(() => {
    if (!descOpen) return undefined;

    function onPointerDown(event) {
      if (!descWrapRef.current?.contains(event.target)) setDescOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [descOpen]);

  useEffect(() => {
    if (descOpen) descInputRef.current?.focus();
  }, [descOpen]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function parsePayee(value) {
    if (value === "band" || value === "external") {
      return { payeeKind: value, payeeUserId: null };
    }
    if (String(value).startsWith("member:")) {
      return { payeeKind: "member", payeeUserId: String(value).slice("member:".length) };
    }
    return null;
  }

  async function addExpense(event) {
    event?.preventDefault?.();
    if (readOnly || saving || !eventId || !bandId || !amountReady) return;

    const amount = parseAmount(form.amount);
    const description = String(form.description || "").trim();
    const payee = parsePayee(form.payee);

    if (!description) {
      setDescOpen(true);
      showToast?.("Unesi opis", "error");
      return;
    }
    if (!payee) {
      showToast?.("Izaberi kome", "error");
      return;
    }

    setSaving(true);
    try {
      const created = await api(`/api/events/${eventId}/expenses`, {
        method: "POST",
        bandId,
        body: {
          amount,
          currency: form.currency || "EUR",
          description,
          payeeKind: payee.payeeKind,
          payeeUserId: payee.payeeUserId,
        },
      });
      onExpensesChange?.([...(expenses || []), created]);
      setForm(emptyForm);
      setDescOpen(false);
      setFormOpen(false);
      showToast?.("Trošak dodat");
      await onChanged?.();
    } catch (requestError) {
      showToast?.(requestError.message || "Trošak nije sačuvan", "error");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setForm(emptyForm);
    setDescOpen(false);
    setFormOpen(false);
  }

  async function removeExpense(item) {
    if (readOnly || busyId || !eventId || !bandId) return;
    setBusyId(item.id);
    try {
      await api(`/api/events/${eventId}/expenses/${item.id}`, {
        method: "DELETE",
        bandId,
      });
      onExpensesChange?.((expenses || []).filter((row) => row.id !== item.id));
      showToast?.("Trošak obrisan");
      await onChanged?.();
    } catch (requestError) {
      showToast?.(requestError.message || "Brisanje nije uspelo", "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <>
        <h3 className="event-page-section-title event-page-section-title-spaced">
          <ExpenseIcon />
          <span>Troškovi</span>
        </h3>
        <p className="event-finance-status">Učitavam troškove…</p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h3 className="event-page-section-title event-page-section-title-spaced">
          <ExpenseIcon />
          <span>Troškovi</span>
        </h3>
        <p className="event-finance-status is-error">{error}</p>
      </>
    );
  }

  if (readOnly && !expenses.length) {
    return null;
  }

  return (
    <>
      <h3 className="event-page-section-title event-page-section-title-spaced">
        <ExpenseIcon />
        <span>Troškovi</span>
      </h3>
      <div className={`event-expenses ${readOnly ? "is-readonly" : ""}`}>
        {readOnly ? (
          <p className="event-finance-status event-expenses-locknote">
            Prošli termin — troškovi su zaključani (samo pregled).
          </p>
        ) : formOpen ? (
          <form className="event-expenses-form" onSubmit={addExpense}>
            <label className="event-expenses-amount">
              <span className="sr-only">Iznos</span>
              <input
                id="expense-amount"
                name="expense-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Iznos"
                value={form.amount}
                disabled={saving}
                onChange={(e) => updateForm("amount", e.target.value)}
              />
            </label>
            <FieldSelect
              id="expenseCurrency"
              label="Valuta"
              className="event-expenses-currency"
              value={form.currency}
              options={currencyOptions}
              disabled={saving}
              onChange={(id) => updateForm("currency", id)}
            />
            <FieldSelect
              id="expensePayee"
              label="Kome"
              className="event-expenses-payee"
              value={form.payee}
              placeholder="Kome"
              options={payeeOptions}
              disabled={saving}
              onChange={(id) => updateForm("payee", id)}
            />
            <div className="event-expenses-desc-wrap" ref={descWrapRef}>
              <button
                type="button"
                className={`event-finance-icon-btn event-expenses-desc-btn ${descriptionReady ? "is-filled" : ""}`}
                aria-label={descriptionReady ? `Opis: ${form.description}` : "Dodaj opis"}
                aria-expanded={descOpen}
                title={descriptionReady ? form.description : "Opis"}
                disabled={saving}
                onClick={() => setDescOpen((open) => !open)}
              >
                <NoteIcon />
              </button>
              {descOpen ? (
                <div className="event-expenses-desc-popover" role="dialog" aria-label="Opis troška">
                  <input
                    ref={descInputRef}
                    id="expense-description"
                    name="expense-description"
                    type="text"
                    autoComplete="off"
                    placeholder="Opis"
                    maxLength={200}
                    value={form.description}
                    disabled={saving}
                    onChange={(e) => updateForm("description", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setDescOpen(false);
                      }
                      if (e.key === "Escape") setDescOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
            <button
              type="submit"
              className="event-finance-icon-btn event-finance-icon-btn-accent event-expenses-submit"
              aria-label="Dodaj trošak"
              title="Dodaj"
              disabled={saving || !amountReady}
            >
              {saving ? "…" : <CheckIcon />}
            </button>
            <button
              type="button"
              className="event-finance-icon-btn event-expenses-cancel"
              aria-label="Otkaži"
              title="Otkaži"
              disabled={saving}
              onClick={closeForm}
            >
              <CloseIcon />
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="event-expenses-add-trigger"
            aria-label="Dodaj trošak"
            onClick={() => setFormOpen(true)}
          >
            <PlusIcon />
            <span>Dodaj trošak</span>
          </button>
        )}

        {expenses.length ? (
          <ul className="event-expenses-list" aria-label="Lista troškova">
            {expenses.map((item) => (
              <li key={item.id} className="event-expenses-item">
                <div className="event-expenses-item-main">
                  <strong className="event-expenses-item-amount">
                    {formatAmount(item.amount)} {item.currency}
                  </strong>
                  <span className="event-expenses-item-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="event-expenses-item-desc">{item.description || "—"}</span>
                  {item.payeeName ? (
                    <>
                      <span className="event-expenses-item-sep" aria-hidden="true">
                        ·
                      </span>
                      <span className="event-expenses-item-payee">{item.payeeName}</span>
                    </>
                  ) : null}
                </div>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="raspored-icon-btn raspored-icon-btn-danger"
                    aria-label="Obriši trošak"
                    title="Obriši"
                    disabled={Boolean(busyId) || saving}
                    onClick={() => removeExpense(item)}
                  >
                    {busyId === item.id ? "…" : <CloseIcon />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5 10 17.5 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7 4h10a1 1 0 0 1 1 1v14l-4-2.2L10 19V5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 8h6M10 11.5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
