import { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatEur, numberValue } from "./calculations.js";

/**
 * Owner/lead: set per-member honorar for one date.
 * Default button fills draft from member.defaultPriceEur (storage/UI TBD).
 */
export default function EventFinancePanel({ eventId, bandId, showToast, onChanged }) {
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
    if (busyId || !eventId || !bandId) return;
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
                disabled={busy || Boolean(busyId)}
                onChange={(event) => updateDraft(member.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setFee(member);
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="event-finance-btn event-finance-btn-set"
              disabled={busy || Boolean(busyId)}
              onClick={() => setFee(member)}
            >
              {busy ? "…" : "Postavi"}
            </button>
            <button
              type="button"
              className="event-finance-btn event-finance-btn-default"
              disabled={busy || Boolean(busyId)}
              title="Unesi podrazumevani honorar"
              onClick={() => applyDefault(member)}
            >
              Podrazumevano
            </button>
          </li>
        );
      })}
    </ul>
  );
}
