import { useEffect, useRef, useState } from "react";
import { api, setApiAuth } from "./api.js";
import BandPage from "./BandPage.jsx";
import BandTiles from "./BandTiles.jsx";
import { DEFAULT_RATE, numberValue, parseDate, positiveNumber, startOfToday, todayText } from "./calculations.js";
import LegalPage, { isLegalPage } from "./LegalPage.jsx";
import LoginPage from "./LoginPage.jsx";
import ReportPage from "./ReportPage.jsx";
import SchedulePage from "./SchedulePage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import UserMenu from "./UserMenu.jsx";
import { log } from "./logger.js";
import { clearAuthParamsFromUrl, waitForAuthSession, supabase } from "./supabase.js";
import { takePendingJoinToken } from "./joinLink.js";

const pages = [
  ["schedule", "Raspored"],
  ["report", "Finansije"],
];

const MAIN_PAGE_IDS = new Set(["schedule", "band", "report", "settings"]);
const DEFAULT_PAGE = "schedule";

function normalizePage(page) {
  if (isLegalPage(page) || MAIN_PAGE_IDS.has(page)) return page;
  return DEFAULT_PAGE;
}

const ACTIVE_BAND_KEY = "ioorganize.activeBandId.v2";
const SCHEDULE_CACHE_STORAGE_KEY = "ioorganize.scheduleCache.v1";
const THEME_KEY = "ioorganize.theme";
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
  const [pendingInvites, setPendingInvites] = useState([]);
  const [activeBandId, setActiveBandId] = useState(() => localStorage.getItem(ACTIVE_BAND_KEY) || ALL_BANDS_ID);
  const [page, setPageState] = useState(DEFAULT_PAGE);

  function setPage(next) {
    setPageState(normalizePage(next));
  }

  const activePage = normalizePage(page);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
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
    localStorage.setItem(FINANCE_MODE_KEY, financeMode);
  }, [financeMode]);

  useEffect(() => {
    if (!authReady || !session) return;
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    const gcalError = params.get("gcal_error");
    const pageParam = params.get("page");
    const bandParam = params.get("band");
    if (!gcal && !gcalError && !pageParam) return;

    if (gcalError) {
      showToast(gcalError, "error");
    } else if (gcal === "connected") {
      showToast("Google kalendar povezan");
    }
    if (pageParam === "band" && bandParam) {
      setActiveBandId(bandParam);
      setPage("band");
    } else if (pageParam === "settings") {
      setPage("settings");
    }
    const url = new URL(window.location.href);
    ["gcal", "gcal_error", "page", "band"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot OAuth return
  }, [authReady, session?.access_token]);

  const activeBand = bands.find((band) => band.id === activeBandId) || null;
  const canUseBandMode = Boolean(
    activeBand &&
      activeBand.kind === "group" &&
      (activeBand.memberRole === "owner" || activeBand.memberRole === "lead"),
  );
  const effectiveFinanceMode = canUseBandMode && financeMode === "band" ? "band" : "member";

  function goToSchedule(resetBand = false) {
    if (resetBand) setActiveBandId(ALL_BANDS_ID);
    setPage("schedule");
  }

  function openBand(bandId) {
    if (!bandId || bandId === ALL_BANDS_ID) return;
    setActiveBandId(bandId);
    setPage("band");
  }

  useEffect(() => {
    if (financeMode === "band" && !canUseBandMode) {
      setFinanceMode("member");
    }
  }, [financeMode, canUseBandMode]);

  useEffect(() => {
    let mounted = true;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        clearAuthParamsFromUrl();
      }
      setSession(nextSession);
      setAuthReady(true);
    });

    waitForAuthSession().then((result) => {
      if (!mounted) return;
      if (result.error) setError(result.error);
      setSession(result.session);
      setAuthReady(true);
    });

    const bootTimeout = window.setTimeout(() => {
      if (!mounted) return;
      setAuthReady(true);
    }, 8000);

    return () => {
      mounted = false;
      window.clearTimeout(bootTimeout);
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
      setPendingInvites([]);
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

      const joinToken = takePendingJoinToken();
      let joinedBandId = "";
      if (joinToken) {
        try {
          const joined = await api(`/api/join/${encodeURIComponent(joinToken)}`, { method: "POST" });
          if (joined?.bandId) {
            joinedBandId = joined.bandId;
            setActiveBandId(joined.bandId);
            setPage("band");
            showToast(
              joined.status === "already_member"
                ? `Već si u bendu „${joined.bandName}”`
                : `Pridružen/a bendu „${joined.bandName}”`,
            );
          }
        } catch (joinError) {
          showToast(joinError.message || "Pozivni link nije važeći", "error");
        }
      }

      const me = await api("/api/me");
      setProfile(me.profile);
      setBands(me.bands);
      setPendingInvites(me.pendingInvites || []);

      const stored = localStorage.getItem(ACTIVE_BAND_KEY);
      const preferred =
        joinedBandId ||
        (stored === ALL_BANDS_ID || (!stored && !activeBandId)
          ? ALL_BANDS_ID
          : me.bands.find((band) => band.id === activeBandId)?.id ||
            me.bands.find((band) => band.id === stored)?.id ||
            ALL_BANDS_ID);

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
      (band.memberRole === "owner" || band.memberRole === "lead") &&
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

  async function handleAcceptInvite(inviteId) {
    try {
      const result = await api(`/api/me/invites/${inviteId}/accept`, { method: "POST" });
      const me = await api("/api/me");
      setProfile(me.profile);
      setBands(me.bands);
      setPendingInvites(me.pendingInvites || []);
      if (result.band?.id) {
        setActiveBandId(result.band.id);
        setPage("band");
      }
      showToast(`Pridružio/la si se: ${result.band?.name || "bend"}`);
      await loadScheduleAndFinance({ scheduleOnly: false });
    } catch (requestError) {
      showToast(requestError.message || "Prihvatanje nije uspelo", "error");
    }
  }

  async function handleDeclineInvite(inviteId) {
    try {
      await api(`/api/me/invites/${inviteId}/decline`, { method: "POST" });
      setPendingInvites((current) => current.filter((invite) => invite.id !== inviteId));
      showToast("Pozivnica odbijena");
    } catch (requestError) {
      showToast(requestError.message || "Odbijanje nije uspelo", "error");
    }
  }

  async function saveInvitePreference(value) {
    const next = value || "accept";
    setProfile((current) => (current ? { ...current, invitePreference: next } : current));
    try {
      const result = await api("/api/me/preferences", {
        method: "PATCH",
        body: { invitePreference: next },
      });
      setProfile((current) =>
        current ? { ...current, invitePreference: result.invitePreference || next } : current,
      );
      showToast("Sačuvano");
    } catch (requestError) {
      reportError(requestError, "save invite preference failed");
    }
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

  async function fetchExchangeRate() {
    try {
      const result = await api("/api/exchange-rate?force=1");
      const rate = positiveNumber(result.rate, DEFAULT_RATE);
      await saveSetting("exchangeRate", rate, true);
      const label = result.sourceLabel || (result.source === "nbs" ? "NBS" : "Google");
      showToast(`Kurs: ${rate} (${label}${result.asOf ? `, ${result.asOf}` : ""})`);
      return result;
    } catch (error) {
      showToast(error.message || "Kurs nije dostupan", "error");
      throw error;
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

    const asOf = parseDate(settings.asOfDate || todayText());
    const eventDate = parseDate(current.date);
    const calculationDate = Number.isNaN(asOf.getTime()) ? startOfToday() : asOf;
    const isPast =
      Boolean(String(current.date || "").trim()) &&
      !Number.isNaN(eventDate.getTime()) &&
      eventDate <= calculationDate;
    if (isPast) {
      showToast("Prošli termini su zaključani — možeš samo dodati komentar", "error");
      return;
    }

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

    try {
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
    } catch (requestError) {
      showToast(requestError.message || "Termin nije sačuvan", "error");
    }
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

  if (isLegalPage(activePage)) {
    return (
      <div className="app-shell" data-theme={theme}>
        <LegalPage
          pageId={activePage}
          onBack={() => setPage(session ? "settings" : DEFAULT_PAGE)}
        />
      </div>
    );
  }

  if (!session) {
    return <LoginPage initialError={error} onOpenLegal={setPage} />;
  }

  const showSchedule = activePage === "schedule";
  const showBand = activePage === "band";
  const showReport = activePage === "report";
  const showSettings = activePage === "settings";
  const forceSchedule = !showSchedule && !showBand && !showReport && !showSettings;

  return (
    <div className="app-shell" data-theme={theme}>
      <nav className="top-nav" aria-label="Glavna navigacija">
        <div className="top-nav-brand" aria-hidden="true" />
        <div className="top-nav-links">
          {pages.map(([id, label]) => (
            <button
              key={id}
              className={`top-nav-link ${activePage === id ? "active" : ""}`}
              type="button"
              onClick={() => {
                if (id === "schedule" && activePage === "band") {
                  goToSchedule(true);
                  return;
                }
                setPage(id);
              }}
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
            pendingInvites={pendingInvites}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={handleDeclineInvite}
            onOpenSettings={() => setPage("settings")}
            onSignOut={handleSignOut}
          />
        </div>
      </nav>

      {error ? <div className="app-alert app-alert-global">{error}</div> : null}

      <div
        className={`app-page ${showSchedule || forceSchedule ? "is-active" : ""}`}
        hidden={!(showSchedule || forceSchedule)}
      >
        <SchedulePage
          events={events}
          bands={bands}
          settings={settings}
          activeBandId={activeBandId}
          allBandsId={ALL_BANDS_ID}
          onBandChange={setActiveBandId}
          onBandsChanged={async () => {
            const me = await api("/api/me");
            setProfile(me.profile);
            setBands(me.bands);
            setPendingInvites(me.pendingInvites || []);
          }}
          showToast={showToast}
          profile={profile}
          onAdd={addEvent}
          onUpdate={updateEventFields}
          onRemove={removeEvent}
          loading={loading}
        />
      </div>

      <div className={`app-page ${showBand ? "is-active" : ""}`} hidden={!showBand}>
        <BandPage
          bands={bands}
          activeBandId={activeBandId}
          allBandsId={ALL_BANDS_ID}
          onBandChange={setActiveBandId}
          onBack={() => goToSchedule(true)}
          onBandsChanged={async () => {
            const me = await api("/api/me");
            setProfile(me.profile);
            setBands(me.bands);
            setPendingInvites(me.pendingInvites || []);
          }}
          showToast={showToast}
        />
      </div>

      <div className={`app-page ${showReport ? "is-active" : ""}`} hidden={!showReport}>
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
          showToast={showToast}
        />
      </div>

      <div className={`app-page ${showSettings ? "is-active" : ""}`} hidden={!showSettings}>
        <SettingsPage
          theme={theme}
          onThemeChange={setTheme}
          settings={settings}
          onSaveSetting={saveSetting}
          onFetchExchangeRate={fetchExchangeRate}
          onOpenLegal={setPage}
          invitePreference={profile?.invitePreference || "accept"}
          onInvitePreferenceChange={saveInvitePreference}
          ownedGroupBands={profile?.ownedGroupBands || 0}
          ownerLimit={profile?.ownerLimit || 5}
          showToast={showToast}
        />
      </div>

      {showSchedule || forceSchedule || showBand || showReport ? (
        <BandTiles
          bands={bands}
          activeBandId={showBand ? activeBandId : ""}
          onOpenBand={openBand}
        />
      ) : null}

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
