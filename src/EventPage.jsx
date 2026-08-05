import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatEur,
  formatScheduleDateParts,
  fromIsoDate,
  numberValue,
  parseDate,
  startOfToday,
  toIsoDate,
} from "./calculations.js";
import { useConfirm } from "./confirmDialog.jsx";
import EventFinancePanel from "./EventFinancePanel.jsx";
import EventExpensesPanel from "./EventExpensesPanel.jsx";
import EventDayDetails, {
  DAY_TIME_FIELDS,
  dayDetailsFromApi,
  emptyDayDetails,
  formatDayDetailValue,
} from "./EventDayDetails.jsx";
import TechnicalRiderPanel, { prefetchTechRider } from "./TechnicalRiderPanel.jsx";
import SetListPanel from "./SetListPanel.jsx";
import EventRackStubPanel from "./EventRackStubPanel.jsx";
import FieldSelect from "./FieldSelect.jsx";
import FadeScroll from "./FadeScroll.jsx";
import { api } from "./api.js";
import { parseMapsVenueInput, resolveMapsUrl } from "./mapsLink.js";
import { useT } from "./i18n/I18nProvider.jsx";
import {
  buildDuplicateConfirmMessage,
  findScheduleDuplicates,
  hasScheduleDuplicates,
  sameCalendarDay,
} from "./scheduleConflicts.js";

const TABS = [
  { id: "osnovno", labelKey: "event.tab.osnovno" },
  { id: "tehnicki", labelKey: "event.tab.tehnicki" },
  { id: "show", labelKey: "event.tab.show" },
  { id: "finansije", labelKey: "event.tab.finansije", leadOnly: true },
];

const TECH_SUBTABS = [
  { id: "technical-rider", labelKey: "event.sub.technical" },
  { id: "hospitality-rider", labelKey: "event.sub.hospitality" },
  { id: "lighting-rider", labelKey: "event.sub.lighting" },
  { id: "stage-plot", labelKey: "event.sub.stage" },
];

const SHOW_SUBTABS = [
  { id: "set-lists", labelKey: "event.sub.setlists" },
  { id: "visuals", labelKey: "event.sub.visuals" },
];

const EMPTY_FINANCE_MEMBERS = [];
const EMPTY_FINANCE_EXPENSES = [];

