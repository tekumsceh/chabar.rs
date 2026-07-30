import { useEffect, useState } from "react";
import { api } from "./api.js";

export const DAY_TIME_FIELDS = [
  { key: "gatheringTime", label: "Okupljanje" },
  { key: "departureTime", label: "Polazak" },
  { key: "lodgingArrivalTime", label: "Planirani dolazak u smeštaj" },
  { key: "loadInTime", label: "Load-in" },
  { key: "setUpTime", label: "Set up" },
  { key: "soundcheckTime", label: "Soundcheck", hasDuration: true },
  { key: "showStartTime", label: "Show start" },
  { key: "showEndTime", label: "Show end" },
  { key: "curfewTime", label: "Curfew" },
  { key: "leaveTime", label: "Odlazak" },
];

export const emptyDayDetails = {
  gatheringTime: "",
  departureTime: "",
  lodgingArrivalTime: "",
  loadInTime: "",
  setUpTime: "",
  soundcheckTime: "",
  soundcheckDurationMin: "",
  showStartTime: "",
  showEndTime: "",
  curfewTime: "",
  leaveTime: "",
};

export function dayDetailsFromApi(data) {
  return {
    gatheringTime: data?.gatheringTime || "",
    departureTime: data?.departureTime || "",
    lodgingArrivalTime: data?.lodgingArrivalTime || "",
    loadInTime: data?.loadInTime || "",
    setUpTime: data?.setUpTime || "",
    soundcheckTime: data?.soundcheckTime || "",
    soundcheckDurationMin:
      data?.soundcheckDurationMin == null || data?.soundcheckDurationMin === ""
        ? ""
        : String(data.soundcheckDurationMin),
    showStartTime: data?.showStartTime || "",
    showEndTime: data?.showEndTime || "",
    curfewTime: data?.curfewTime || "",
    leaveTime: data?.leaveTime || "",
  };
}

export function formatDayDetailValue(details, field) {
  const time = String(details?.[field.key] || "").trim();
  if (!time) return "";
  if (field.hasDuration) {
    const mins = String(details?.soundcheckDurationMin ?? "").trim();
    return mins ? `${time} (${mins} min)` : time;
  }
  return time;
}

/**
 * Kompletni detalji — day timeline (times + soundcheck duration).
 */
export default function EventDayDetails({
  eventId,
  bandId,
  readOnly = false,
  showToast,
  onSaved,
}) {
  const [form, setForm] = useState(emptyDayDetails);
  const [initial, setInitial] = useState(emptyDayDetails);
  const [loading, setLoading] = useState(Boolean(eventId && bandId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId || !bandId) {
        if (!cancelled) {
          setLoading(false);
          setError("Nedostaje bend za ovaj termin.");
        }
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await api(`/api/events/${eventId}/day-details`, { bandId });
        if (cancelled) return;
        const next = dayDetailsFromApi(data);
        setForm(next);
        setInitial(next);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Detalji nisu učitani.");
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

  const dirty = DAY_TIME_FIELDS.some((field) => form[field.key] !== initial[field.key])
    || String(form.soundcheckDurationMin ?? "") !== String(initial.soundcheckDurationMin ?? "");

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event?.preventDefault?.();
    if (readOnly || saving || !eventId || !bandId) return;

    setSaving(true);
    try {
      const durationRaw = String(form.soundcheckDurationMin ?? "").trim();
      const body = {
        gatheringTime: form.gatheringTime,
        departureTime: form.departureTime,
        lodgingArrivalTime: form.lodgingArrivalTime,
        loadInTime: form.loadInTime,
        setUpTime: form.setUpTime,
        soundcheckTime: form.soundcheckTime,
        soundcheckDurationMin: durationRaw === "" ? null : Number(durationRaw.replace(",", ".")),
        showStartTime: form.showStartTime,
        showEndTime: form.showEndTime,
        curfewTime: form.curfewTime,
        leaveTime: form.leaveTime,
      };
      const saved = await api(`/api/events/${eventId}/day-details`, {
        method: "PUT",
        bandId,
        body,
      });
      const next = dayDetailsFromApi(saved);
      setForm(next);
      setInitial(next);
      setError("");
      onSaved?.(next);
      showToast?.("Detalji sačuvani");
    } catch (requestError) {
      showToast?.(requestError.message || "Čuvanje nije uspelo", "error");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setForm(initial);
  }

  return (
    <form className={`event-day-details ${readOnly ? "is-readonly" : ""}`} onSubmit={save}>
      {loading ? <p className="event-finance-status">Učitavam detalje…</p> : null}
      {error ? <p className="event-finance-status is-error">{error}</p> : null}
      {readOnly ? (
        <p className="event-finance-status event-day-details-locknote">
          Prošli termin — detalji su zaključani (samo pregled).
        </p>
      ) : null}

      <ul className="event-day-details-list" aria-label="Vremenski raspored dana">
        {DAY_TIME_FIELDS.map((field) => (
          <li
            key={field.key}
            className={`event-day-details-row ${field.hasDuration ? "has-duration" : ""}`}
          >
            <label className="event-day-details-label" htmlFor={`day-${field.key}`}>
              {field.label}
            </label>
            <div className="event-day-details-controls">
              <input
                id={`day-${field.key}`}
                type="time"
                value={form[field.key] || ""}
                disabled={readOnly || saving || loading}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
              {field.hasDuration ? (
                <label className="event-day-details-duration" htmlFor="day-soundcheck-duration">
                  <span className="sr-only">Trajanje soundcheck-a (minuti)</span>
                  <input
                    id="day-soundcheck-duration"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1440}
                    step={5}
                    placeholder="min"
                    value={form.soundcheckDurationMin}
                    disabled={readOnly || saving || loading}
                    onChange={(e) => updateField("soundcheckDurationMin", e.target.value)}
                  />
                  <em>min</em>
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <div className="event-day-details-actions">
          <button type="button" className="danger" onClick={cancel} disabled={saving || loading || !dirty}>
            Otkaži
          </button>
          <button type="submit" disabled={saving || loading || !dirty}>
            {saving ? "Čuvam..." : "Sačuvaj"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
