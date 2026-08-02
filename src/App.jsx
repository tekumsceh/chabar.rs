import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, setApiAuth } from "./api.js";
import BandPage from "./BandPage.jsx";
import { calculate, DEFAULT_RATE, numberValue, parseDate, positiveNumber, startOfToday, todayText, waterfallClaimEur } from "./calculations.js";
import LegalPage, { isLegalPage } from "./LegalPage.jsx";
import LoginPage from "./LoginPage.jsx";
import ReportPage from "./ReportPage.jsx";
import SchedulePage from "./SchedulePage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import ButtonShowcasePage from "./ButtonShowcasePage.jsx";
import GlobalSearch from "./GlobalSearch.jsx";
import ProfileHub from "./ProfileHub.jsx";
import {
  AddNavIcon,
  CalendarPlusNavIcon,
  NewBandNavIcon,
  ProfileNavIcon,
  ScheduleNavIcon,
} from "./appIcons.jsx";
import { useT } from "./i18n/I18nProvider.jsx";
import { log } from "./logger.js";
import { clearAuthParamsFromUrl, waitForAuthSession, supabase } from "./supabase.js";
import { takePendingJoinToken } from "./joinLink.js";
import { isBandLead } from "../shared/roles.js";
import { ownerBandLimit } from "../shared/bandLimits.js";

const NAV_ITEMS = [
  { id: "schedule", labelKey: "nav.schedule", icon: ScheduleNavIcon },
  { id: "add", labelKey: "nav.add", icon: AddNavIcon, isAction: true },
  { id: "profile", labelKey: "nav.profile", icon: ProfileNavIcon },
];

