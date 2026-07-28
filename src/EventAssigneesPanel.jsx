import { useEffect, useState } from "react";
import { api } from "./api.js";
import FieldSelect from "./FieldSelect.jsx";

/**
 * Owner/lead: assign saradnici to this event date (manual only).
 */
export default function EventAssigneesPanel({ eventId, bandId, showToast }) {
  const [assignees, setAssignees] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [pick, setPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId || !bandId) return;
      setLoading(true);
      try {
        const data = await api(`/api/events/${eventId}/assignees`, { bandId });
        if (cancelled) return;
        setAssignees(Array.isArray(data.assignees) ? data.assignees : []);
        setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        setCanManage(Boolean(data.canManage));
      } catch (error) {
        if (!cancelled) {
          setAssignees([]);
          setCandidates([]);
          showToast?.(error.message || "Dodele nisu učitane", "error");
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

  const available = candidates.filter((row) => !assignees.some((a) => a.id === row.id));

  async function addAssignee(userId) {
    if (!canManage || busy || !userId) return;
    setBusy(true);
    try {
      const created = await api(`/api/events/${eventId}/assignees`, {
        method: "POST",
        bandId,
        body: { userId },
      });
      setAssignees((current) => [...current, created]);
      setPick("");
      showToast?.("Saradnik dodeljen terminu");
    } catch (error) {
      showToast?.(error.message || "Dodela nije uspela", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignee(userId) {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await api(`/api/events/${eventId}/assignees/${userId}`, { method: "DELETE", bandId });
      setAssignees((current) => current.filter((row) => row.id !== userId));
      showToast?.("Dodela uklonjena");
    } catch (error) {
      showToast?.(error.message || "Uklanjanje nije uspelo", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="event-finance-status">Učitavam dodele…</p>;
  }

  if (!canManage && assignees.length === 0 && candidates.length === 0) {
    return null;
  }

  return (
    <div className="event-assignees">
      <p className="event-assignees-note">
        Saradnici vide ovaj termin samo ako su ovde dodeljeni.
      </p>
      {assignees.length ? (
        <ul className="event-assignees-list" aria-label="Dodeljeni saradnici">
          {assignees.map((row) => (
            <li key={row.id} className="event-assignees-item">
              <span>{row.name}</span>
              {canManage ? (
                <button
                  type="button"
                  className="raspored-icon-btn raspored-icon-btn-danger"
                  aria-label={`Ukloni ${row.name}`}
                  title="Ukloni"
                  disabled={busy}
                  onClick={() => removeAssignee(row.id)}
                >
                  <CloseIcon />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="event-finance-status event-expenses-empty">Nema dodeljenih saradnika.</p>
      )}
      {canManage && available.length ? (
        <div className="event-assignees-add">
          <FieldSelect
            id="eventAssigneePick"
            label="Dodeli saradnika"
            value={pick}
            placeholder="Izaberi saradnika"
            options={available.map((row) => ({ id: row.id, label: row.name }))}
            disabled={busy}
            onChange={(id) => setPick(id)}
          />
          <button
            type="button"
            className="event-finance-btn event-finance-btn-set"
            disabled={busy || !pick}
            onClick={() => addAssignee(pick)}
          >
            Dodeli
          </button>
        </div>
      ) : null}
      {canManage && !candidates.length ? (
        <p className="event-finance-status">Nema saradnika u bendu — prvo postavi ulogu na Bendovima.</p>
      ) : null}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
