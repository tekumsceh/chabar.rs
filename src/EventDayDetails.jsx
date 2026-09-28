import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api } from "./api.js";
import { useT } from "./i18n/I18nProvider.jsx";

export const DAY_TIME_FIELDS = [
  { key: "gatheringTime", labelKey: "day.gathering" },
  { key: "departureTime", labelKey: "day.departure" },
  { key: "lodgingArrivalTime", labelKey: "day.lodgingArrival" },
  { key: "loadInTime", labelKey: "day.loadIn" },
  { key: "setUpTime", labelKey: "day.setUp" },
  { key: "soundcheckTime", labelKey: "day.soundcheck", hasDuration: true },
  { key: "showStartTime", labelKey: "day.showStart" },
  { key: "showEndTime", labelKey: "day.showEnd" },
  { key: "curfewTime", labelKey: "day.curfew" },
  { key: "leaveTime", labelKey: "day.leave" },
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

function isDayDetailsDirty(form, initial) {
  return (
    DAY_TIME_FIELDS.some((field) => form[field.key] !== initial[field.key]) ||
    String(form.soundcheckDurationMin ?? "") !== String(initial.soundcheckDurationMin ?? "")
  );
}

/**
 * Day timeline — always visible inputs; parent confirms + commits on leave.
 */
const EventDayDetails = forwardRef(function EventDayDetails(
  { eventId, bandId, readOnly = false, showToast, onSaved },
  ref,
) {
  const t = useT();
  const [form, setForm] = useState(emptyDayDetails);
  const [initial, setInitial] = useState(emptyDayDetails);
  const [loading, setLoading] = useState(Boolean(eventId && bandId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef(form);
  const initialRef = useRef(initial);
  const savingRef = useRef(false);

  formRef.current = form;
  initialRef.current = initial;
  savingRef.current = saving;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId || !bandId) {
        if (!cancelled) {
          setLoading(false);
          setError(t("common.missingBand"));
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
          setError(requestError.message || t("day.loadFail"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, bandId, t]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function revert() {
    setForm(initialRef.current);
  }

  async function save() {
    if (readOnly || savingRef.current || !eventId || !bandId) return false;
    if (!isDayDetailsDirty(formRef.current, initialRef.current)) return true;

    setSaving(true);
    savingRef.current = true;
    try {
      const current = formRef.current;
      const durationRaw = String(current.soundcheckDurationMin ?? "").trim();
      const body = {
        gatheringTime: current.gatheringTime,
        departureTime: current.departureTime,
        lodgingArrivalTime: current.lodgingArrivalTime,
        loadInTime: current.loadInTime,
        setUpTime: current.setUpTime,
        soundcheckTime: current.soundcheckTime,
        soundcheckDurationMin: durationRaw === "" ? null : Number(durationRaw.replace(",", ".")),
        showStartTime: current.showStartTime,
        showEndTime: current.showEndTime,
        curfewTime: current.curfewTime,
        leaveTime: current.leaveTime,
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
      return true;
    } catch (requestError) {
      setError(requestError.message || t("day.saveFail"));
      showToast?.(requestError.message || t("day.saveFail"), "error");
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  useImperativeHandle(ref, () => ({
    isDirty: () => isDayDetailsDirty(formRef.current, initialRef.current),
    revert,
    save,
  }));

  return (
    <div className={`event-day-details ${readOnly ? "is-readonly" : ""}`}>
      {loading ? <p className="event-finance-status">{t("day.loading")}</p> : null}
      {error ? <p className="event-finance-status is-error">{error}</p> : null}
      {readOnly ? (
        <p className="event-finance-status event-day-details-locknote">{t("day.locked")}</p>
      ) : null}

      <ul className="event-day-details-list" aria-label={t("day.scheduleAria")}>
        {DAY_TIME_FIELDS.map((field) => (
          <li
            key={field.key}
            className={`event-day-details-row ${field.hasDuration ? "has-duration" : ""}`}
          >
            <label className="event-day-details-label" htmlFor={`day-${field.key}`}>
              {t(field.labelKey)}
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
                  <span className="sr-only">{t("day.soundcheckDuration")}</span>
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
    </div>
  );
});

export default EventDayDetails;
