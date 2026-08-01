import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import FieldSelect from "./FieldSelect.jsx";
import { useT } from "./i18n/I18nProvider.jsx";
import { MIXING_CONSOLE_GROUPS } from "./mixingConsoles.js";
import { reorderArray, useTechChannelDrag } from "./useTechChannelDrag.js";
import {
  emptyTechChannel,
  HARDWARE_PRESETS,
  OUTPUT_GEAR_PRESETS,
  suggestGearForSource,
} from "./techRiderPresets.js";
import TechRiderSheet, { SheetIcon } from "./TechRiderSheet.jsx";

const SAVE_DEBOUNCE_MS = 700;
const TECH_RIDER_CACHE_TTL_MS = 30_000;
const TECH_RIDER_DESKTOP_MQ = "(min-width: 860px)";
const HARDWARE_BASE_OPTIONS = HARDWARE_PRESETS.map((item) => ({ id: item, label: item }));
const OUTPUT_GEAR_BASE_OPTIONS = OUTPUT_GEAR_PRESETS.map((item) => ({ id: item, label: item }));
/** Soft cache so remounting the panel does not blank-wait on the same event. */
const techRiderBundleCache = new Map();
const techRiderPrefetchInflight = new Map();

function cacheKeyFor(eventId, bandId) {
  return `${eventId}:${bandId}`;
}

function readCachedBundle(eventId, bandId) {
  return techRiderBundleCache.get(cacheKeyFor(eventId, bandId)) || null;
}

function writeCachedBundle(eventId, bandId, data) {
  techRiderBundleCache.set(cacheKeyFor(eventId, bandId), {
    data,
    fetchedAt: Date.now(),
  });
}

function bundleChannelCount(data) {
  return (data?.inputs?.length || 0) + (data?.outputs?.length || 0);
}

function isSuspiciousPartialBundle(data) {
  if (!data) return false;
  const count = bundleChannelCount(data);
  const expected = Number(data.bandDefaultChannelCount) || 0;
  if (expected <= 0) return false;
  if (data.origin === "default" && count > 0 && count < expected) return true;
  if (count > 0 && count < expected && count <= 2) {
    const rows = [...(data.inputs || []), ...(data.outputs || [])];
    return rows.every(
      (row) =>
        !String(row.label || "").trim() &&
        !String(row.gear || "").trim() &&
        !String(row.cable || "").trim() &&
        !String(row.hardware || "").trim() &&
        !String(row.notes || "").trim(),
    );
  }
  return false;
}

/** Warm the rider cache as soon as Tehnički opens (before the subtab mounts). */
export function prefetchTechRider(eventId, bandId) {
  if (!eventId || !bandId) return;
  const cacheKey = cacheKeyFor(eventId, bandId);
  const cached = techRiderBundleCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.fetchedAt < TECH_RIDER_CACHE_TTL_MS &&
    !isSuspiciousPartialBundle(cached.data)
  ) {
    return;
  }
  if (techRiderPrefetchInflight.has(cacheKey)) return;

  const request = api(`/api/events/${eventId}/tech-rider`, { bandId })
    .then((data) => {
      writeCachedBundle(eventId, bandId, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      techRiderPrefetchInflight.delete(cacheKey);
    });
  techRiderPrefetchInflight.set(cacheKey, request);
}

export function invalidateTechRiderCacheForBand(bandId) {
  if (!bandId) return;
  const suffix = `:${bandId}`;
  for (const key of techRiderBundleCache.keys()) {
    if (key.endsWith(suffix)) techRiderBundleCache.delete(key);
  }
  for (const key of techRiderPrefetchInflight.keys()) {
    if (key.endsWith(suffix)) techRiderPrefetchInflight.delete(key);
  }
}

function formatInputCh(index) {
  return String(index + 1).padStart(2, "0");
}

function formatOutputCh(index) {
  return String(index + 1).padStart(2, "0");
}

function channelSnapshot(row) {
  return {
    kind: row.kind,
    label: row.label ?? "",
    gear: row.gear ?? "",
    cable: row.cable ?? "",
    hardware: row.hardware ?? "",
    // Not shown in UI anymore; keep API fields cleared.
    phantom48v: false,
    pad: false,
    stereo: Boolean(row.stereo),
    isEmpty: Boolean(row.isEmpty),
    levelDb: row.levelDb == null || row.levelDb === "" ? null : Number(row.levelDb),
    notes: row.notes ?? "",
  };
}

function sameChannelContent(a, b) {
  const left = channelSnapshot(a);
  const right = channelSnapshot(b);
  return (
    left.kind === right.kind &&
    left.label === right.label &&
    left.gear === right.gear &&
    left.cable === right.cable &&
    left.hardware === right.hardware &&
    left.stereo === right.stereo &&
    left.isEmpty === right.isEmpty &&
    left.levelDb === right.levelDb &&
    left.notes === right.notes
  );
}

function emptyChannelPatch(nextEmpty) {
  if (!nextEmpty) return { isEmpty: false };
  return {
    isEmpty: true,
    phantom48v: false,
    pad: false,
    stereo: false,
    levelDb: null,
  };
}

function bundleFromCache(eventId, bandId) {
  if (!eventId || !bandId) return null;
  return readCachedBundle(eventId, bandId)?.data || null;
}

