import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, setApiAuth } from "./api.js";
import { DEFAULT_RATE, numberValue, parseDate, startOfToday, todayText } from "./calculations.js";
import LoginPage from "./LoginPage.jsx";
import ReportPage from "./ReportPage.jsx";
import SchedulePage from "./SchedulePage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import UserMenu from "./UserMenu.jsx";
import { log } from "./logger.js";
import { waitForAuthSession, supabase } from "./supabase.js";

const StudioPage = import.meta.env.DEV ? lazy(() => import("./studio/StudioPage.jsx")) : null;

const pages = [
  ["schedule", "Raspored"],
  ["report", "Finansije"],
  ...(import.meta.env.DEV ? [["studio", "Studio"]] : []),
];

const ACTIVE_BAND_KEY = "ioorganize.activeBandId.v2";
const SCHEDULE_CACHE_STORAGE_KEY = "ioorganize.scheduleCache.v1";
const THEME_KEY = "ioorganize.theme";
const COMPACT_PREVIEW_KEY = "ioorganize.compactPreview";
const FINANCE_MODE_KEY = "ioorganize.financeMode";
const ALL_BANDS_ID = "__all__";

function readStoredScheduleCache() {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_CACHE_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeStoredScheduleCache(map) {
  try {
    sessionStorage.setItem(SCHEDULE_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // quota / private mode — ignore
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bands, setBands] = useState([]);
  const [activeBandId, setActiveBandId] = useState(() => localStorage.getItem(ACTIVE_BAND_KEY) || ALL_BANDS_ID);
  const [page, setPage] = useState("schedule");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [compactPreview, setCompactPreview] = useState(
    () => localStorage.getItem(COMPACT_PREVIEW_KEY) === "1",
  );
  const [financeMode, setFinanceMode] = useState(() => localStorage.getItem(FINANCE_MODE_KEY) || "member");
  const [events, setEvents] = useState([]);
  const [financeEvents, setFinanceEvents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState({ exchangeRate: DEFAULT_RATE, asOfDate: todayText() });
  const [planner, setPlanner] = useState({ eur: 0, rsd: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const eventsRef = useRef(events);
  const financeEventsRef = useRef(financeEvents);
  const scheduleCacheRef = useRef(readStoredScheduleCache());
  const scheduleRequestIdRef = useRef(0);
  const prefetchStartedRef = useRef(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    financeEventsRef.current = financeEvents;
  }, [financeEvents]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(COMPACT_PREVIEW_KEY, compactPreview ? "1" : "0");
  }, [compactPreview]);

  useEffect(() => {
    localStorage.setItem(FINANCE_MODE_KEY, financeMode);
  }, [financeMode]);

  const activeBand = bands.find((band) => band.id === activeBandId) || null;
  const canUseBandMode = Boolean(
    activeBand &&
      activeBand.kind === "group" &&
      (activeBand.memberRole === "owner" || activeBand.memberRole === "admin"),
  );
  const effectiveFinanceMode = canUseBandMode && financeMode === "band" ? "band" : "member";

  useEffect(() => {
    if (financeMode === "band" && !canUseBandMode) {
      setFinanceMode("member");
    }
  }, [financeMode, canUseBandMode]);

  useEffect(() => {
    let mounted = true;

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
    });

    waitForAuthSession().then((result) => {
      if (!mounted) return;
      if (result.error) setError(result.error);
      setSession(result.session);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const skipBandScheduleReload = useRef(true);

  useEffect(() => {
    if (!authReady) return;

    if (!session?.access_token) {
      skipBandScheduleReload.current = true;
      setApiAuth({ token: "", bandId: "" });
      setProfile(null);
      setBands([]);
      setEvents([]);
      setFinanceEvents([]);
      setPayments([]);
      scheduleCacheRef.current.clear();
      sessionStorage.removeItem(SCHEDULE_CACHE_STORAGE_KEY);
      prefetchStartedRef.current = false;
      setLoading(false);
      return;
    }

    skipBandScheduleReload.current = true;
    setApiAuth({ token: session.access_token, bandId: activeBandId === ALL_BANDS_ID ? "" : activeBandId });
    bootstrapSession(session.access_token);
  }, [authReady, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !activeBandId) return;
    localStorage.setItem(ACTIVE_BAND_KEY, activeBandId);
    setApiAuth({ token: session.access_token, bandId: activeBandId === ALL_BANDS_ID ? "" : activeBandId });
    if (skipBandScheduleReload.current) return;
    // Band switch only needs schedule; finance is always "mine across bands"
    loadScheduleAndFinance({ scheduleOnly: true });
  }, [activeBandId]);

  async function bootstrapSession(token) {
    try {
      setLoading(true);
      setError("");
      setApiAuth({ token, bandId: activeBandId === ALL_BANDS_ID ? "" : activeBandId });
      const me = await api("/api/me");
      setProfile(me.profile);
      setBands(me.bands);

      const stored = localStorage.getItem(ACTIVE_BAND_KEY);
      const preferred =
        stored === ALL_BANDS_ID || (!stored && !activeBandId)
          ? ALL_BANDS_ID
          : me.bands.find((band) => band.id === activeBandId)?.id ||
            me.bands.find((band) => band.id === stored)?.id ||
            ALL_BANDS_ID;

      if (preferred !== activeBandId) {
        setActiveBandId(preferred);
      }
      const cachedPreferred = scheduleCacheRef.current.get(preferred);
      if (cachedPreferred) setEvents(cachedPreferred);
      await loadScheduleAndFinance({ scheduleOnly: false, bandIdOverride: preferred });
      skipBandScheduleReload.current = false;
      queuePrefetchSchedules();
    } catch (requestError) {
      reportError(requestError, "bootstrap failed");
      setLoading(false);
      skipBandScheduleReload.current = false;
    }
  }

  function rememberSchedule(bandId, eventsList) {
    scheduleCacheRef.current.set(bandId, eventsList);
    writeStoredScheduleCache(scheduleCacheRef.current);
  }

  function getCachedEvents(bandId) {
    return scheduleCacheRef.current.get(bandId) || null;
  }

  function invalidateScheduleCache(bandId) {
    if (bandId) scheduleCacheRef.current.delete(bandId);
    scheduleCacheRef.current.delete(ALL_BANDS_ID);
    writeStoredScheduleCache(scheduleCacheRef.current);
    prefetchStartedRef.current = false;
  }

  function queuePrefetchSchedules() {
    if (prefetchStartedRef.current) return;
    prefetchStartedRef.current = true;
    const run = () => {
      prefetchAllSchedules().catch(() => {
        prefetchStartedRef.current = false;
      });
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 200);
    }
  }

  async function prefetchAllSchedules() {
    if (!session?.access_token) return;
    const data = await api("/api/prefetch-schedules");
    rememberSchedule(ALL_BANDS_ID, data.events || []);
    for (const [bandId, list] of Object.entries(data.byBandId || {})) {
      rememberSchedule(bandId, list);
    }
  }

  async function loadScheduleAndFinance({ scheduleOnly = false, bandIdOverride } = {}) {
    const bandId = bandIdOverride || activeBandId;
    if (!session?.access_token || !bandId) return;

    const requestId = ++scheduleRequestIdRef.current;
    const writeBandId = bandId === ALL_BANDS_ID ? "" : bandId;
    const scheduleBase = bandId === ALL_BANDS_ID ? "/api/my-schedule" : "/api/bootstrap";
    const scheduleUrl = scheduleOnly ? `${scheduleBase}?light=1` : scheduleBase;

    try {
      setError("");
      setApiAuth({ token: session.access_token, bandId: writeBandId });

      // Soft band switch: paint cache immediately; skip network when already prefetched.
      if (scheduleOnly) {
        const cached = getCachedEvents(bandId);
        if (cached) {
          setEvents(cached);
          return;
        }
        setEvents([]);

        const schedule = await api(scheduleUrl, { bandId: writeBandId });
        if (requestId !== scheduleRequestIdRef.current) return;
        rememberSchedule(bandId, schedule.events);
        setEvents(schedule.events);
        return;
      }

      setLoading(true);
      const [schedule, finance] = await Promise.all([
        api(scheduleUrl, { bandId: writeBandId }),
        loadFinancePayload(bandId),
      ]);
      if (requestId !== scheduleRequestIdRef.current) return;
      rememberSchedule(bandId, schedule.events);
      setEvents(schedule.events);
      setFinanceEvents(finance.events);
      setPayments(finance.payments);
      setSettings({
        exchangeRate: finance.settings.exchangeRate || schedule.settings.exchangeRate || DEFAULT_RATE,
        asOfDate: finance.settings.asOfDate || schedule.settings.asOfDate || todayText(),
      });
      queuePrefetchSchedules();
    } catch (requestError) {
      if (requestId !== scheduleRequestIdRef.current) return;
      reportError(requestError, "schedule/finance load failed");
    } finally {
      if (requestId === scheduleRequestIdRef.current && !scheduleOnly) {
        setLoading(false);
      }
    }
  }

  async function loadFinancePayload(bandId = activeBandId) {
    const band = bands.find((item) => item.id === bandId);
    const useBandMode =
      financeMode === "band" &&
      band &&
      band.kind === "group" &&
      (band.memberRole === "owner" || band.memberRole === "admin") &&
      bandId !== ALL_BANDS_ID;

    if (useBandMode) {
      return api("/api/band-finance", { bandId });
    }
    return api("/api/my-finance");
  }

  async function reloadFinance() {
    if (!session?.access_token) return;
    try {
      const finance = await loadFinancePayload(activeBandId);
      setFinanceEvents(finance.events || []);
      setPayments(finance.payments || []);
      if (finance.settings) {
        setSettings((current) => ({
          exchangeRate: finance.settings.exchangeRate || current.exchangeRate || DEFAULT_RATE,
          asOfDate: finance.settings.asOfDate || current.asOfDate || todayText(),
        }));
      }
    } catch (requestError) {
      reportError(requestError, "finance reload failed");
    }
  }

  async function handleFinanceModeChange(nextMode) {
    setFinanceMode(nextMode);
  }

  useEffect(() => {
    if (!session?.access_token || page !== "report") return;
    reloadFinance();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when mode/band changes on finance page
  }, [effectiveFinanceMode, activeBandId, page, session?.access_token]);

  async function loadData() {
    await loadScheduleAndFinance({ scheduleOnly: false });
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => setToast(null), 2800);
  }

  function reportError(requestError, context = "request failed") {
    const message = requestError?.message || String(requestError || context);
    setError(message);
    log.error(context, requestError);
  }

  async function saveSetting(key, value, persist = true) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (!persist) return;

    try {
      await api(`/api/settings/${key}`, { method: "PATCH", body: { value } });
    } catch (requestError) {
      reportError(requestError, "save setting failed");
    }
  }

  function updateEventLocal(id, field, value) {
    const numericFields = new Set(["priceEur", "transportRsd"]);
    const patch = (event) =>
      event.id === id ? { ...event, [field]: numericFields.has(field) ? numberValue(value) : value } : event;

    setEvents((current) => {
      const next = current.map(patch);
      eventsRef.current = next;
      return next;
    });
    setFinanceEvents((current) => {
      const next = current.map(patch);
      financeEventsRef.current = next;
      return next;
    });
  }

  function eventBandId(event) {
    if (event?.bandId && event.bandId !== ALL_BANDS_ID) return event.bandId;
    if (activeBandId && activeBandId !== ALL_BANDS_ID) return activeBandId;
    return bands.find((band) => band.kind === "personal")?.id || "";
  }

  async function saveEvent(eventOrId) {
    const id = typeof eventOrId === "object" ? eventOrId.id : eventOrId;
    const event =
      eventsRef.current.find((item) => item.id === id) ||
      financeEventsRef.current.find((item) => item.id === id) ||
      (typeof eventOrId === "object" ? eventOrId : null);
    if (!event) return;

    try {
      await api(`/api/events/${id}`, {
        method: "PUT",
        bandId: eventBandId(event),
        body: {
          date: event.date ?? "",
          city: event.city ?? "",
          venue: event.venue ?? "",
          note: event.note ?? "",
          priceEur: numberValue(event.priceEur),
          transportRsd: numberValue(event.transportRsd),
        },
      });
      invalidateScheduleCache(eventBandId(event));
      await loadScheduleAndFinance();
    } catch (requestError) {
      reportError(requestError, "save event failed");
    }
  }

  async function addEvent(payload = {}) {
    const bandIdForWrite = String(payload.bandId || "").trim();
    if (!bandIdForWrite || bandIdForWrite === ALL_BANDS_ID) {
      showToast("Moraš izabrati bend ili Personal", "error");
      throw new Error("Moraš izabrati bend ili Personal.");
    }

    const created = await api("/api/events", {
      method: "POST",
      bandId: bandIdForWrite,
      body: {
        date: payload.date || todayText(),
        city: payload.city || "",
        venue: payload.venue || "",
        note: payload.note || "",
        priceEur: numberValue(payload.priceEur),
        transportRsd: numberValue(payload.transportRsd),
      },
    });
    invalidateScheduleCache(bandIdForWrite);
    await loadScheduleAndFinance();
    showToast(`Termin dodat: ${created.date}${created.city ? ` — ${created.city}` : ""}`);
    return created;
  }

  async function updateEventFields(id, fields) {
    const current =
      eventsRef.current.find((item) => item.id === id) || financeEventsRef.current.find((item) => item.id === id);
    if (!current) return;

    const nextEvent = {
      ...current,
      date: fields.date ?? current.date,
      city: fields.city ?? current.city,
      venue: fields.venue ?? current.venue,
      note: fields.note ?? current.note,
      priceEur: fields.priceEur !== undefined ? numberValue(fields.priceEur) : numberValue(current.priceEur),
      transportRsd:
        fields.transportRsd !== undefined ? numberValue(fields.transportRsd) : numberValue(current.transportRsd),
    };

    await api(`/api/events/${id}`, {
      method: "PUT",
      bandId: eventBandId(nextEvent),
      body: {
        date: nextEvent.date ?? "",
        city: nextEvent.city ?? "",
        venue: nextEvent.venue ?? "",
        note: nextEvent.note ?? "",
        priceEur: numberValue(nextEvent.priceEur),
        transportRsd: numberValue(nextEvent.transportRsd),
      },
    });
    invalidateScheduleCache(eventBandId(nextEvent));
    await loadScheduleAndFinance();
    showToast(`Termin sačuvan: ${nextEvent.date}${nextEvent.city ? ` — ${nextEvent.city}` : ""}`);
  }

  async function removeEvent(id) {
    const event =
      eventsRef.current.find((item) => item.id === id) || financeEventsRef.current.find((item) => item.id === id);
    if (!event) return;

    const asOf = parseDate(settings.asOfDate || todayText());
    const eventDate = parseDate(event.date);
    const calculationDate = Number.isNaN(asOf.getTime()) ? startOfToday() : asOf;
    const isPast =
      Boolean(String(event.date || "").trim()) &&
      !Number.isNaN(eventDate.getTime()) &&
      eventDate <= calculationDate;

    if (isPast) {
      showToast("Prošli termini se ne mogu brisati", "error");
      return;
    }

    await api(`/api/events/${id}`, { method: "DELETE", bandId: eventBandId(event) });
    invalidateScheduleCache(eventBandId(event));
    await loadScheduleAndFinance();
    const label = [event.date, event.city, event.venue].filter(Boolean).join(" — ");
    showToast(`Termin obrisan${label ? `: ${label}` : ""}`);
  }

  function updatePaymentLocal(id, field, value) {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === id ? { ...payment, [field]: field === "amount" ? numberValue(value) : value } : payment,
      ),
    );
  }

  async function savePayment(payment) {
    try {
      await api(`/api/payments/${payment.id}`, { method: "PUT", body: payment });
    } catch (requestError) {
      reportError(requestError, "save payment failed");
    }
  }

  async function addPayment(payment = { date: todayText(), amount: 0, currency: "EUR" }) {
    const created = await api("/api/payments", { method: "POST", body: payment });
    setPayments((current) => [...current, created]);
    setPage("report");
    showToast("Uplata dodata");
  }

  async function removePayment(id) {
    await api(`/api/payments/${id}`, { method: "DELETE" });
    setPayments((current) => current.filter((payment) => payment.id !== id));
  }

  async function applyPlannerPayment() {
    const eur = numberValue(planner.eur);
    const rsd = numberValue(planner.rsd);

    if (!eur && !rsd) {
      showToast("Unesi EUR ili DIN iznos");
      return;
    }

    if (eur) await addPayment({ date: todayText(), amount: eur, currency: "EUR" });
    if (rsd) await addPayment({ date: todayText(), amount: rsd, currency: "RSD" });
    setPlanner({ eur: 0, rsd: 0 });
  }

  function exportJson() {
    const payload = JSON.stringify(
      { events: financeEvents, payments, settings, calculatedAt: new Date().toISOString() },
      null,
      2,
    );
    navigator.clipboard.writeText(payload).then(() => showToast("JSON kopiran u clipboard"));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setApiAuth({ token: "", bandId: "" });
    localStorage.removeItem(ACTIVE_BAND_KEY);
    setActiveBandId("");
  }

  if (!authReady) {
    return <AppBoot />;
  }

  if (!session) {
    return <LoginPage initialError={error} />;
  }

  if (import.meta.env.DEV && page === "studio" && StudioPage) {
    return (
      <div className="app-shell app-shell-studio">
        <nav className="top-nav top-nav-studio" aria-label="Studio navigacija">
          <button type="button" className="top-nav-logout" onClick={() => setPage("schedule")}>
            ← Nazad
          </button>
        </nav>
        <Suspense fallback={<AppBoot />}>
          <StudioPage />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`app-shell ${compactPreview ? "app-shell-compact" : ""}`} data-theme={theme}>
      <nav className="top-nav" aria-label="Glavna navigacija">
        <div className="top-nav-brand" aria-hidden="true" />
        <div className="top-nav-links">
          {pages.map(([id, label]) => (
            <button
              key={id}
              className={`top-nav-link ${page === id ? "active" : ""}`}
              type="button"
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="top-nav-user">
          <UserMenu
            email={profile?.email || session.user?.email || ""}
            displayName={
              profile?.displayName ||
              session.user?.user_metadata?.full_name ||
              session.user?.user_metadata?.name ||
              ""
            }
            avatarUrl={
              session.user?.user_metadata?.avatar_url ||
              session.user?.user_metadata?.picture ||
              ""
            }
            onOpenSettings={() => setPage("settings")}
            onSignOut={handleSignOut}
          />
        </div>
      </nav>

      {error ? <div className="app-alert app-alert-global">{error}</div> : null}

      {/* Keep pages mounted so top nav + page state survive tab switches */}
      <div className={`app-page ${page === "schedule" ? "is-active" : ""}`} hidden={page !== "schedule"}>
        <SchedulePage
          events={events}
          bands={bands}
          settings={settings}
          activeBandId={activeBandId}
          allBandsId={ALL_BANDS_ID}
          onBandChange={setActiveBandId}
          onAdd={addEvent}
          onUpdate={updateEventFields}
          onRemove={removeEvent}
          loading={loading}
        />
      </div>

      <div className={`app-page ${page === "report" ? "is-active" : ""}`} hidden={page !== "report"}>
        <ReportPage
          events={financeEvents}
          payments={payments}
          bands={bands}
          activeBandId={activeBandId}
          allBandsId={ALL_BANDS_ID}
          onBandChange={setActiveBandId}
          financeMode={effectiveFinanceMode}
          canUseBandMode={canUseBandMode}
          onFinanceModeChange={handleFinanceModeChange}
          settings={settings}
          loading={loading}
        />
      </div>

      <div className={`app-page ${page === "settings" ? "is-active" : ""}`} hidden={page !== "settings"}>
        <SettingsPage
          theme={theme}
          onThemeChange={setTheme}
          compactPreview={compactPreview}
          onCompactPreviewChange={setCompactPreview}
          settings={settings}
          onSaveSetting={saveSetting}
        />
      </div>

      {toast ? (
        <div id="toast" className={`show toast-${toast.type || "success"}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

function AppBoot() {
  return (
    <main className="app-boot" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Učitavanje</span>
      <div className="app-boot-orb" aria-hidden="true">
        <span className="app-boot-ring" />
        <span className="app-boot-core" />
      </div>
      <div className="app-boot-bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
