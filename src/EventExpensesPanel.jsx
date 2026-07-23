import { useEffect, useMemo, useState } from "react";
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

/**
 * Owner/lead: event expenses (troškovi) — amount, currency, opis, kome.
 */
export default function EventExpensesPanel({ eventId, bandId, showToast, onChanged }) {
  const [members, setMembers] = useState([]);
  const [currencies, setCurrencies] = useState(FALLBACK_CURRENCIES);
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const payeeOptions = useMemo(() => {
    const options = [
      { id: "band", label: "Bend" },
      { id: "external", label: "Spoljnji" },
      ...members.map((member) => ({ id: `member:${member.id}`, label: member.name })),
    ];
    return options;
  }, [members]);

  const currencyOptions = useMemo(
    () => (currencies.length ? currencies : FALLBACK_CURRENCIES).map((code) => ({ id: code, label: code })),
    [currencies],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId || !bandId) return;
      setLoading(true);
      setError("");
      try {
        const data = await api(`/api/events/${eventId}/expenses`, { bandId });
        if (cancelled) return;
        setMembers(Array.isArray(data.members) ? data.members : []);
        setCurrencies(Array.isArray(data.currencies) && data.currencies.length ? data.currencies : FALLBACK_CURRENCIES);
        setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Troškovi nisu učitani.");
          setExpenses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, bandId]);

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
    if (saving || !eventId || !bandId) return;

    const amount = numberValue(String(form.amount || "").replace(",", "."));
    const description = String(form.description || "").trim();
    const payee = parsePayee(form.payee);

    if (!Number.isFinite(amount) || amount < 0) {
      showToast?.("Unesi ispravan iznos", "error");
      return;
    }
    if (!description) {
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
      setExpenses((current) => [...current, created]);
      setForm(emptyForm);
      showToast?.("Trošak dodat");
      await onChanged?.();
    } catch (requestError) {
      showToast?.(requestError.message || "Trošak nije sačuvan", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(item) {
    if (busyId || !eventId || !bandId) return;
    setBusyId(item.id);
    try {
      await api(`/api/events/${eventId}/expenses/${item.id}`, {
        method: "DELETE",
        bandId,
      });
      setExpenses((current) => current.filter((row) => row.id !== item.id));
      showToast?.("Trošak obrisan");
      await onChanged?.();
    } catch (requestError) {
      showToast?.(requestError.message || "Brisanje nije uspelo", "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <p className="event-finance-status">Učitavam troškove…</p>;
  }

  if (error) {
    return <p className="event-finance-status is-error">{error}</p>;
  }

  return (
    <div className="event-expenses">
      <form className="event-expenses-form" onSubmit={addExpense}>
        <div className="event-expenses-row-top">
          <label className="event-expenses-amount">
            <span className="sr-only">Iznos</span>
            <input
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
            value={form.currency}
            options={currencyOptions}
            disabled={saving}
            onChange={(id) => updateForm("currency", id)}
          />
        </div>
        <label className="event-expenses-opis">
          <span className="sr-only">Opis</span>
          <input
            type="text"
            autoComplete="off"
            placeholder="Opis"
            maxLength={200}
            value={form.description}
            disabled={saving}
            onChange={(e) => updateForm("description", e.target.value)}
          />
        </label>
        <div className="event-expenses-row-bottom">
          <FieldSelect
            id="expensePayee"
            label="Kome"
            value={form.payee}
            placeholder="Kome"
            options={payeeOptions}
            disabled={saving}
            onChange={(id) => updateForm("payee", id)}
          />
          <button type="submit" className="event-finance-btn event-finance-btn-set" disabled={saving}>
            {saving ? "…" : "Dodaj"}
          </button>
        </div>
      </form>

      {expenses.length ? (
        <ul className="event-expenses-list" aria-label="Lista troškova">
          {expenses.map((item) => (
            <li key={item.id} className="event-expenses-item">
              <div className="event-expenses-item-main">
                <strong className="event-expenses-item-amount">
                  {formatAmount(item.amount)} {item.currency}
                </strong>
                <span className="event-expenses-item-desc">{item.description || "—"}</span>
                <span className="event-expenses-item-payee">{item.payeeName || "—"}</span>
              </div>
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="event-finance-status event-expenses-empty">Nema troškova za ovaj termin.</p>
      )}
    </div>
  );
}

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