export default function TechnicalRiderPanel({ eventId, bandId, readOnly = false, showToast }) {
  const t = useT();
  const cachedBundle = bundleFromCache(eventId, bandId);
  const [mode, setMode] = useState("input");
  const [inputs, setInputs] = useState(() =>
    Array.isArray(cachedBundle?.inputs) ? cachedBundle.inputs : [],
  );
  const [outputs, setOutputs] = useState(() =>
    Array.isArray(cachedBundle?.outputs) ? cachedBundle.outputs : [],
  );
  const [stats, setStats] = useState(
    () => cachedBundle?.stats || { inputCount: 0, outputCount: 0, phantom48vActive: 0 },
  );
  const [consoleIds, setConsoleIds] = useState(() =>
    Array.isArray(cachedBundle?.consoleIds) ? cachedBundle.consoleIds : [],
  );
  const [limits, setLimits] = useState(() => cachedBundle?.limits || { inputMax: 0, outputMax: 0 });
  const [origin, setOrigin] = useState(() => cachedBundle?.origin || "none");
  const [hasBandDefault, setHasBandDefault] = useState(() => Boolean(cachedBundle?.hasBandDefault));
  const [riderNotes, setRiderNotes] = useState(() => String(cachedBundle?.notes || ""));
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(eventId && bandId) && !cachedBundle);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [drawerChannel, setDrawerChannel] = useState(null);
  const [drawerDraft, setDrawerDraft] = useState(null);
  const [menuChannelId, setMenuChannelId] = useState(null);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(TECH_RIDER_DESKTOP_MQ).matches : true,
  );

  const inputsRef = useRef(inputs);
  const outputsRef = useRef(outputs);
  const saveTimersRef = useRef(new Map());
  const saveInFlightRef = useRef(new Map());

  inputsRef.current = inputs;
  outputsRef.current = outputs;

  const channels = mode === "output" ? outputs : inputs;
  const activeLimit = mode === "output" ? limits.outputMax : limits.inputMax;
  const atChannelLimit = activeLimit > 0 && channels.length >= activeLimit;
  const canAddChannel = !readOnly && consoleIds.length > 0 && !atChannelLimit;

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((row) =>
      [row.label, row.gear, row.cable, row.hardware, row.notes]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [channels, search]);

  const channelIndexById = useMemo(() => {
    const map = new Map();
    channels.forEach((row, index) => map.set(row.id, index));
    return map;
  }, [channels]);

  const searchActive = Boolean(search.trim());

  const commitReorder = useCallback(
    async (fromIndex, toIndex) => {
      if (readOnly || !eventId || !bandId) return;
      const kind = mode;
      const list = kind === "output" ? [...outputsRef.current] : [...inputsRef.current];
      const next = reorderArray(list, fromIndex, toIndex);
      const orderedIds = next.map((row) => row.id);

      if (kind === "output") {
        outputsRef.current = next;
        setOutputs(next);
      } else {
        inputsRef.current = next;
        setInputs(next);
        refreshStats(next, outputsRef.current);
      }

      setBusyId("reorder");
      try {
        await flushAllPending();
        const data = await api(`/api/events/${eventId}/tech-rider/reorder`, {
          method: "PUT",
          bandId,
          body: { kind, orderedIds },
        });
        applyBundle(data);
      } catch (requestError) {
        showToast?.(requestError.message || t("tech.reorderFail"), "error");
        try {
          const data = await api(`/api/events/${eventId}/tech-rider`, { bandId });
          applyBundle(data);
        } catch {
          /* ignore */
        }
      } finally {
        setBusyId("");
      }
    },
    [readOnly, eventId, bandId, mode, showToast, t],
  );

  const { dragEnabled, draggingId, dropIndex, onHandlePointerDown } = useTechChannelDrag({
    kind: mode,
    readOnly,
    searchActive,
    onCommitReorder: commitReorder,
  });

  function channelRowStateClass(channel, index) {
    const parts = [];
    if (channel.isEmpty) parts.push("is-empty-channel");
    if (draggingId === channel.id) parts.push("is-drag-source");
    if (dropIndex === index && draggingId !== channel.id) parts.push("is-drop-target");
    return parts.join(" ");
  }

  function toggleEmpty(channel) {
    return saveChannel(channel, emptyChannelPatch(!channel.isEmpty));
  }

  function refreshStats(nextInputs = inputsRef.current, nextOutputs = outputsRef.current) {
    setStats({
      inputCount: nextInputs.length,
      outputCount: nextOutputs.length,
      phantom48vActive: nextInputs.filter((row) => row.phantom48v).length,
    });
  }

  useEffect(() => {
    const mq = window.matchMedia(TECH_RIDER_DESKTOP_MQ);
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function applyBundle(data) {
    if (eventId && bandId) {
      writeCachedBundle(eventId, bandId, data);
    }
    setInputs(Array.isArray(data.inputs) ? data.inputs : []);
    setOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    setStats(data.stats || { inputCount: 0, outputCount: 0, phantom48vActive: 0 });
    setConsoleIds(Array.isArray(data.consoleIds) ? data.consoleIds : []);
    setLimits(data.limits || { inputMax: 0, outputMax: 0 });
    if (data.origin != null) setOrigin(data.origin);
    if (data.hasBandDefault != null) setHasBandDefault(Boolean(data.hasBandDefault));
    if (data.notes != null) setRiderNotes(String(data.notes || ""));
  }

  function markLocalCustom() {
    setOrigin((current) => (current === "default" ? "custom" : current));
  }

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
      const cacheKey = cacheKeyFor(eventId, bandId);
      const cachedEntry = techRiderBundleCache.get(cacheKey);
      const cached = cachedEntry?.data || null;
      const cacheAge = cachedEntry ? Date.now() - cachedEntry.fetchedAt : Infinity;
      const cacheLooksEmpty =
        cached && !(cached.inputs?.length || cached.outputs?.length);
      const cachePartial = cached && isSuspiciousPartialBundle(cached);
      const cacheFresh = Boolean(
        cached && !cacheLooksEmpty && !cachePartial && cacheAge < TECH_RIDER_CACHE_TTL_MS,
      );

      // Paint immediately from cache; never blank-wait when we already have channels.
      if (cached && !cacheLooksEmpty && !cachePartial) {
        applyBundle(cached);
        setLoading(false);
        setError("");
        if (cacheFresh) return;
      } else {
        setLoading(true);
        setError("");
      }

      try {
        const inflight = techRiderPrefetchInflight.get(cacheKey);
        let data = inflight ? await inflight : null;
        if (!data) {
          data = await api(`/api/events/${eventId}/tech-rider`, { bandId });
        }
        if (cancelled || !data) return;
        writeCachedBundle(eventId, bandId, data);
        applyBundle(data);
      } catch (requestError) {
        if (!cancelled && (!cached || cacheLooksEmpty)) {
          setError(requestError.message || t("tech.loadFail"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      for (const timer of saveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      saveTimersRef.current.clear();
    };
  }, [eventId, bandId, t]);

  function getChannel(id, kind) {
    const list = kind === "output" ? outputsRef.current : inputsRef.current;
    return list.find((row) => row.id === id) || null;
  }

  async function persistChannel(id, kind) {
    if (readOnly || !eventId || !bandId) return;
    const channel = getChannel(id, kind);
    if (!channel) return;

    const snapshot = channelSnapshot(channel);
    const key = String(id);
    const previous = saveInFlightRef.current.get(key);
    if (previous) await previous.catch(() => {});

    const request = (async () => {
      try {
        const updated = await api(`/api/events/${eventId}/tech-rider/channels/${id}`, {
          method: "PUT",
          bandId,
          body: { ...channel, ...snapshot },
        });
        const reconcile = (list) =>
          list.map((row) => {
            if (row.id !== id) return row;
            // Keep newer local typing if the user kept editing during the request.
            if (!sameChannelContent(row, snapshot)) return row;
            return updated;
          });
        if (kind === "output") {
          setOutputs(reconcile);
        } else {
          setInputs((current) => {
            const next = reconcile(current);
            refreshStats(next, outputsRef.current);
            return next;
          });
        }
      } catch (requestError) {
        showToast?.(requestError.message || t("tech.saveFail"), "error");
      } finally {
        if (saveInFlightRef.current.get(key) === request) {
          saveInFlightRef.current.delete(key);
        }
      }
    })();

    saveInFlightRef.current.set(key, request);
    await request;
  }

  function scheduleSave(id, kind) {
    if (readOnly || !id) return;
    const key = String(id);
    const existing = saveTimersRef.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      saveTimersRef.current.delete(key);
      persistChannel(id, kind);
    }, SAVE_DEBOUNCE_MS);
    saveTimersRef.current.set(key, timer);
  }

  async function flushSave(id, kind) {
    if (!id) return;
    const key = String(id);
    const existing = saveTimersRef.current.get(key);
    if (existing) {
      clearTimeout(existing);
      saveTimersRef.current.delete(key);
    }
    await persistChannel(id, kind);
  }

  async function flushAllPending() {
    const pending = [...saveTimersRef.current.entries()];
    saveTimersRef.current.clear();
    for (const [, timer] of pending) clearTimeout(timer);

    const ids = new Set([
      ...pending.map(([id]) => id),
      ...saveInFlightRef.current.keys(),
    ]);
    await Promise.all(
      [...ids].map(async (id) => {
        const channel =
          inputsRef.current.find((row) => String(row.id) === String(id)) ||
          outputsRef.current.find((row) => String(row.id) === String(id));
        if (!channel) return;
        await persistChannel(channel.id, channel.kind);
      }),
    );
  }

  function updateChannel(id, kind, patch) {
    markLocalCustom();
    if (kind === "output") {
      const next = outputsRef.current.map((row) => (row.id === id ? { ...row, ...patch } : row));
      outputsRef.current = next;
      setOutputs(next);
    } else {
      const next = inputsRef.current.map((row) => (row.id === id ? { ...row, ...patch } : row));
      inputsRef.current = next;
      setInputs(next);
    }
    scheduleSave(id, kind);
  }

  async function saveConsoles(nextIds) {
    if (readOnly || !eventId || !bandId) return;
    const previousIds = consoleIds;
    setConsoleIds(nextIds);
    try {
      await flushAllPending();
      const data = await api(`/api/events/${eventId}/tech-rider/consoles`, {
        method: "PUT",
        bandId,
        body: { consoleIds: nextIds },
      });
      // Only sync console selection/limits — do not replace channel rows.
      setConsoleIds(Array.isArray(data.consoleIds) ? data.consoleIds : nextIds);
      setLimits(data.limits || { inputMax: 0, outputMax: 0 });
      if (data.origin != null) setOrigin(data.origin);
      if (data.hasBandDefault != null) setHasBandDefault(Boolean(data.hasBandDefault));
      if ((inputsRef.current.length || outputsRef.current.length) > 0) markLocalCustom();
    } catch (requestError) {
      setConsoleIds(previousIds);
      showToast?.(requestError.message || t("tech.consolesFail"), "error");
    }
  }

  function toggleConsole(consoleId) {
    const nextIds = consoleIds.includes(consoleId)
      ? consoleIds.filter((id) => id !== consoleId)
      : [...consoleIds, consoleId];
    saveConsoles(nextIds);
  }

  async function addChannel() {
    if (readOnly || !eventId || !bandId) return;
    if (!consoleIds.length) {
      showToast?.(t("tech.pickConsoleBeforeAdd"), "error");
      return;
    }
    if (atChannelLimit) {
      showToast?.(
        mode === "output"
          ? t("tech.outputLimit", { max: limits.outputMax })
          : t("tech.inputLimit", { max: limits.inputMax }),
        "error",
      );
      return;
    }
    setBusyId("add");
    try {
      await flushAllPending();
      const created = await api(`/api/events/${eventId}/tech-rider/channels`, {
        method: "POST",
        bandId,
        body: emptyTechChannel(mode),
      });
      markLocalCustom();
      setHasBandDefault(true);
      if (mode === "output") {
        setOutputs((current) => {
          const next = [...current, created];
          outputsRef.current = next;
          refreshStats(inputsRef.current, next);
          return next;
        });
      } else {
        setInputs((current) => {
          const next = [...current, created];
          inputsRef.current = next;
          refreshStats(next, outputsRef.current);
          return next;
        });
      }
      showToast?.(mode === "output" ? t("tech.outputAdded") : t("tech.inputAdded"));
    } catch (requestError) {
      showToast?.(requestError.message || t("tech.addFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  async function saveChannel(channel, patch) {
    if (readOnly || !eventId || !bandId) return;
    updateChannel(channel.id, channel.kind, patch);
    await flushSave(channel.id, channel.kind);
  }

  async function removeChannel(channel) {
    if (readOnly || !eventId || !bandId) return;
    setBusyId(String(channel.id));
    try {
      await flushAllPending();
      await api(`/api/events/${eventId}/tech-rider/channels/${channel.id}`, {
        method: "DELETE",
        bandId,
      });
      markLocalCustom();
      if (channel.kind === "output") {
        setOutputs((current) => {
          const next = current.filter((row) => row.id !== channel.id);
          outputsRef.current = next;
          refreshStats(inputsRef.current, next);
          return next;
        });
      } else {
        setInputs((current) => {
          const next = current.filter((row) => row.id !== channel.id);
          inputsRef.current = next;
          refreshStats(next, outputsRef.current);
          return next;
        });
      }
      showToast?.(t("tech.channelDeleted"));
    } catch (requestError) {
      showToast?.(requestError.message || t("tech.deleteFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  function openDrawer(channel) {
    setDrawerChannel(channel);
    setDrawerDraft({ ...channel });
  }

  function closeDrawer() {
    setDrawerChannel(null);
    setDrawerDraft(null);
    setMenuChannelId(null);
  }

  async function saveDrawer() {
    if (!drawerChannel || !drawerDraft) return;
    await saveChannel(drawerChannel, drawerDraft);
    closeDrawer();
  }

  async function useAsBandDefault() {
    if (readOnly || !eventId || !bandId) return;
    setBusyId("use-default");
    try {
      await flushAllPending();
      const data = await api(`/api/events/${eventId}/tech-rider/use-as-default`, {
        method: "PUT",
        bandId,
      });
      applyBundle(data);
      invalidateTechRiderCacheForBand(bandId);
      showToast?.(t("tech.useAsDefaultOk"));
    } catch (requestError) {
      showToast?.(requestError.message || t("tech.useAsDefaultFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  function openNotes() {
    setNotesDraft(riderNotes);
    setNotesOpen(true);
  }

  function closeNotes() {
    setNotesOpen(false);
  }

  async function saveNotes() {
    if (readOnly || !eventId || !bandId) return;
    setBusyId("notes");
    try {
      const data = await api(`/api/events/${eventId}/tech-rider/notes`, {
        method: "PUT",
        bandId,
        body: { notes: notesDraft },
      });
      applyBundle(data);
      markLocalCustom();
      setNotesOpen(false);
      showToast?.(t("tech.notesSaved"));
    } catch (requestError) {
      showToast?.(requestError.message || t("tech.notesSaveFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  const showDefaultBanner =
    origin === "default" && !readOnly && (inputs.length > 0 || outputs.length > 0);
  const showUseAsDefault =
    !readOnly &&
    origin === "custom" &&
    hasBandDefault &&
    (inputs.length > 0 || outputs.length > 0);

  if (loading) {
    return <p className="tech-rider-status">{t("tech.loading")}</p>;
  }

  if (error) {
    return <p className="tech-rider-status is-error">{error}</p>;
  }

  return (
    <div className="tech-rider">
      <header className="tech-rider-head">
        <h3 className="tech-rider-title">{t("tech.title")}</h3>
        <div className="tech-rider-head-actions">
          <button
            type="button"
            className="tech-rider-sheet-btn"
            title={t("tech.sheet.open")}
            aria-label={t("tech.sheet.open")}
            onClick={() => setSheetOpen(true)}
          >
            <SheetIcon />
            <span>{t("tech.sheet.short")}</span>
          </button>
          <button
            type="button"
            className={`tech-rider-notes-btn ${riderNotes.trim() ? "has-notes" : ""}`}
            title={t("tech.notesTitle")}
            aria-label={t("tech.notes")}
            onClick={openNotes}
          >
            {t("tech.notes")}
          </button>
          {readOnly ? null : (
            <button
              type="button"
              className="tech-rider-add-btn"
              disabled={busyId === "add" || !canAddChannel}
              title={
                !consoleIds.length
                  ? t("tech.pickConsole")
                  : atChannelLimit
                    ? t("tech.channelLimit", { max: activeLimit })
                    : t("tech.addChannel")
              }
              onClick={addChannel}
            >
              {busyId === "add" ? "…" : t("tech.addChannel")}
            </button>
          )}
        </div>
      </header>

      {showDefaultBanner ? (
        <p className="tech-rider-default-banner" role="status">
          {t("tech.defaultBanner")}
        </p>
      ) : null}

      {showUseAsDefault ? (
        <div className="tech-rider-default-actions">
          <button
            type="button"
            className="tech-rider-use-default-btn"
            disabled={busyId === "use-default"}
            onClick={useAsBandDefault}
          >
            {busyId === "use-default" ? "…" : t("tech.useAsDefault")}
          </button>
        </div>
      ) : null}

      <div className="tech-rider-console-bar">
        <ConsoleMultiSelect
          groups={MIXING_CONSOLE_GROUPS}
          selectedIds={consoleIds}
          readOnly={readOnly}
          onToggle={toggleConsole}
        />
      </div>

      <div className="tech-rider-mode" role="tablist" aria-label={t("tech.patchMode")}>
        <button
          type="button"
          role="tab"
          className={`tech-rider-mode-btn is-input ${mode === "input" ? "is-active" : ""}`}
          aria-selected={mode === "input"}
          onClick={() => setMode("input")}
        >
          {t("tech.inputList", { count: stats.inputCount })}
        </button>
        <button
          type="button"
          role="tab"
          className={`tech-rider-mode-btn is-output ${mode === "output" ? "is-active" : ""}`}
          aria-selected={mode === "output"}
          onClick={() => setMode("output")}
        >
          {t("tech.outputList", { count: stats.outputCount })}
        </button>
      </div>

      <label className="tech-rider-search">
        <span className="sr-only">{t("tech.search")}</span>
        <input
          id="tech-channel-search"
          name="tech-channel-search"
          type="search"
          autoComplete="off"
          placeholder={t("tech.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {readOnly ? (
        <p className="tech-rider-locknote">{t("tech.locknote")}</p>
      ) : null}

      {isDesktopLayout ? (
      <div className={`tech-rider-desktop ${mode === "output" ? "is-output-mode" : ""}`}>
        <table className="tech-rider-table">
          <thead>
            <tr>
              <th>{t("tech.col.ch")}</th>
              <th>{mode === "output" ? t("tech.col.destination") : t("tech.col.source")}</th>
              <th>{t("tech.col.gear")}</th>
              {mode === "input" ? <th>{t("tech.col.hardware")}</th> : null}
              {mode === "output" ? (
                <>
                  <th>{t("tech.col.stereo")}</th>
                  <th>{t("tech.col.level")}</th>
                </>
              ) : null}
              <th>{t("tech.col.empty")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {filteredChannels.length ? (
              filteredChannels.map((channel) => {
                const index = channelIndexById.get(channel.id) ?? 0;
                const chLabel = mode === "output" ? formatOutputCh(index) : formatInputCh(index);
                const rowActionsBusy = busyId === String(channel.id);
                const fieldsLocked = readOnly || channel.isEmpty;
                return (
                  <tr
                    key={channel.id}
                    data-tech-channel-row
                    data-tech-channel-kind={channel.kind}
                    data-channel-index={index}
                    data-channel-id={channel.id}
                    className={channelRowStateClass(channel, index)}
                  >
                    <td>
                      <ChannelDragHandle
                        label={chLabel}
                        dragEnabled={dragEnabled}
                        isDragging={draggingId === channel.id}
                        onPointerDown={(event) => onHandlePointerDown(event, channel, index)}
                      />
                    </td>
                    <td>
                      {channel.isEmpty ? (
                        <span className="tech-rider-empty-badge">{t("tech.emptyBadge")}</span>
                      ) : (
                        <input
                          className="tech-rider-cell-input"
                          name={`tech-${channel.id}-label`}
                          autoComplete="off"
                          value={channel.label}
                          readOnly={fieldsLocked}
                          placeholder={mode === "output" ? "Mon 1" : "Kick In"}
                          onChange={(e) => updateChannel(channel.id, channel.kind, { label: e.target.value })}
                          onBlur={() => flushSave(channel.id, channel.kind)}
                        />
                      )}
                    </td>
                    <td>
                      {mode === "output" ? (
                        <OutputGearSelect
                          value={channel.isEmpty ? "" : channel.gear}
                          disabled={fieldsLocked}
                          onChange={(next) => {
                            updateChannel(channel.id, channel.kind, { gear: next });
                            flushSave(channel.id, channel.kind);
                          }}
                        />
                      ) : (
                        <input
                          className="tech-rider-cell-input"
                          name={`tech-${channel.id}-gear`}
                          autoComplete="off"
                          value={channel.isEmpty ? "" : channel.gear}
                          readOnly={fieldsLocked}
                          placeholder={channel.isEmpty ? "—" : "Mic / DI"}
                          onChange={(e) => updateChannel(channel.id, channel.kind, { gear: e.target.value })}
                          onBlur={() => flushSave(channel.id, channel.kind)}
                        />
                      )}
                    </td>
                    {mode === "input" ? (
                      <td>
                        <HardwareSelect
                          value={channel.isEmpty ? "" : channel.hardware}
                          disabled={fieldsLocked}
                          onChange={(next) => {
                            updateChannel(channel.id, channel.kind, { hardware: next });
                            flushSave(channel.id, channel.kind);
                          }}
                        />
                      </td>
                    ) : null}
                    {mode === "output" ? (
                      <>
                        <td>
                          <ToggleButton
                            label={t("tech.col.stereo")}
                            active={channel.stereo}
                            tone="output"
                            disabled={fieldsLocked}
                            onClick={() => saveChannel(channel, { stereo: !channel.stereo })}
                          />
                        </td>
                        <td>
                          <input
                            className="tech-rider-cell-input tech-rider-level-input"
                            name={`tech-${channel.id}-level`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={channel.isEmpty ? "" : (channel.levelDb ?? "")}
                            readOnly={fieldsLocked}
                            placeholder={channel.isEmpty ? "—" : "0 dB"}
                            onChange={(e) =>
                              updateChannel(channel.id, channel.kind, { levelDb: e.target.value })
                            }
                            onBlur={() => {
                              const raw = String(
                                outputsRef.current.find((row) => row.id === channel.id)?.levelDb ?? "",
                              ).trim();
                              const parsed = raw === "" ? null : Number(raw.replace(",", "."));
                              updateChannel(channel.id, channel.kind, {
                                levelDb: Number.isFinite(parsed) ? parsed : null,
                              });
                              flushSave(channel.id, channel.kind);
                            }}
                          />
                        </td>
                      </>
                    ) : null}
                    <td>
                      <ToggleButton
                        label={t("tech.col.empty")}
                        active={channel.isEmpty}
                        tone="empty"
                        disabled={readOnly}
                        onClick={() => toggleEmpty(channel)}
                      />
                    </td>
                    <td className="tech-rider-actions">
                      {readOnly ? null : (
                        <ChannelActionsMenu
                          channel={channel}
                          mode={mode}
                          readOnly={readOnly}
                          rowActionsBusy={rowActionsBusy}
                          compact
                          showFlags={false}
                          isOpen={menuChannelId === channel.id}
                          onOpen={() => setMenuChannelId(channel.id)}
                          onClose={() => setMenuChannelId(null)}
                          onEdit={() => openDrawer(channel)}
                          onToggleEmpty={() => toggleEmpty(channel)}
                          onToggleStereo={() => saveChannel(channel, { stereo: !channel.stereo })}
                          onDelete={() => removeChannel(channel)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={mode === "output" ? 7 : 6} className="tech-rider-empty-row">
                  {search.trim() ? t("tech.noSearch") : t("tech.noChannels")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      ) : (
      <ul className={`tech-rider-mobile ${mode === "output" ? "is-output-mode" : ""}`}>
        {filteredChannels.length ? (
          filteredChannels.map((channel) => {
            const index = channelIndexById.get(channel.id) ?? 0;
            const chLabel = mode === "output" ? formatOutputCh(index) : formatInputCh(index);
            const rowActionsBusy = busyId === String(channel.id);
            const fieldsLocked = readOnly || channel.isEmpty;
            return (
              <li
                key={channel.id}
                data-tech-channel-row
                data-tech-channel-kind={channel.kind}
                data-channel-index={index}
                data-channel-id={channel.id}
                className={`tech-rider-strip ${mode === "output" ? "is-output" : ""} ${channelRowStateClass(channel, index)}`}
              >
                <ChannelDragHandle
                  label={chLabel}
                  dragEnabled={dragEnabled}
                  isDragging={draggingId === channel.id}
                  onPointerDown={(event) => onHandlePointerDown(event, channel, index)}
                />
                <label className="tech-rider-strip-field tech-rider-strip-source">
                  <span className="sr-only">
                    {mode === "output" ? t("tech.col.destination") : t("tech.mobile.source")}
                  </span>
                  {channel.isEmpty ? (
                    <span className="tech-rider-empty-badge">{t("tech.emptyBadge")}</span>
                  ) : (
                    <input
                      className="tech-rider-cell-input"
                      name={`tech-${channel.id}-label`}
                      autoComplete="off"
                      value={channel.label}
                      readOnly={fieldsLocked}
                      placeholder={mode === "output" ? "Mon 1" : "Kick"}
                      onChange={(e) => updateChannel(channel.id, channel.kind, { label: e.target.value })}
                      onBlur={() => flushSave(channel.id, channel.kind)}
                    />
                  )}
                </label>
                <label className="tech-rider-strip-field tech-rider-strip-gear">
                  <span className="sr-only">
                    {mode === "output" ? t("tech.mobile.destinationGear") : t("tech.mobile.inputGear")}
                  </span>
                  {mode === "output" ? (
                    <OutputGearSelect
                      value={channel.isEmpty ? "" : channel.gear}
                      disabled={fieldsLocked}
                      compact
                      onChange={(next) => {
                        updateChannel(channel.id, channel.kind, { gear: next });
                        flushSave(channel.id, channel.kind);
                      }}
                    />
                  ) : (
                    <input
                      className="tech-rider-cell-input"
                      name={`tech-${channel.id}-gear`}
                      autoComplete="off"
                      value={channel.isEmpty ? "" : channel.gear}
                      readOnly={fieldsLocked}
                      placeholder={channel.isEmpty ? "—" : "SM57"}
                      onChange={(e) => updateChannel(channel.id, channel.kind, { gear: e.target.value })}
                      onBlur={() => flushSave(channel.id, channel.kind)}
                    />
                  )}
                </label>
                {mode === "input" ? (
                  <label className="tech-rider-strip-field tech-rider-strip-hardware">
                    <span className="sr-only">{t("tech.col.hardware")}</span>
                    <HardwareSelect
                      value={channel.isEmpty ? "" : channel.hardware}
                      disabled={fieldsLocked}
                      compact
                      onChange={(next) => {
                        updateChannel(channel.id, channel.kind, { hardware: next });
                        flushSave(channel.id, channel.kind);
                      }}
                    />
                  </label>
                ) : null}
                <ChannelActionsMenu
                  channel={channel}
                  mode={mode}
                  readOnly={readOnly}
                  rowActionsBusy={rowActionsBusy}
                  showFlags={mode === "input"}
                  isOpen={menuChannelId === channel.id}
                  onOpen={() => setMenuChannelId(channel.id)}
                  onClose={() => setMenuChannelId(null)}
                  onEdit={() => openDrawer(channel)}
                  onToggleEmpty={() => toggleEmpty(channel)}
                  onToggleStereo={() => saveChannel(channel, { stereo: !channel.stereo })}
                  onDelete={() => removeChannel(channel)}
                />
              </li>
            );
          })
        ) : (
          <li className="tech-rider-strip tech-rider-strip-empty">
            {search.trim() ? t("tech.noSearch") : t("tech.noChannels")}
          </li>
        )}
      </ul>
      )}

      {readOnly ? null : (
        <button
          type="button"
          className="tech-rider-add-btn tech-rider-add-btn-bottom"
          disabled={busyId === "add" || !canAddChannel}
          title={
            !consoleIds.length
              ? t("tech.pickConsole")
              : atChannelLimit
                ? t("tech.channelLimit", { max: activeLimit })
                : t("tech.addChannel")
          }
          onClick={addChannel}
        >
          {busyId === "add" ? "…" : t("tech.addChannel")}
        </button>
      )}

      {drawerChannel && drawerDraft ? (
        <ChannelEditDrawer
          mode={mode}
          readOnly={readOnly}
          busy={busyId === "add"}
          draft={drawerDraft}
          chLabel={
            mode === "output"
              ? formatOutputCh(channels.findIndex((row) => row.id === drawerChannel.id))
              : formatInputCh(channels.findIndex((row) => row.id === drawerChannel.id))
          }
          onDraftChange={setDrawerDraft}
          onClose={closeDrawer}
          onSave={saveDrawer}
        />
      ) : null}

      {notesOpen ? (
        <RiderNotesModal
          value={notesDraft}
          readOnly={readOnly}
          busy={busyId === "notes"}
          onChange={setNotesDraft}
          onClose={closeNotes}
          onSave={saveNotes}
        />
      ) : null}

      <TechRiderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        inputs={inputs}
        outputs={outputs}
        notes={riderNotes}
      />
    </div>
  );
}

function RiderNotesModal({ value, readOnly, busy, onChange, onClose, onSave }) {
  const t = useT();
  return (
    <div className="tech-rider-drawer-backdrop" onClick={onClose}>
      <div
        className="tech-rider-drawer tech-rider-notes-modal"
        role="dialog"
        aria-label={t("tech.notesTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tech-rider-drawer-head">
          <h4>{t("tech.notesTitle")}</h4>
          <button type="button" className="tech-rider-icon-btn" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="tech-rider-drawer-body">
          <textarea
            id="tech-rider-notes"
            name="tech-rider-notes"
            className="tech-rider-notes-textarea"
            rows={10}
            value={value}
            readOnly={readOnly}
            placeholder={t("tech.notesPlaceholder")}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <footer className="tech-rider-drawer-foot">
          {readOnly ? (
            <button type="button" className="tech-rider-drawer-save" onClick={onClose}>
              {t("common.close")}
            </button>
          ) : (
            <button type="button" className="tech-rider-drawer-save" disabled={busy} onClick={onSave}>
              {busy ? "…" : t("common.save")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ConsoleMultiSelect({ groups, selectedIds, readOnly = false, onToggle }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const flatConsoles = useMemo(
    () => groups.flatMap((group) => group.consoles.map((item) => ({ ...item, maker: group.maker }))),
    [groups],
  );

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 14.5 * 16;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      setMenuPos({
        top: rect.bottom + 4,
        left,
        width,
      });
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target) && !event.target.closest?.(".tech-rider-console-select-menu")) {
        setOpen(false);
      }
    }

    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const summary = useMemo(() => {
    if (!selectedIds.length) return "—";
    const selected = new Set(selectedIds);
    return flatConsoles.find((item) => selected.has(item.id))?.model || "—";
  }, [flatConsoles, selectedIds]);

  const menu = open && menuPos ? (
    <div
      className="tech-rider-console-select-menu"
      role="listbox"
      aria-multiselectable="true"
      aria-label={t("tech.consolesAria")}
      style={{
        top: `${menuPos.top}px`,
        left: `${menuPos.left}px`,
        width: `${menuPos.width}px`,
      }}
    >
      {groups.map((group) => (
        <div key={group.maker} className="tech-rider-console-select-group">
          <div className="tech-rider-console-select-maker">{group.maker}</div>
          <div className="tech-rider-console-select-models">
            {group.consoles.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`tech-rider-console-select-item ${checked ? "is-checked" : ""}`}
                  onClick={() => onToggle(item.id)}
                >
                  <span className="tech-rider-console-check" aria-hidden="true">
                    {checked ? <ConsoleCheckIcon /> : null}
                  </span>
                  <span className="tech-rider-console-select-copy">
                    <strong>{item.model}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`tech-rider-console-select ${open ? "is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="tech-rider-console-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("tech.console")}
        disabled={readOnly}
        onClick={() => {
          if (readOnly) return;
          setOpen((current) => {
            const next = !current;
            if (next) {
              const rect = triggerRef.current?.getBoundingClientRect();
              if (rect) {
                const width = 14.5 * 16;
                const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
                setMenuPos({ top: rect.bottom + 4, left, width });
              }
            } else {
              setMenuPos(null);
            }
            return next;
          });
        }}
      >
        <span className="tech-rider-console-select-label">{t("tech.console")}</span>
        <span className={`tech-rider-console-select-value ${selectedIds.length ? "" : "is-placeholder"}`}>
          {summary}
        </span>
        <ConsoleSelectChevron />
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

function ConsoleSelectChevron() {
  return (
    <svg className="tech-rider-console-select-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
      <path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function ConsoleCheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.2 6.8 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function HardwareSelect({ value, disabled = false, compact = false, onChange }) {
  const t = useT();
  const current = String(value || "");
  const options = useMemo(() => {
    if (!current) return HARDWARE_BASE_OPTIONS;
    const items = [...HARDWARE_BASE_OPTIONS];
    if (!HARDWARE_PRESETS.includes(current)) {
      items.unshift({ id: current, label: current });
    }
    items.unshift({ id: "__clear__", label: t("field.clear"), variant: "clear" });
    return items;
  }, [current, t]);

  return (
    <FieldSelect
      label={t("tech.col.hardware")}
      value={current}
      options={options}
      placeholder=""
      disabled={disabled}
      portal
      portalAlign="end"
      className={`tech-rider-hardware-field ${compact ? "is-compact" : ""}`}
      listClassName="tech-rider-hardware-menu"
      onChange={(next) => onChange(next === "__clear__" ? "" : String(next ?? ""))}
    />
  );
}

function OutputGearSelect({ value, disabled = false, compact = false, onChange }) {
  const t = useT();
  const current = String(value || "");
  const options = useMemo(() => {
    if (!current) return OUTPUT_GEAR_BASE_OPTIONS;
    const items = [...OUTPUT_GEAR_BASE_OPTIONS];
    if (!OUTPUT_GEAR_PRESETS.includes(current)) {
      items.unshift({ id: current, label: current });
    }
    items.unshift({ id: "__clear__", label: t("field.clear"), variant: "clear" });
    return items;
  }, [current, t]);

  return (
    <FieldSelect
      label={t("tech.col.gear")}
      value={current}
      options={options}
      placeholder=""
      disabled={disabled}
      portal
      portalAlign="end"
      className={`tech-rider-hardware-field tech-rider-output-gear-field ${compact ? "is-compact" : ""}`}
      listClassName="tech-rider-hardware-menu"
      onChange={(next) => onChange(next === "__clear__" ? "" : String(next ?? ""))}
    />
  );
}

function GearPresetSelect({ mode, sourceLabel, value, disabled = false, onChange, name }) {
  const t = useT();
  const suggestion = useMemo(
    () => suggestGearForSource(sourceLabel, mode === "output" ? "output" : "input"),
    [sourceLabel, mode],
  );
  const current = String(value || "");
  const inSuggested =
    suggestion.options.includes(current) || current === suggestion.packValue;

  return (
    <select
      className="tech-rider-cell-input tech-rider-select"
      name={name || "tech-gear-preset"}
      value={current}
      disabled={disabled}
      aria-label={t("tech.col.gear")}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t("tech.col.gear")}</option>
      <optgroup label={suggestion.groupLabel}>
        {suggestion.options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        <option value={suggestion.packValue}>{suggestion.packValue}</option>
      </optgroup>
      {current && !inSuggested ? <option value={current}>{current}</option> : null}
    </select>
  );
}

function ChannelEditDrawer({
  mode,
  readOnly,
  busy,
  draft,
  chLabel,
  onDraftChange,
  onClose,
  onSave,
}) {
  const t = useT();
  const patchHidden = Boolean(draft.isEmpty);

  return (
    <div className="tech-rider-drawer-backdrop" onClick={onClose}>
      <div
        className={`tech-rider-drawer ${draft.isEmpty ? "is-empty" : ""}`}
        role="dialog"
        aria-label={t("tech.drawer.editAria", { ch: chLabel })}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tech-rider-drawer-handle" aria-hidden="true" />
        <header className="tech-rider-drawer-head">
          <div className="tech-rider-drawer-title-block">
            <span className="tech-rider-drawer-ch">{chLabel}</span>
            <h4>{mode === "output" ? t("tech.drawer.output") : t("tech.drawer.channel")}</h4>
          </div>
          <button type="button" className="tech-rider-icon-btn" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tech-rider-drawer-body">
          <section className="tech-rider-drawer-card">
            <div className="tech-rider-drawer-card-head">
              <span className="tech-rider-drawer-label">
                {mode === "output" ? t("tech.drawer.destination") : t("tech.drawer.source")}
              </span>
              <ToggleButton
                label={t("tech.col.empty")}
                active={Boolean(draft.isEmpty)}
                tone="empty"
                compact
                disabled={readOnly}
                onClick={() =>
                  onDraftChange((current) => ({
                    ...current,
                    ...emptyChannelPatch(!current.isEmpty),
                  }))
                }
              />
            </div>
            <input
              className="tech-rider-drawer-input"
              name={`tech-drawer-${draft.id}-label`}
              autoComplete="off"
              value={draft.isEmpty ? "" : draft.label}
              disabled={draft.isEmpty || readOnly}
              placeholder={mode === "output" ? "Mon 1" : "Kick"}
              onChange={(e) => onDraftChange((current) => ({ ...current, label: e.target.value }))}
            />
          </section>

          {patchHidden ? null : (
            <>
              {mode === "output" ? (
                <section className="tech-rider-drawer-card">
                  <div className="tech-rider-drawer-flags">
                    <ToggleButton
                      label={t("tech.col.stereo")}
                      active={Boolean(draft.stereo)}
                      tone="output"
                      compact
                      disabled={readOnly}
                      onClick={() =>
                        onDraftChange((current) => ({
                          ...current,
                          stereo: !current.stereo,
                        }))
                      }
                    />
                    <input
                      className="tech-rider-drawer-input tech-rider-level-input"
                      name={`tech-drawer-${draft.id}-level`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={draft.levelDb ?? ""}
                      disabled={readOnly}
                      placeholder="dB"
                      aria-label={t("tech.drawer.levelAria")}
                      onChange={(e) =>
                        onDraftChange((current) => ({ ...current, levelDb: e.target.value }))
                      }
                    />
                  </div>
                </section>
              ) : null}

              <section className="tech-rider-drawer-card">
                <span className="tech-rider-drawer-label">{t("tech.drawer.gear")}</span>
                {mode === "output" ? (
                  <OutputGearSelect
                    value={draft.gear}
                    disabled={readOnly}
                    onChange={(next) => onDraftChange((current) => ({ ...current, gear: next }))}
                  />
                ) : (
                  <>
                    <GearPresetSelect
                      mode={mode}
                      sourceLabel={draft.label}
                      value={draft.gear}
                      disabled={readOnly}
                      name={`tech-drawer-${draft.id}-gear-preset`}
                      onChange={(next) => onDraftChange((current) => ({ ...current, gear: next }))}
                    />
                    <input
                      className="tech-rider-drawer-input"
                      name={`tech-drawer-${draft.id}-gear`}
                      autoComplete="off"
                      value={draft.gear}
                      disabled={readOnly}
                      onChange={(e) => onDraftChange((current) => ({ ...current, gear: e.target.value }))}
                    />
                  </>
                )}
              </section>

              {mode === "input" ? (
                <section className="tech-rider-drawer-card">
                  <span className="tech-rider-drawer-label">{t("tech.drawer.hardware")}</span>
                  <HardwareSelect
                    value={draft.hardware}
                    disabled={readOnly}
                    onChange={(next) => onDraftChange((current) => ({ ...current, hardware: next }))}
                  />
                </section>
              ) : null}
            </>
          )}
        </div>

        <footer className="tech-rider-drawer-foot">
          <button type="button" className="tech-rider-drawer-save" disabled={busy || readOnly} onClick={onSave}>
            {t("common.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ChannelDragHandle({ label, dragEnabled, isDragging, onPointerDown }) {
  return (
    <span
      className={`tech-rider-ch tech-rider-drag-handle ${dragEnabled ? "is-draggable" : ""} ${isDragging ? "is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      role={dragEnabled ? "button" : undefined}
      aria-grabbed={isDragging || undefined}
      aria-label={dragEnabled ? `CH ${label}` : undefined}
    >
      {label}
    </span>
  );
}

function ChannelActionsMenu({
  channel,
  mode,
  readOnly,
  rowActionsBusy,
  isOpen,
  onOpen,
  onClose,
  onEdit,
  onToggleEmpty,
  onToggleStereo,
  onDelete,
  showFlags = true,
  showDelete = true,
  compact = false,
}) {
  const t = useT();
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const menuActive =
    showFlags && (channel.isEmpty || (mode === "output" && channel.stereo));

  return (
    <div className={`tech-rider-strip-menu-wrap ${compact ? "is-compact" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`tech-rider-strip-menu-btn ${menuActive ? "has-active" : ""} ${channel.isEmpty ? "is-empty" : ""} ${isOpen ? "is-open" : ""}`}
        aria-label={t("tech.channelOptions")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={rowActionsBusy}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        <VerticalDotsIcon />
      </button>
      {isOpen ? (
        <div className="tech-rider-strip-menu" role="menu" aria-label={t("tech.channelOptions")}>
          {showFlags ? (
            <>
              <button
                type="button"
                role="menuitemcheckbox"
                className={`tech-rider-strip-menu-item ${channel.isEmpty ? "is-on is-empty" : ""}`}
                aria-checked={Boolean(channel.isEmpty)}
                disabled={readOnly}
                onClick={() => {
                  onToggleEmpty();
                  onClose();
                }}
              >
                {t("tech.col.empty")}
              </button>
              {mode === "output" ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`tech-rider-strip-menu-item ${channel.stereo ? "is-on is-output" : ""}`}
                  aria-checked={channel.stereo}
                  disabled={readOnly || channel.isEmpty}
                  onClick={onToggleStereo}
                >
                  {t("tech.col.stereo")}
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="tech-rider-strip-menu-item"
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            {t("tech.editChannel")}
          </button>
          {readOnly || !showDelete ? null : (
            <button
              type="button"
              role="menuitem"
              className="tech-rider-strip-menu-item is-danger"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              {t("tech.deleteChannel")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function VerticalDotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.85" />
      <circle cx="12" cy="12" r="1.85" />
      <circle cx="12" cy="19" r="1.85" />
    </svg>
  );
}

function ToggleButton({ label, active, tone = "phantom", compact = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      className={`tech-rider-toggle is-${tone} ${active ? "is-on" : ""} ${compact ? "is-compact" : ""}`}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tech-rider-toggle-led" aria-hidden="true" />
      <span className="tech-rider-toggle-label">{label}</span>
    </button>
  );
}
