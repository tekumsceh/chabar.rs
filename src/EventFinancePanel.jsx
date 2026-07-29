import { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatEur, numberValue } from "./calculations.js";

function hasValidDraft(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return false;
  const priceEur = numberValue(trimmed.replace(",", "."));
  return Number.isFinite(priceEur) && priceEur >= 0;
}

/**
 * Owner/lead: set per-member honorar for one date.
 * Default button fills draft from member.defaultPriceEur (storage/UI TBD).
 */
export default function EventFinancePanel({ eventId, bandId, readOnly = false, showToast, onChanged }) {
  const [members, setMembers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId || !bandId) return;
      setLoading(true);
      setError("");
      try {
        const data = await api(`/api/events/${eventId}/member-finance`, { bandId });
        if (cancelled) return;
        const list = Array.isArray(data.members) ? data.members : [];
        setMembers(list);
        const nextDrafts = {};
        for (const member of list) {
          nextDrafts[member.id] =
            numberValue(member.priceEur) > 0 ? String(numberValue(member.priceEur)) : "";
        }
        setDrafts(nextDrafts);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Finansije nisu učitane.");
          setMembers([]);
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

  function updateDraft(userId, value) {
    setDrafts((current) => ({ ...current, [userId]: value }));
  }

  function applyDefault(member) {
    if (member.defaultPriceEur == null || Number.isNaN(Number(member.defaultPriceEur))) {
      showToast?.("Podrazumevani honorar još nije podešen", "error");
      return;
    }
    updateDraft(member.id, String(numberValue(member.defaultPriceEur)));
  }

  async function setFee(member) {
    if (readOnly || busyId || !eventId || !bandId) return;
    const raw = String(drafts[member.id] ?? "").trim().replace(",", ".");
    if (raw === "") {
      showToast?.("Unesi iznos", "error");
      return;
    }
    const priceEur = numberValue(raw);
    if (!Number.isFinite(priceEur) || priceEur < 0) {
      showToast?.("Iznos nije ispravan", "error");
      return;
    }

    setBusyId(member.id);
    try {
      await api(`/api/events/${eventId}/member-finance/${member.id}`, {
        method: "PUT",
        bandId,
        body: { priceEur },
      });
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, priceEur } : item)),
      );
      updateDraft(member.id, priceEur > 0 ? String(priceEur) : "");
      showToast?.(`Honorar: ${member.name} · ${formatEur(priceEur)}`);
      await onChanged?.(member.id, priceEur);
    } catch (requestError) {
      showToast?.(requestError.message || "Honorar nije sačuvan", "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <p className="event-finance-status">Učitavam članove…</p>;
  }

  if (error) {
    return <p className="event-finance-status is-error">{error}</p>;
  }

  if (!members.length) {
    return <p className="event-finance-status">Nema članova u bendu.</p>;
  }

  return (
    <ul className="event-finance-list" aria-label="Honorari po članu">
      {members.map((member) => {
        const busy = busyId === member.id;
        const amountReady = hasValidDraft(drafts[member.id]);
        const rowBusy = busy || Boolean(busyId);
        return (
          <li key={member.id} className="event-finance-row">
            <strong className="event-finance-name" title={member.name}>
              {member.name}
            </strong>
            <label className="event-finance-amount">
              <span className="sr-only">Iznos EUR za {member.name}</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                maxLength={6}
                placeholder="€"
                value={drafts[member.id] ?? ""}
                disabled={readOnly || rowBusy}
                readOnly={readOnly}
                onChange={(event) => updateDraft(member.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && amountReady) {
                    event.preventDefault();
                    setFee(member);
                  }
                }}
              />
            </label>
            {readOnly ? null : (
              <>
                <button
                  type="button"
                  className="event-finance-icon-btn event-finance-icon-btn-accent"
                  aria-label={`Postavi honorar za ${member.name}`}
                  title="Postavi"
                  disabled={rowBusy || !amountReady}
                  onClick={() => setFee(member)}
                >
                  {busy ? "…" : <CheckIcon />}
                </button>
                <button
                  type="button"
                  className="event-finance-icon-btn"
                  aria-label={`Podrazumevani honorar za ${member.name}`}
                  title="Podrazumevano"
                  disabled={rowBusy}
                  onClick={() => applyDefault(member)}
                >
                  <DefaultIcon />
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
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

function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3v4M8 7h8M7 11h10v10l-5-2.5L7 21V11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