export default function EventPage({
  event,
  band = null,
  bands = [],
  events = [],
  profile = null,
  onBack,
  onUpdate,
  onRefreshSchedule,
  leaveSignal = 0,
  showToast,
  initialTab = "osnovno",
  initialTechSubTab = "",
  initialShowSubTab = "",
  initialDetailsOpen = false,
}) {
  const t = useT();
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("osnovno");
  const [techSubTab, setTechSubTab] = useState(TECH_SUBTABS[0].id);
  const [techRiderMounted, setTechRiderMounted] = useState(false);
  const [showSubTab, setShowSubTab] = useState(SHOW_SUBTABS[0].id);
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(() => formFromEvent(event));
  const [initialForm, setInitialForm] = useState(() => formFromEvent(event));
  const [financeBundle, setFinanceBundle] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState("");
  const [dayDetails, setDayDetails] = useState(emptyDayDetails);
  const lastLeaveSignalRef = useRef(leaveSignal);
  const editingRef = useRef(editing);
  const dirtyRef = useRef(false);
  const formRef = useRef(form);
  const savingRef = useRef(saving);
  const eventRef = useRef(event);
  const backRef = useRef(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
    const nextTab = initialTab || "osnovno";
    const nextTech = initialTechSubTab || TECH_SUBTABS[0].id;
    const nextShow = initialShowSubTab || SHOW_SUBTABS[0].id;
    setTab(nextTab);
    setTechSubTab(nextTech);
    setTechRiderMounted(nextTech === "technical-rider" || nextTab === "tehnicki");
    setShowSubTab(nextShow);
    setDetailsOpen(Boolean(initialDetailsOpen));
  }, [event?.id, initialTab, initialTechSubTab, initialShowSubTab, initialDetailsOpen]);

  useEffect(() => {
    if (techSubTab === "technical-rider") setTechRiderMounted(true);
  }, [techSubTab]);

  // Prefetch rider in the background when Tehnički opens.
  useEffect(() => {
    if (tab !== "tehnicki") return;
    const id = event?.id;
    const bandKey = event?.bandId || band?.id || "";
    if (id && bandKey) prefetchTechRider(id, bandKey);
  }, [tab, event?.id, event?.bandId, band?.id]);

  const memberRole = band?.memberRole || "member";
  const isGroupBand = band?.kind === "group";
  /** Owner/lead may open Finansije (personal = own fee + expenses; group = member roster). */
  const canSeeFinance = memberRole === "owner" || memberRole === "lead";
  /** Multi-member honorari only on group bands (band admin tools). */
  const canManageMemberFees = canSeeFinance && isGroupBand;
  const financeBandId = event?.bandId || band?.id || "";
  const viewerUserId = profile?.id || "";
  const visibleTabs = useMemo(
    () => TABS.filter((item) => !item.leadOnly || canSeeFinance),
    [canSeeFinance],
  );

  const financeMembers = useMemo(() => {
    const list = financeBundle?.members ?? EMPTY_FINANCE_MEMBERS;
    if (canManageMemberFees) return list;
    if (!viewerUserId) return list.slice(0, 1);
    return list.filter((member) => member.id === viewerUserId);
  }, [financeBundle?.members, canManageMemberFees, viewerUserId]);

  // Edit lock matches server: calendar today (not finance asOfDate).
  const parsedDate = parseDate(event?.date);
  const hasDate = Boolean(String(event?.date || "").trim());
  const locked =
    hasDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() < startOfToday().getTime();

  const dateParts = formatScheduleDateParts(event?.date);
  const minEditableDateIso = (() => {
    const today = startOfToday();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  })();
  const myFee = numberValue(event?.priceEur);
  const hasFee = myFee > 0;
  const bandName = band?.name || event?.bandName || "—";
  const dayDetailsBandId = event?.bandId || band?.id || "";
  const filledDayDetails = useMemo(
    () =>
      DAY_TIME_FIELDS.map((field) => ({
        key: field.key,
        label: t(field.labelKey),
        value: formatDayDetailValue(dayDetails, field),
      })).filter((row) => row.value),
    [dayDetails, t],
  );
  const bandOptions = useMemo(
    () =>
      (bands || []).map((item) => ({
        id: item.id,
        label: `${item.name}${item.kind === "personal" ? ` ${t("event.personalSuffix")}` : ""}`,
      })),
    [bands, t],
  );

  const isDirty =
    form.bandId !== initialForm.bandId ||
    form.date !== initialForm.date ||
    form.city !== initialForm.city ||
    form.venue !== initialForm.venue ||
    form.mapsUrl !== initialForm.mapsUrl ||
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
    setDetailsOpen(false);
    setFormError("");
  }, [event?.id, event?.bandId, event?.date, event?.city, event?.venue, event?.mapsUrl, event?.note, event?.priceEur]);

  useEffect(() => {
    let cancelled = false;
    async function loadDayDetails() {
      if (!event?.id || !dayDetailsBandId) {
        setDayDetails(emptyDayDetails);
        return;
      }
      try {
        const data = await api(`/api/events/${event.id}/day-details`, { bandId: dayDetailsBandId });
        if (!cancelled) setDayDetails(dayDetailsFromApi(data));
      } catch {
        if (!cancelled) setDayDetails(emptyDayDetails);
      }
    }
    loadDayDetails();
    return () => {
      cancelled = true;
    };
  }, [event?.id, dayDetailsBandId]);

  useEffect(() => {
    if (tab === "finansije" && !canSeeFinance) setTab("osnovno");
  }, [tab, canSeeFinance]);

  // Prefetch honorari + troškovi as soon as the date opens (owner/lead).
  useEffect(() => {
    if (!canSeeFinance || !event?.id || !financeBandId) {
      setFinanceBundle(null);
      setFinanceError("");
      setFinanceLoading(false);
      return undefined;
    }

    let cancelled = false;
    setFinanceLoading(true);
    setFinanceError("");
    setFinanceBundle(null);

    api(`/api/events/${event.id}/finance`, { bandId: financeBandId })
      .then((data) => {
        if (cancelled) return;
        setFinanceBundle(data);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setFinanceError(requestError.message || t("event.financeLoadFail"));
        setFinanceBundle(null);
      })
      .finally(() => {
        if (!cancelled) setFinanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canSeeFinance, event?.id, financeBandId, t]);

  useEffect(() => {
    if (locked && editing) {
      setEditing(false);
      setForm(formFromEvent(event));
      setInitialForm(formFromEvent(event));
      setFormError("");
    }
  }, [locked, editing, event]);

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
        title: t("event.unsavedTitle"),
        message: t("event.discardMessage"),
        confirmLabel: t("event.discard"),
        cancelLabel: t("event.stay"),
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
    const bandId = String(current.bandId || "").trim();
    const date = String(current.date || "").trim();
    const city = String(current.city || "").trim();
    const venue = String(current.venue || "").trim();
    const mapsUrl = String(current.mapsUrl || "").trim();
    const note = String(current.note || "").trim();

    if (!bandId) return { error: t("event.validation.band") };
    if (!date) return { error: t("event.validation.dateRequired") };
    const parsed = parseDate(date);
    if (Number.isNaN(parsed.getTime())) {
      return { error: t("event.validation.dateInvalid") };
    }
    if (parsed.getTime() < startOfToday().getTime()) {
      return { error: t("event.validation.datePast") };
    }
    if (!city && !venue && !mapsUrl && !note) {
      return { error: t("event.validation.minField") };
    }
    return { bandId, date, city, venue, mapsUrl, note };
  }

  function applyMapsLinkInput(raw) {
    const parsed = parseMapsVenueInput(raw);
    setForm((current) => ({
      ...current,
      mapsUrl: parsed.isMapsLink ? parsed.mapsUrl : String(raw || "").trim(),
    }));
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

    const { bandId, date, city, venue, mapsUrl, note } = validated;
    if (!dirtyRef.current) {
      setEditing(false);
      return true;
    }

    const initial = initialForm;
    const dateOrBandChanged =
      bandId !== initial.bandId ||
      !sameCalendarDay(date, initial.date);
    if (dateOrBandChanged) {
      const duplicates = findScheduleDuplicates({
        events,
        bandId,
        date,
        excludeEventId: eventRef.current?.id,
      });
      if (hasScheduleDuplicates(duplicates)) {
        const proceed = await confirm({
          title: t("schedule.duplicateTitle"),
          message: buildDuplicateConfirmMessage(t, { ...duplicates, date }),
          confirmLabel: t("schedule.duplicateProceed"),
          cancelLabel: t("common.cancel"),
          danger: true,
        });
        if (!proceed) return false;
      }
    }

    if (askConfirm) {
      const confirmed = await confirm({
        title: t("event.saveConfirmTitle"),
        message: `${date}${city ? ` — ${city}` : ""}`,
        confirmLabel: t("common.save"),
        cancelLabel: t("common.cancel"),
      });
      if (!confirmed) return false;
    }

    try {
      setSaving(true);
      setFormError("");
      await onUpdate?.(eventRef.current.id, { bandId, date, city, venue, mapsUrl, note });
      setInitialForm({ bandId, date, city, venue, mapsUrl, note });
      setForm({ bandId, date, city, venue, mapsUrl, note });
      setEditing(false);
      return true;
    } catch (error) {
      setFormError(error.message || t("event.saveFail"));
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
        title: t("event.unsavedTitle"),
        message: t("event.saveBeforeBack"),
        confirmLabel: t("common.save"),
        cancelLabel: t("common.cancel"),
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
          <button
            type="button"
            ref={backRef}
            className="event-page-back"
            aria-label={t("common.back")}
            title={t("common.back")}
            onClick={onBack}
          >
            <ChevronLeftIcon />
          </button>
          <div className="event-page-title-wrap">
            <h2 className="event-page-title">{t("event.notFound")}</h2>
          </div>
        </header>
        <p className="raspored-empty">{t("event.notFoundHint")}</p>
      </div>
    );
  }

  return (
    <div className="event-page">
      <header className="event-page-head">
        <button
          type="button"
          ref={backRef}
          className="event-page-back"
          aria-label={t("event.back")}
          title={t("event.back")}
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
          <p className="event-page-band">{bandName}</p>
          {event.venue || event.mapsUrl ? (
            <p className="event-page-sub">
              <VenueWithMaps venue={event.venue} city={event.city} mapsUrl={event.mapsUrl} />
            </p>
          ) : null}
        </div>
        {locked ? (
          <span className="event-page-lock" title={t("event.lockedTitle")} aria-label={t("event.lockedAria")}>
            <LockIcon />
          </span>
        ) : (
          <button
            type="button"
            className={`raspored-icon-btn ${editing ? "is-active-filter" : ""}`}
            title={editing ? t("event.editingMode") : t("event.editEvent")}
            aria-label={editing ? t("event.editingMode") : t("event.editEvent")}
            aria-pressed={editing}
            onClick={() => (editing ? cancelEdit() : startEdit())}
            disabled={saving || detailsOpen}
          >
            <PenIcon />
          </button>
        )}
      </header>

      {!detailsOpen ? (
        <div className="event-page-tabs-shell">
          <div className="event-page-tabs" role="tablist" aria-label={t("event.tabSections")}>
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`event-tab-${item.id}`}
                className={`event-page-tab ${tab === item.id ? "is-active" : ""}`}
                aria-selected={tab === item.id}
                aria-controls={`event-tabpanel-${item.id}`}
                onClick={() => setTab(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>

      {tab === "osnovno" ? (
        <>
        <section
          id="event-tabpanel-osnovno"
          className="event-page-panel"
          role="tabpanel"
          aria-labelledby="event-tab-osnovno"
        >
          <FadeScroll viewportClassName="event-page-panel-scroll">
          {editing ? (
            <form className="event-page-form termin-form" onSubmit={saveEdit}>
              <label htmlFor="eventBand" className="termin-form-full">
                {t("event.bandPersonal")}
                <FieldSelect
                  id="eventBand"
                  label={t("event.bandPersonal")}
                  value={form.bandId}
                  placeholder={t("common.choose")}
                  required
                  options={bandOptions}
                  onChange={(id) => updateForm("bandId", id)}
                />
              </label>
              <label htmlFor="eventDate" className="termin-form-full">
                {t("schedule.date")}
                <input
                  id="eventDate"
                  name="eventDate"
                  type="date"
                  min={minEditableDateIso}
                  value={toIsoDate(form.date)}
                  onChange={(e) => updateForm("date", fromIsoDate(e.target.value))}
                  required
                />
              </label>
              <label htmlFor="eventCity">
                {t("event.form.city")}
                <input
                  id="eventCity"
                  name="eventCity"
                  type="text"
                  placeholder={t("event.cityPlaceholder")}
                  value={form.city}
                  onChange={(e) => updateForm("city", e.target.value)}
                  autoComplete="address-level2"
                />
              </label>
              <label htmlFor="eventVenue">
                {t("event.form.venue")}
                <input
                  id="eventVenue"
                  name="eventVenue"
                  type="text"
                  placeholder={t("event.venuePlaceholder")}
                  value={form.venue}
                  onChange={(e) => updateForm("venue", e.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label htmlFor="eventMapsUrl" className="termin-form-full">
                {t("event.mapsUrl")}
                <input
                  id="eventMapsUrl"
                  name="eventMapsUrl"
                  type="url"
                  inputMode="url"
                  placeholder={t("event.mapsUrlPlaceholder")}
                  value={form.mapsUrl}
                  onChange={(e) => applyMapsLinkInput(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData("text");
                    if (!pasted) return;
                    const parsed = parseMapsVenueInput(pasted);
                    if (!parsed.isMapsLink) return;
                    e.preventDefault();
                    applyMapsLinkInput(pasted);
                  }}
                  autoComplete="off"
                />
              </label>
              {form.mapsUrl ? (
                <p className="event-venue-maps-hint termin-form-full">
                  {t("event.mapsPinHint")}
                  <button
                    type="button"
                    className="event-venue-maps-clear"
                    onClick={() => setForm((current) => ({ ...current, mapsUrl: "" }))}
                  >
                    {t("event.remove")}
                  </button>
                </p>
              ) : null}
              <label className="termin-form-full" htmlFor="eventNote">
                {t("event.note")}
                <input
                  id="eventNote"
                  name="eventNote"
                  type="text"
                  placeholder={t("event.notePlaceholder")}
                  value={form.note}
                  onChange={(e) => updateForm("note", e.target.value)}
                  autoComplete="off"
                />
              </label>

              <div className="event-page-fee termin-form-full" aria-label={t("event.myFee")}>
                <span className="event-page-fee-label">{t("event.myFee")}</span>
                <strong>{hasFee ? formatEur(myFee) : "—"}</strong>
              </div>

              {formError ? <div className="app-alert termin-form-full">{formError}</div> : null}

              <div className="termin-form-actions termin-form-full">
                <button type="button" className="danger" onClick={cancelEdit} disabled={saving}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? t("common.saving") : t("event.saveChanges")}
                </button>
              </div>
            </form>
          ) : (
            <dl className="event-page-fields">
              {filledDayDetails.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
              {event.note ? (
                <div className="event-page-fields-full">
                  <dt>{t("event.note")}</dt>
                  <dd>{event.note}</dd>
                </div>
              ) : null}
              <div className="event-page-fields-full event-page-fee-row">
                <dt>{t("event.myFee")}</dt>
                <dd className={hasFee ? "is-set" : "is-empty"}>{hasFee ? formatEur(myFee) : "—"}</dd>
              </div>
            </dl>
          )}
          </FadeScroll>
        </section>
        <div className="event-page-footer">
          <button
            type="button"
            className="event-page-full-details"
            aria-label={t("event.fullDetails")}
            aria-expanded={false}
            title={t("event.fullDetails")}
            onClick={() => {
              setEditing(false);
              setDetailsOpen(true);
            }}
          >
            <DetailsIcon />
            <span>{t("event.fullDetails")}</span>
            <em className="event-page-full-details-chevron" aria-hidden="true">
              ▾
            </em>
          </button>
        </div>
        </>
      ) : null}

      {tab === "tehnicki" ? (
        <section
          id="event-tabpanel-tehnicki"
          className="event-page-panel"
          role="tabpanel"
          aria-labelledby="event-tab-tehnicki"
        >
          <div className="event-page-subtabs" role="tablist" aria-label={t("event.techParts")}>
            {TECH_SUBTABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`event-tech-tab-${item.id}`}
                className={`event-page-subtab ${techSubTab === item.id ? "is-active" : ""}`}
                aria-selected={techSubTab === item.id}
                aria-controls={`event-tech-panel-${item.id}`}
                onClick={() => setTechSubTab(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <FadeScroll viewportClassName="event-page-panel-scroll">
            {TECH_SUBTABS.map((item) => {
              const isActive = techSubTab === item.id;
              const keepRider = item.id === "technical-rider" && techRiderMounted;
              if (!isActive && !keepRider) return null;
              return (
                <div
                  key={item.id}
                  id={`event-tech-panel-${item.id}`}
                  role="tabpanel"
                  aria-labelledby={`event-tech-tab-${item.id}`}
                  hidden={!isActive}
                >
                  {item.id === "technical-rider" ? (
                    <TechnicalRiderPanel
                      eventId={event.id}
                      bandId={financeBandId}
                      readOnly={locked}
                      showToast={showToast}
                    />
                  ) : (
                    <EventRackStubPanel panelId={item.id} readOnly={locked} showToast={showToast} />
                  )}
                </div>
              );
            })}
          </FadeScroll>
        </section>
      ) : null}

      {tab === "show" ? (
        <section
          id="event-tabpanel-show"
          className="event-page-panel"
          role="tabpanel"
          aria-labelledby="event-tab-show"
        >
          <div className="event-page-subtabs" role="tablist" aria-label={t("event.showParts")}>
            {SHOW_SUBTABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`event-show-tab-${item.id}`}
                className={`event-page-subtab ${showSubTab === item.id ? "is-active" : ""}`}
                aria-selected={showSubTab === item.id}
                aria-controls={`event-show-panel-${item.id}`}
                onClick={() => setShowSubTab(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <FadeScroll viewportClassName="event-page-panel-scroll">
            {SHOW_SUBTABS.map((item) =>
              showSubTab === item.id ? (
                <div
                  key={item.id}
                  id={`event-show-panel-${item.id}`}
                  role="tabpanel"
                  aria-labelledby={`event-show-tab-${item.id}`}
                >
                  {item.id === "set-lists" ? (
                    <SetListPanel
                      eventId={event.id}
                      bandId={financeBandId}
                      readOnly={locked}
                      showToast={showToast}
                    />
                  ) : (
                    <EventRackStubPanel panelId={item.id} readOnly={locked} showToast={showToast} />
                  )}
                </div>
              ) : null,
            )}
          </FadeScroll>
        </section>
      ) : null}

      {canSeeFinance ? (
        <section
          id="event-tabpanel-finansije"
          className="event-page-panel event-page-finance"
          role="tabpanel"
          aria-labelledby="event-tab-finansije"
          hidden={tab !== "finansije"}
        >
          <FadeScroll viewportClassName="event-page-panel-scroll">
          <h3 className="event-page-section-title">
            <HonorarIcon />
            <span>{canManageMemberFees ? t("finance.fees") : t("event.myFee")}</span>
          </h3>
          <EventFinancePanel
            eventId={event.id}
            bandId={financeBandId}
            readOnly={locked}
            showToast={showToast}
            solo={!canManageMemberFees}
            members={financeMembers}
            loading={financeLoading}
            error={financeError}
            onChanged={async (memberId, priceEur) => {
              if (memberId != null && priceEur != null) {
                setFinanceBundle((current) =>
                  current
                    ? {
                        ...current,
                        members: current.members.map((member) =>
                          member.id === memberId ? { ...member, priceEur } : member,
                        ),
                      }
                    : current,
                );
              }
              await onRefreshSchedule?.();
            }}
          />
          <EventExpensesPanel
            eventId={event.id}
            bandId={financeBandId}
            readOnly={locked}
            showToast={showToast}
            members={financeMembers}
            expenses={financeBundle?.expenses ?? EMPTY_FINANCE_EXPENSES}
            currencies={financeBundle?.currencies ?? null}
            loading={financeLoading}
            error={financeError}
            onExpensesChange={(next) => {
              setFinanceBundle((current) =>
                current ? { ...current, expenses: next } : current,
              );
            }}
            onChanged={async () => {
              await onRefreshSchedule?.();
            }}
          />
          </FadeScroll>
        </section>
      ) : null}
        </div>
      ) : null}

      {tab === "osnovno" && detailsOpen ? (
        <>
          <button
            type="button"
            className="event-page-full-details is-open"
            aria-label={t("event.closeFullDetails")}
            aria-expanded
            title={t("event.closeFullDetails")}
            onClick={() => setDetailsOpen(false)}
          >
            <DetailsIcon />
            <span>{t("event.fullDetails")}</span>
            <em className="event-page-full-details-chevron" aria-hidden="true">
              ▴
            </em>
          </button>
          <section className="event-page-panel" role="tabpanel" aria-label={t("event.fullDetails")}>
            <FadeScroll viewportClassName="event-page-panel-scroll">
            <h3 className="event-page-section-title">
              <span>{t("event.timeSchedule")}</span>
            </h3>
            <EventDayDetails
              eventId={event.id}
              bandId={dayDetailsBandId}
              readOnly={locked}
              showToast={showToast}
              onSaved={setDayDetails}
            />
            </FadeScroll>
          </section>
        </>
      ) : null}
    </div>
  );
}

function formFromEvent(event) {
  return {
    bandId: event?.bandId || "",
    date: event?.date || "",
    city: event?.city || "",
    venue: event?.venue || "",
    mapsUrl: event?.mapsUrl || "",
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

function VenueWithMaps({ venue, city = "", mapsUrl = "" }) {
  const t = useT();
  const href = resolveMapsUrl({ mapsUrl, venue, city });
  if (!venue && !href) return null;
  const mapsLabel = venue || t("event.location");
  return (
    <span className="venue-with-maps">
      {venue ? <span className="venue-with-maps-name">{venue}</span> : null}
      {href ? (
        <a
          className="venue-maps-btn"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={t("event.openMaps")}
          aria-label={t("event.openMapsFor", { name: mapsLabel })}
        >
          <MapsPinIcon />
        </a>
      ) : null}
    </span>
  );
}

function MapsPinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 21s6.5-5.2 6.5-11a6.5 6.5 0 1 0-13 0c0 5.8 6.5 11 6.5 11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
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