const MAIN_PAGE_IDS = new Set(["schedule", "band", "report", "settings", "button-showcase"]);
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
  const t = useT();
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bands, setBands] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeBandId, setActiveBandId] = useState(() => localStorage.getItem(ACTIVE_BAND_KEY) || ALL_BANDS_ID);
  const [page, setPageState] = useState(DEFAULT_PAGE);
  const [scheduleFocusEventId, setScheduleFocusEventId] = useState(null);
  const [reportFocusEventId, setReportFocusEventId] = useState(null);
  const [reportFocusTab, setReportFocusTab] = useState(null);
  /** Bumped when user chooses Raspored — closes open event detail (with dirty save prompt). */
  const [scheduleLeaveNonce, setScheduleLeaveNonce] = useState(0);

  function setPage(next) {
    setPageState(normalizePage(next));
  }

  const activePage = normalizePage(page);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [financeMode, setFinanceMode] = useState(() => localStorage.getItem(FINANCE_MODE_KEY) || "member");
  const [events, setEvents] = useState([]);
  const [financeEvents, setFinanceEvents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState({
    exchangeRate: DEFAULT_RATE,
    asOfDate: todayText(),
    autoExchangeRate: "1",
  });
  const [planner, setPlanner] = useState({ eur: 0, rsd: 0 });
  const [payingEventId, setPayingEventId] = useState(null);
  const [payingLineKey, setPayingLineKey] = useState("");
  const [bulkPayBusy, setBulkPayBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [profileHubOpen, setProfileHubOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addActionRequest, setAddActionRequest] = useState(null);
  const addNavRef = useRef(null);
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
    const noticePage = params.get("n");
    if (!gcal && !gcalError && !pageParam && !noticePage) return;

    if (gcalError) {
      showToast(gcalError, "error");
    } else if (gcal === "connected") {
      showToast(t("toast.googleCalendarConnected"));
    }
    if (pageParam === "band" && bandParam) {
      setActiveBandId(bandParam);
      setPage("band");
    } else if (pageParam === "settings") {
      setPage("settings");
    } else if (noticePage === "band" && bandParam) {
      setActiveBandId(bandParam);
      setPage("band");
    } else if (noticePage === "report") {
      if (bandParam) setActiveBandId(bandParam);
      setPage("report");
    } else if (noticePage === "schedule") {
      if (bandParam) setActiveBandId(bandParam);
      setPage("schedule");
    }
    const url = new URL(window.location.href);
    ["gcal", "gcal_error", "page", "band", "n", "event"].forEach((key) => url.searchParams.delete(key));
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

  const financeClaimEur = useMemo(() => {
    const calc = calculate(financeEvents, payments, settings, null, {
      mode: effectiveFinanceMode,
      userId: profile?.id || "",
    });
    const pastRows = calc.rows.filter((row) => row.done && row.hasDate);
    return waterfallClaimEur(pastRows);
  }, [financeEvents, payments, settings, effectiveFinanceMode, profile?.id]);

  const canManageActiveBand = Boolean(
    activeBand &&
      activeBand.kind === "group" &&
      isBandLead(activeBand.memberRole) &&
      activeBandId !== ALL_BANDS_ID,
  );

  const profileBadgeCount =
    pendingInvites.length + notifications.filter((item) => !item.readAt).length;

  function goToSchedule() {
    setProfileHubOpen(false);
    setPage("schedule");
    setScheduleLeaveNonce((value) => value + 1);
  }

  function goToMoney() {
    setProfileHubOpen(false);
    setPage("report");
  }

  function handleGlobalSearchSelect(result) {
    if (!result) return;

    if (result.kind === "event") {
      if (result.bandId) setActiveBandId(result.bandId);
      if (activePage === "report") {
        setPage("report");
        setReportFocusEventId(result.id);
      } else {
        setPage("schedule");
        setScheduleFocusEventId(result.id);
      }
      setGlobalSearch(result.filterText || result.label || "");
      return;
    }

    if (result.kind === "band") {
      if (result.bandId) setActiveBandId(result.bandId);
      setGlobalSearch("");
      return;
    }

    setGlobalSearch(result.filterText || result.label || "");
  }

  function openBandPage(bandId) {
    const id = bandId || activeBandId;
    if (!id || id === ALL_BANDS_ID) {
      setPage("band");
      return;
    }
    setActiveBandId(id);
    setPage("band");
    setProfileHubOpen(false);
  }

  function handleNav(id) {
    if (id === "add") {
      setProfileHubOpen(false);
      setAddMenuOpen((open) => !open);
      return;
    }
    setAddMenuOpen(false);
    if (id === "schedule") {
      setProfileHubOpen(false);
      goToSchedule();
      return;
    }
    if (id === "profile") {
      setProfileHubOpen((open) => !open);
    }
  }

  function requestAddAction(type) {
    setAddMenuOpen(false);
    setProfileHubOpen(false);
    goToSchedule();
    setAddActionRequest({ type, nonce: Date.now() });
  }

  useEffect(() => {
    if (!addMenuOpen) return undefined;
    function onPointerDown(event) {
      if (!addNavRef.current?.contains(event.target)) setAddMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setAddMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addMenuOpen]);

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

  // Set token before child useEffects so pages like BandPage don't 401 on mount.
  useLayoutEffect(() => {
    if (!session?.access_token) {
      setApiAuth({ token: "", bandId: "" });
      return;
    }
    setApiAuth({
      token: session.access_token,
      bandId: activeBandId === ALL_BANDS_ID ? "" : activeBandId,
    });
  }, [session?.access_token, activeBandId]);

  useEffect(() => {
    if (!authReady) return;

    if (!session?.access_token) {
      skipBandScheduleReload.current = true;
      setProfile(null);
      setBands([]);
      setPendingInvites([]);
      setNotifications([]);
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
    bootstrapSession(session.access_token);
  }, [authReady, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !activeBandId) return;
    localStorage.setItem(ACTIVE_BAND_KEY, activeBandId);
    if (skipBandScheduleReload.current) return;
    // Band switch only needs schedule; finance is always "mine across bands"
    loadScheduleAndFinance({ scheduleOnly: true });
  }, [activeBandId]);

  // Soft poll so inviters see "member joined" without a full refresh.
  useEffect(() => {
    if (!session?.access_token) return undefined;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      refreshNotifications().catch(() => {});
    };
    const id = window.setInterval(tick, 45000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshNotifications is stable enough for poll
  }, [session?.access_token]);

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
      setNotifications(me.notifications || []);

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
        autoExchangeRate:
          finance.settings.autoExchangeRate ??
          schedule.settings.autoExchangeRate ??
          "1",
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
          autoExchangeRate: finance.settings.autoExchangeRate ?? current.autoExchangeRate ?? "1",
        }));
      }
    } catch (requestError) {
      reportError(requestError, "finance reload failed");
    }
  }

  function mergeFinancePayment(current, payment) {
    if (!payment?.id) return current;
    const index = current.findIndex((item) => item.id === payment.id);
    if (index >= 0) {
      const next = [...current];
      next[index] = payment;
      return next;
    }
    return [...current, payment];
  }

  async function afterFinancePayment(result) {
    if (result?.payment) {
      setPayments((current) => mergeFinancePayment(current, result.payment));
    }
    if (result?.settings) {
      setSettings((current) => ({
        ...current,
        exchangeRate: result.settings.exchangeRate || result.exchangeRate || current.exchangeRate,
      }));
    }
    await reloadFinance();
    setReportFocusTab("payments");
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
      setNotifications(me.notifications || []);
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
      showToast(t("toast.inviteDeclined"));
    } catch (requestError) {
      showToast(requestError.message || "Odbijanje nije uspelo", "error");
    }
  }

  async function refreshNotifications() {
    try {
      const me = await api("/api/me");
      setPendingInvites(me.pendingInvites || []);
      setNotifications(me.notifications || []);
    } catch {
      // ignore — menu can stay on last known list
    }
  }

  async function handleMarkNotificationRead(notificationId) {
    try {
      await api(`/api/me/notifications/${notificationId}/read`, { method: "POST" });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item,
        ),
      );
    } catch (requestError) {
      showToast(requestError.message || t("toast.notSaved"), "error");
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await api("/api/me/notifications/read-all", { method: "POST" });
      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
    } catch (requestError) {
      showToast(requestError.message || t("toast.notSaved"), "error");
    }
  }

  async function handleOpenNotification(notice) {
    if (!notice) return;
    try {
      await handleMarkNotificationRead(notice.id);
    } catch {
      // still try to navigate
    }

    const payload = notice.payload || {};
    const bandId = payload.bandId || notice.bandId || "";
    const eventId = payload.eventId ? Number(payload.eventId) || payload.eventId : null;
    const targetPage = payload.page || "schedule";

    if (bandId) setActiveBandId(bandId);
    setProfileHubOpen(false);

    if (targetPage === "report") {
      setPage("report");
      return;
    }
    if (targetPage === "band") {
      setPage("band");
      return;
    }
    if (targetPage === "settings") {
      setPage("settings");
      return;
    }

    setPage("schedule");
    if (eventId != null && eventId !== "") {
      setScheduleFocusEventId(eventId);
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
      showToast(t("toast.saved"));
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
          mapsUrl: event.mapsUrl ?? "",
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
        mapsUrl: payload.mapsUrl || "",
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
    if (!current) {
      throw new Error("Termin nije pronađen");
    }

    const eventDate = parseDate(current.date);
    const isPast =
      Boolean(String(current.date || "").trim()) &&
      !Number.isNaN(eventDate.getTime()) &&
      eventDate.getTime() < startOfToday().getTime();
    if (isPast) {
      showToast("Prošli termini su zaključani — možeš samo dodati komentar", "error");
      throw new Error("Prošli termini su zaključani — možeš samo dodati komentar");
    }

    const nextEvent = {
      ...current,
      bandId: fields.bandId ?? current.bandId,
      date: fields.date ?? current.date,
      city: fields.city ?? current.city,
      venue: fields.venue ?? current.venue,
      mapsUrl: fields.mapsUrl !== undefined ? fields.mapsUrl : current.mapsUrl,
      note: fields.note ?? current.note,
      priceEur: fields.priceEur !== undefined ? numberValue(fields.priceEur) : numberValue(current.priceEur),
      transportRsd:
        fields.transportRsd !== undefined ? numberValue(fields.transportRsd) : numberValue(current.transportRsd),
    };

    const fromBandId = eventBandId(current);
    const toBandId = eventBandId(nextEvent);
    if (!toBandId || toBandId === ALL_BANDS_ID) {
      showToast("Moraš izabrati bend ili Personal", "error");
      throw new Error("Moraš izabrati bend ili Personal.");
    }

    try {
      await api(`/api/events/${id}`, {
        method: "PUT",
        bandId: fromBandId,
        body: {
          bandId: toBandId,
          date: nextEvent.date ?? "",
          city: nextEvent.city ?? "",
          venue: nextEvent.venue ?? "",
          mapsUrl: nextEvent.mapsUrl ?? "",
          note: nextEvent.note ?? "",
          priceEur: numberValue(nextEvent.priceEur),
          transportRsd: numberValue(nextEvent.transportRsd),
        },
      });
      invalidateScheduleCache(fromBandId);
      if (toBandId !== fromBandId) invalidateScheduleCache(toBandId);
      await loadScheduleAndFinance();
      showToast(`Termin sačuvan: ${nextEvent.date}${nextEvent.city ? ` — ${nextEvent.city}` : ""}`);
    } catch (requestError) {
      showToast(requestError.message || "Termin nije sačuvan", "error");
      throw requestError;
    }
  }

  async function removeEvent(id) {
    const event =
      eventsRef.current.find((item) => item.id === id) || financeEventsRef.current.find((item) => item.id === id);
    if (!event) return;

    const eventDate = parseDate(event.date);
    const isPast =
      Boolean(String(event.date || "").trim()) &&
      !Number.isNaN(eventDate.getTime()) &&
      eventDate.getTime() < startOfToday().getTime();

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
    showToast(t("toast.paymentAdded"));
  }

  async function payFinanceEvent(eventId, bandId) {
    if (!eventId || payingEventId) return;
    setPayingEventId(eventId);
    try {
      const band = bands.find((item) => item.id === (bandId || activeBandId));
      const financeModePayload =
        financeMode === "band" &&
        band &&
        band.kind === "group" &&
        (band.memberRole === "owner" || band.memberRole === "lead")
          ? "band"
          : "member";

      const result = await api("/api/finance/pay-event", {
        method: "POST",
        bandId: bandId || activeBandId,
        body: { eventId, financeMode: financeModePayload },
      });
      await afterFinancePayment(result);
      showToast(t("toast.paymentAdded"));
    } catch (requestError) {
      showToast(requestError.message || t("toast.notSaved"), "error");
    } finally {
      setPayingEventId(null);
    }
  }

  async function payFinanceLine(eventId, bandId, lineKind, expenseKey = "") {
    const lineKey = `${eventId}:${lineKind}:${expenseKey || ""}`;
    if (!eventId || payingLineKey) return;
    setPayingLineKey(lineKey);
    try {
      const band = bands.find((item) => item.id === (bandId || activeBandId));
      const financeModePayload =
        financeMode === "band" &&
        band &&
        band.kind === "group" &&
        (band.memberRole === "owner" || band.memberRole === "lead")
          ? "band"
          : "member";

      const result = await api("/api/finance/pay-line", {
        method: "POST",
        bandId: bandId || activeBandId,
        body: { eventId, lineKind, expenseKey, financeMode: financeModePayload },
      });
      await afterFinancePayment(result);
      showToast(t("toast.paymentAdded"));
    } catch (requestError) {
      showToast(requestError.message || t("toast.notSaved"), "error");
    } finally {
      setPayingLineKey("");
    }
  }

  async function bulkPayFinance({ amount, currency }) {
    if (bulkPayBusy) return;
    const parsed = numberValue(amount);
    if (parsed <= 0) {
      showToast(t("toast.enterAmount"), "error");
      return;
    }
    setBulkPayBusy(true);
    try {
      const band = bands.find((item) => item.id === activeBandId);
      const financeModePayload =
        financeMode === "band" &&
        band &&
        band.kind === "group" &&
        (band.memberRole === "owner" || band.memberRole === "lead") &&
        activeBandId !== ALL_BANDS_ID
          ? "band"
          : "member";

      const result = await api("/api/finance/bulk-pay", {
        method: "POST",
        bandId: activeBandId !== ALL_BANDS_ID ? activeBandId : undefined,
        body: {
          amount: parsed,
          currency: currency === "RSD" ? "RSD" : "EUR",
          financeMode: financeModePayload,
          bandId: activeBandId !== ALL_BANDS_ID ? activeBandId : undefined,
        },
      });
      await afterFinancePayment(result);
      const summary = result.summary?.text || t("toast.paymentAdded");
      showToast(t("report.bulkPaySummary", { summary }));
      return true;
    } catch (requestError) {
      showToast(requestError.message || t("toast.notSaved"), "error");
      return false;
    } finally {
      setBulkPayBusy(false);
    }
  }

  async function removePayment(id) {
    await api(`/api/payments/${id}`, { method: "DELETE" });
    setPayments((current) => current.filter((payment) => payment.id !== id));
  }

  async function applyPlannerPayment() {
    const eur = numberValue(planner.eur);
    const rsd = numberValue(planner.rsd);

    if (!eur && !rsd) {
      showToast(t("toast.enterAmount"));
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
    navigator.clipboard.writeText(payload).then(() => showToast(t("toast.copied")));
  }

  async function handleSignOut() {
    // Local only — default "global" revokes every device and feels like random kickouts.
    await supabase.auth.signOut({ scope: "local" });
    setApiAuth({ token: "", bandId: "" });
    localStorage.removeItem(ACTIVE_BAND_KEY);
    setActiveBandId("");
  }

  if (!authReady) {
    return <AppBoot t={t} />;
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
  const showButtonShowcase = activePage === "button-showcase";
  const forceSchedule =
    !showSchedule && !showBand && !showReport && !showSettings && !showButtonShowcase;
  const ownedGroupBands = profile?.ownedGroupBands ?? 0;
  const ownerLimit = profile?.ownerLimit ?? ownerBandLimit(0);
  const canCreateBand = ownedGroupBands < ownerLimit;

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-topbar">
        <button
          type="button"
          className="app-topbar-brand"
          aria-label={t("nav.brandAria")}
          title={t("nav.schedule")}
          onClick={() => {
            setProfileHubOpen(false);
            goToSchedule();
          }}
        >
          Chabar
        </button>
        <GlobalSearch
          value={globalSearch}
          onChange={setGlobalSearch}
          onSelectResult={handleGlobalSearchSelect}
          authReady={Boolean(session?.access_token)}
        />
      </header>

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
            setNotifications(me.notifications || []);
          }}
          showToast={showToast}
          profile={profile}
          onAdd={addEvent}
          onUpdate={updateEventFields}
          onRemove={removeEvent}
          onRefreshSchedule={() => loadScheduleAndFinance({ scheduleOnly: true })}
          leaveEventSignal={scheduleLeaveNonce}
          focusEventId={scheduleFocusEventId}
          onFocusEventConsumed={() => setScheduleFocusEventId(null)}
          addActionRequest={addActionRequest}
          onAddActionConsumed={() => setAddActionRequest(null)}
          loading={loading}
          searchQuery={globalSearch}
          claimEur={financeClaimEur}
          onOpenMoney={goToMoney}
          canManageBand={canManageActiveBand}
          onManageBand={() => openBandPage(activeBandId)}
        />
      </div>

      <div className={`app-page ${showBand ? "is-active" : ""}`} hidden={!showBand}>
        <BandPage
          bands={bands}
          activeBandId={activeBandId}
          allBandsId={ALL_BANDS_ID}
          isActive={showBand}
          authReady={Boolean(session?.access_token)}
          onBandChange={setActiveBandId}
          onBack={goToSchedule}
          onBandsChanged={async () => {
            const me = await api("/api/me");
            setProfile(me.profile);
            setBands(me.bands);
            setPendingInvites(me.pendingInvites || []);
            setNotifications(me.notifications || []);
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
          userId={profile?.id || ""}
          searchQuery={globalSearch}
          focusEventId={reportFocusEventId}
          onFocusEventConsumed={() => setReportFocusEventId(null)}
          focusTab={reportFocusTab}
          onFocusTabConsumed={() => setReportFocusTab(null)}
          onBack={goToSchedule}
          onPayEvent={payFinanceEvent}
          onPayLine={payFinanceLine}
          onBulkPay={bulkPayFinance}
          payingEventId={payingEventId}
          payingLineKey={payingLineKey}
          bulkPayBusy={bulkPayBusy}
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
          showToast={showToast}
          onBack={goToSchedule}
          onOpenButtonShowcase={() => setPage("button-showcase")}
        />
      </div>

      <div className={`app-page ${showButtonShowcase ? "is-active" : ""}`} hidden={!showButtonShowcase}>
        <ButtonShowcasePage onBack={() => setPage("settings")} />
      </div>

      <ProfileHub
        open={profileHubOpen}
        onClose={() => setProfileHubOpen(false)}
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
        notifications={notifications}
        bands={bands}
        claimEur={financeClaimEur}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        onOpenNotifications={refreshNotifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onOpenNotification={handleOpenNotification}
        onOpenMoney={goToMoney}
        onOpenBand={openBandPage}
        onOpenSettings={() => {
          setProfileHubOpen(false);
          setPage("settings");
        }}
        onSignOut={handleSignOut}
      />

      <nav className="app-tabbar" aria-label={t("nav.mainNav")}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const label = t(item.labelKey);
          if (item.isAction) {
            return (
              <div
                key={item.id}
                className={`app-tabbar-add-wrap ${addMenuOpen ? "is-open" : ""}`}
                ref={addNavRef}
              >
                <button
                  type="button"
                  className={`app-tabbar-add ${addMenuOpen ? "is-open" : ""}`}
                  aria-label={t("nav.addMenu")}
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                  title={label}
                  onClick={() => handleNav("add")}
                >
                  <Icon />
                  <span className="sr-only">{label}</span>
                </button>
                {addMenuOpen ? (
                  <ul className="app-tabbar-add-menu" role="menu" aria-label={label}>
                    <li role="none">
                      <button
                        type="button"
                        className="app-tabbar-add-item"
                        role="menuitem"
                        onClick={() => requestAddAction("termin")}
                      >
                        <CalendarPlusNavIcon />
                        <span>{t("nav.addEvent")}</span>
                      </button>
                    </li>
                    <li role="none">
                      <button
                        type="button"
                        className="app-tabbar-add-item"
                        role="menuitem"
                        disabled={!canCreateBand}
                        title={
                          canCreateBand
                            ? t("nav.createGroupBand")
                            : t("nav.bandLimit", { owned: ownedGroupBands, limit: ownerLimit })
                        }
                        onClick={() => {
                          if (!canCreateBand) {
                            showToast(t("nav.bandLimitToast", { limit: ownerLimit }), "error");
                            return;
                          }
                          requestAddAction("band");
                        }}
                      >
                        <NewBandNavIcon />
                        <span>
                          {canCreateBand
                            ? t("schedule.createBand")
                            : t("nav.bandLimit", { owned: ownedGroupBands, limit: ownerLimit })}
                        </span>
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            );
          }

          const isActive =
            item.id === "profile"
              ? profileHubOpen || showSettings || showButtonShowcase
              : activePage === item.id || (item.id === "schedule" && forceSchedule);
          return (
            <button
              key={item.id}
              type="button"
              className={`app-tabbar-item ${isActive ? "is-active" : ""} ${item.id === "profile" && profileBadgeCount > 0 ? "has-badge" : ""}`.trim()}
              aria-current={isActive ? "page" : undefined}
              aria-expanded={item.id === "profile" ? profileHubOpen : undefined}
              aria-label={label}
              title={label}
              onClick={() => handleNav(item.id)}
            >
              <Icon />
              <span className="sr-only">{label}</span>
              {item.id === "profile" && profileBadgeCount > 0 ? (
                <span className="app-tabbar-badge" aria-hidden="true">
                  {profileBadgeCount > 9 ? "9+" : profileBadgeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {toast ? (
        <div id="toast" className={`show toast-${toast.type || "success"}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

function AppBoot({ t }) {
  return (
    <main className="app-boot" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t("common.loading")}</span>
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
