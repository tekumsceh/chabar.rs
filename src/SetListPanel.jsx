import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { useT } from "./i18n/I18nProvider.jsx";

const SECTION_IDS = ["main", "encore", "alts"];

function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTotalDuration(sec) {
  if (!sec) return "—";
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}:${String(remMin).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatItemNumber(section, index) {
  if (section === "encore") return `E${index + 1}`;
  if (section === "alts") return `A${index + 1}`;
  return String(index + 1).padStart(2, "0");
}

function emptySections() {
  return { main: [], encore: [], alts: [] };
}

/** Web pages put structure in HTML; plain-text clipboard often collapses to one line. */
function plainTextFromHtml(html) {
  const normalized = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/tr>/gi, "\n");

  const container = document.createElement("div");
  container.innerHTML = normalized;

  return (container.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const current = textarea.value;
  const next = current.slice(0, start) + text + current.slice(end);
  const cursor = start + text.length;
  return { next, cursor };
}

/** Heuristic for one-line lyric pastes: new line before Capital after lowercase. */
function splitLyricsByCapitals(text) {
  const lower = "a-zà-žčćšđ";
  const upper = "A-ZÀ-ŽČĆŠĐ";
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(new RegExp(`([${lower}])(?=[${upper}][${lower}])`, "g"), "$1\n"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function SetListPanel({ eventId, bandId, readOnly = false, showToast }) {
  const t = useT();
  const [mode, setMode] = useState("main");
  const [sections, setSections] = useState(emptySections);
  const [songs, setSongs] = useState([]);
  const [stats, setStats] = useState({
    totalSongs: 0,
    mainCount: 0,
    encoreCount: 0,
    altsCount: 0,
    totalDurationSec: 0,
  });
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(Boolean(eventId && bandId));
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addArtist, setAddArtist] = useState("");
  const [communityResults, setCommunityResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const lookupTimerRef = useRef(null);
  const lookupAbortRef = useRef(null);
  const lastLookupKeyRef = useRef("");
  const [drawerItem, setDrawerItem] = useState(null);
  const [drawerDraft, setDrawerDraft] = useState(null);
  const [updateLibrary, setUpdateLibrary] = useState(false);
  const [splitByCapitalsTest, setSplitByCapitalsTest] = useState(false);

  const editable = canEdit && !readOnly;
  const items = sections[mode] || [];

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.title, item.songKey, item.notes].join(" ").toLowerCase().includes(q),
    );
  }, [items, search]);

  const bandLookupResults = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const list = Array.isArray(songs) ? songs : [];
    if (!q) return list.slice(0, 8);
    return list
      .filter((song) => song.title?.toLowerCase().includes(q) || song.songKey?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [songs, addQuery]);

  useEffect(() => {
    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
      lookupAbortRef.current?.abort();
    };
  }, []);

  async function runCommunityLookup({ force = false } = {}) {
    if (!editable || !addOpen) return;

    const query = addQuery.trim();
    if (query.length < 3) {
      setCommunityResults([]);
      setLookupError(t("setlist.searchMinChars"));
      return;
    }

    const lookupKey = `${query.toLowerCase()}|${addArtist.trim().toLowerCase()}`;
    if (!force && lookupKey === lastLookupKeyRef.current) return;

    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setLookupLoading(true);
    setLookupError("");
    try {
      const params = new URLSearchParams({ track: query });
      if (addArtist.trim()) params.set("artist", addArtist.trim());
      const data = await api(`/api/lyrics/search?${params}`, { signal: controller.signal });

      if (controller.signal.aborted) return;

      lastLookupKeyRef.current = lookupKey;
      setCommunityResults(Array.isArray(data.results) ? data.results : []);
      if (data.rateLimited) {
        setLookupError(data.message || t("setlist.rateLimited"));
      } else if (data.message && !(data.results || []).length) {
        setLookupError(data.message);
      } else {
        setLookupError("");
      }
    } catch (requestError) {
      if (requestError.name === "AbortError") return;
      setCommunityResults([]);
      setLookupError(requestError.message || t("setlist.onlineSearchFail"));
    } finally {
      if (!controller.signal.aborted) {
        setLookupLoading(false);
      }
    }
  }

  function scheduleCommunityLookup() {
    if (!addOpen || !editable) return;
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(() => {
      runCommunityLookup();
    }, 900);
  }

  function applyBundle(data) {
    setSections({
      main: Array.isArray(data.sections?.main) ? data.sections.main : [],
      encore: Array.isArray(data.sections?.encore) ? data.sections.encore : [],
      alts: Array.isArray(data.sections?.alts) ? data.sections.alts : [],
    });
    setSongs(Array.isArray(data.songs) ? data.songs : []);
    setStats(
      data.stats || {
        totalSongs: 0,
        mainCount: 0,
        encoreCount: 0,
        altsCount: 0,
        totalDurationSec: 0,
      },
    );
    if (typeof data.canEdit === "boolean") {
      setCanEdit(data.canEdit);
    }
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
      setLoading(true);
      setError("");
      try {
        const data = await api(`/api/events/${eventId}/setlist`, { bandId });
        if (cancelled) return;
        applyBundle(data);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || t("setlist.loadFail"));
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

  function recomputeStats(nextSections) {
    const all = [...nextSections.main, ...nextSections.encore, ...nextSections.alts];
    return {
      totalSongs: all.length,
      mainCount: nextSections.main.length,
      encoreCount: nextSections.encore.length,
      altsCount: nextSections.alts.length,
      totalDurationSec: all.reduce((sum, item) => sum + (item.durationSec || 0), 0),
    };
  }

  function updateItemInSections(updated) {
    setSections((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        next[key] = next[key].map((item) => (item.id === updated.id ? updated : item));
      }
      setStats(recomputeStats(next));
      return next;
    });
  }

  async function addItemFromBand(songId) {
    if (!editable || !eventId || !bandId || !songId) return;
    setBusyId("add");
    try {
      const created = await api(`/api/events/${eventId}/setlist/items`, {
        method: "POST",
        bandId,
        body: { section: mode, songId },
      });
      setSections((current) => {
        const next = {
          ...current,
          [mode]: [...(current[mode] || []), created],
        };
        setStats(recomputeStats(next));
        return next;
      });
      resetAddForm();
      showToast?.(t("setlist.addedFromLibrary"));
    } catch (requestError) {
      showToast?.(requestError.message || t("setlist.addFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  async function addItemManual(titleOverride = "") {
    if (!editable || !eventId || !bandId) return;
    const title = (titleOverride || addQuery).trim();
    if (!title) {
      showToast?.(t("setlist.titleRequired"), "error");
      return;
    }
    setBusyId("add");
    try {
      const created = await api(`/api/events/${eventId}/setlist/items`, {
        method: "POST",
        bandId,
        body: { section: mode, title },
      });
      setSections((current) => {
        const next = {
          ...current,
          [mode]: [...(current[mode] || []), created],
        };
        setStats(recomputeStats(next));
        return next;
      });
      if (created.songId) {
        setSongs((current) => {
          if (current.some((song) => song.id === created.songId)) return current;
          return [
            ...current,
            {
              id: created.songId,
              title: created.title,
              songKey: created.songKey,
              lyrics: created.lyrics,
              durationSec: created.durationSec,
            },
          ];
        });
      }
      resetAddForm();
      showToast?.(t("setlist.createdManual"));
    } catch (requestError) {
      showToast?.(requestError.message || t("setlist.addFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  async function importCommunityMatch(match) {
    if (!editable || !eventId || !bandId || !match?.id) return;
    setBusyId("add");
    try {
      const full = await api(`/api/lyrics/community/${match.id}`);
      const title = full.trackName || match.trackName || addQuery.trim();
      if (!title) {
        showToast?.(t("setlist.titleMissing"), "error");
        return;
      }
      const created = await api(`/api/events/${eventId}/setlist/items`, {
        method: "POST",
        bandId,
        body: {
          section: mode,
          title,
          lyrics: full.plainLyrics || "",
          durationSec: full.durationSec,
          notes: full.artistName ? `Izvođač: ${full.artistName}` : "",
        },
      });
      setSections((current) => {
        const next = {
          ...current,
          [mode]: [...(current[mode] || []), created],
        };
        setStats(recomputeStats(next));
        return next;
      });
      if (created.songId) {
        setSongs((current) => {
          if (current.some((song) => song.id === created.songId)) return current;
          return [
            ...current,
            {
              id: created.songId,
              title: created.title,
              songKey: created.songKey,
              lyrics: created.lyrics,
              durationSec: created.durationSec,
            },
          ];
        });
      }
      resetAddForm();
      showToast?.(t("setlist.importedWithLyrics"));
    } catch (requestError) {
      showToast?.(requestError.message || t("setlist.importFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  function resetAddForm() {
    setAddOpen(false);
    setAddQuery("");
    setAddArtist("");
    setCommunityResults([]);
    setLookupError("");
    setLookupLoading(false);
    lastLookupKeyRef.current = "";
    lookupAbortRef.current?.abort();
  }

  async function removeItem(item) {
    if (!editable || !eventId || !bandId) return;
    setBusyId(String(item.id));
    try {
      await api(`/api/events/${eventId}/setlist/items/${item.id}`, {
        method: "DELETE",
        bandId,
      });
      setSections((current) => {
        const next = {
          ...current,
          [item.section]: current[item.section].filter((row) => row.id !== item.id),
        };
        setStats(recomputeStats(next));
        return next;
      });
      showToast?.(t("setlist.deleted"));
    } catch (requestError) {
      showToast?.(requestError.message || t("setlist.deleteFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  async function moveItem(item, direction) {
    if (!editable || !eventId || !bandId) return;
    const list = sections[item.section] || [];
    const index = list.findIndex((row) => row.id === item.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;

    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setBusyId(String(item.id));
    setSections((current) => ({
      ...current,
      [item.section]: reordered,
    }));
    try {
      const data = await api(`/api/events/${eventId}/setlist/reorder`, {
        method: "PUT",
        bandId,
        body: { section: item.section, orderedIds: reordered.map((row) => row.id) },
      });
      applyBundle(data);
    } catch (requestError) {
      showToast?.(requestError.message || t("setlist.reorderFail"), "error");
      const data = await api(`/api/events/${eventId}/setlist`, { bandId });
      applyBundle(data);
    } finally {
      setBusyId("");
    }
  }

  function openDrawer(item) {
    setDrawerItem(item);
    setDrawerDraft({
      title: item.title || "",
      songKey: item.songKey || "",
      durationSec: item.durationSec ?? "",
      lyrics: item.lyrics || "",
      notes: item.notes || "",
    });
    setUpdateLibrary(false);
    setSplitByCapitalsTest(false);
  }

  function closeDrawer() {
    setDrawerItem(null);
    setDrawerDraft(null);
    setUpdateLibrary(false);
    setSplitByCapitalsTest(false);
  }

  function applyCapitalSplit() {
    if (!drawerDraft) return;
    setDrawerDraft((current) => ({
      ...current,
      lyrics: splitLyricsByCapitals(current.lyrics),
    }));
  }

  function handleLyricsPaste(event) {
    if (!editable) return;

    const html = event.clipboardData?.getData("text/html") || "";
    const plain = (event.clipboardData?.getData("text/plain") || "").replace(/\r\n/g, "\n");

    let converted = html ? plainTextFromHtml(html) : plain;
    const usedHtml = Boolean(html && converted.trim() && converted.trim() !== plain.trim());

    if (splitByCapitalsTest) {
      converted = splitLyricsByCapitals(converted);
    }

    if (!usedHtml && !splitByCapitalsTest) return;
    if (converted === plain) return;

    event.preventDefault();
    const { next, cursor } = insertTextAtCursor(event.currentTarget, converted);
    setDrawerDraft((current) => ({ ...current, lyrics: next }));
    requestAnimationFrame(() => {
      event.currentTarget.setSelectionRange(cursor, cursor);
    });
  }

  async function saveDrawer() {
    if (!drawerItem || !drawerDraft || !editable || !eventId || !bandId) return;
    const title = drawerDraft.title.trim();
    if (!title) {
      showToast?.(t("setlist.titleRequiredSave"), "error");
      return;
    }
    setBusyId(String(drawerItem.id));
    try {
      const updated = await api(`/api/events/${eventId}/setlist/items/${drawerItem.id}`, {
        method: "PUT",
        bandId,
        body: {
          title,
          songKey: drawerDraft.songKey,
          lyrics: drawerDraft.lyrics,
          durationSec: drawerDraft.durationSec === "" ? null : drawerDraft.durationSec,
          notes: drawerDraft.notes,
          updateLibrary: updateLibrary && Boolean(drawerItem.songId),
        },
      });
      updateItemInSections(updated);
      if (updateLibrary && drawerItem.songId) {
        setSongs((current) =>
          current.map((song) =>
            song.id === drawerItem.songId
              ? {
                  ...song,
                  title: updated.title,
                  songKey: updated.songKey,
                  lyrics: updated.lyrics,
                  durationSec: updated.durationSec,
                }
              : song,
          ),
        );
      }
      closeDrawer();
      showToast?.(t("setlist.saved"));
    } catch (requestError) {
      showToast?.(requestError.message || t("setlist.saveSongFail"), "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <p className="tech-rider-status">{t("setlist.loading")}</p>;
  }

  if (error) {
    return <p className="tech-rider-status is-error">{error}</p>;
  }

  return (
    <div className="tech-rider event-rack is-lime setlist-panel">
      <header className="tech-rider-head">
        <div>
          <p className="tech-rider-eyebrow">Chabar show</p>
          <h3 className="tech-rider-title">{t("setlist.title")}</h3>
        </div>
        {editable ? (
          <button
            type="button"
            className="tech-rider-add-btn"
            disabled={busyId === "add"}
            onClick={() => setAddOpen((open) => !open)}
          >
            {busyId === "add" ? "…" : `+ ${t("setlist.addSong")}`}
          </button>
        ) : null}
      </header>

      <div className="tech-rider-stats event-rack-stats" aria-label={t("setlist.title")}>
        <span>
          {t("setlist.stats.songs")}: <strong>{stats.totalSongs}</strong>
        </span>
        <span>
          {t("setlist.stats.runtime")}: <strong>{formatTotalDuration(stats.totalDurationSec)}</strong>
        </span>
        <span>
          {t("setlist.stats.encore")}: <strong>{stats.encoreCount}</strong>
        </span>
      </div>

      <div className="tech-rider-mode" role="tablist" aria-label={t("setlist.sectionsAria")}>
        {SECTION_IDS.map((sectionId) => (
          <button
            key={sectionId}
            type="button"
            role="tab"
            className={`tech-rider-mode-btn is-input ${mode === sectionId ? "is-active" : ""}`}
            aria-selected={mode === sectionId}
            onClick={() => setMode(sectionId)}
          >
            {t(`setlist.${sectionId}`)} ({stats[`${sectionId}Count`] ?? 0})
          </button>
        ))}
      </div>

      {editable && addOpen ? (
        <div className="setlist-lookup">
          <div className="setlist-add-bar">
            <label className="setlist-add-field setlist-add-field-grow">
              <span className="sr-only">{t("setlist.songTitle")}</span>
              <input
                id="setlist-add-title"
                name="setlist-add-title"
                type="search"
                autoComplete="off"
                autoFocus
                placeholder={t("setlist.songTitlePlaceholder")}
                value={addQuery}
                onChange={(e) => {
                  setAddQuery(e.target.value);
                  scheduleCommunityLookup();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (bandLookupResults.length === 1) {
                      addItemFromBand(bandLookupResults[0].id);
                    } else {
                      runCommunityLookup({ force: true });
                    }
                  }
                }}
              />
            </label>
            <label className="setlist-add-field">
              <span className="sr-only">{t("setlist.artistOptional")}</span>
              <input
                id="setlist-add-artist"
                name="setlist-add-artist"
                type="text"
                autoComplete="off"
                placeholder={t("setlist.artist")}
                value={addArtist}
                onChange={(e) => setAddArtist(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runCommunityLookup({ force: true });
                }}
              />
            </label>
            <button
              type="button"
              className="setlist-add-submit"
              disabled={busyId === "add" || lookupLoading || addQuery.trim().length < 3}
              onClick={() => runCommunityLookup({ force: true })}
            >
              {lookupLoading ? "…" : t("setlist.searchOnline")}
            </button>
            <button type="button" className="setlist-add-cancel" onClick={resetAddForm} aria-label={t("common.close")}>
              ×
            </button>
          </div>

          <div className="setlist-lookup-results" aria-live="polite">
            {bandLookupResults.length ? (
              <section className="setlist-lookup-group">
                <h4>{t("setlist.yourLibrary")}</h4>
                <ul>
                  {bandLookupResults.map((song) => (
                    <li key={song.id}>
                      <button
                        type="button"
                        className="setlist-lookup-item"
                        disabled={busyId === "add"}
                        onClick={() => addItemFromBand(song.id)}
                      >
                        <strong>{song.title || t("setlist.noTitle")}</strong>
                        <span>
                          {song.songKey || "—"} · {song.lyrics?.trim() ? t("setlist.hasLyrics") : t("setlist.noLyrics")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {addQuery.trim().length >= 3 ? (
              <section className="setlist-lookup-group">
                <h4>{t("setlist.onlineSearch")}</h4>
                <p className="setlist-lookup-note">{t("setlist.onlineSearchNote")}</p>
                {lookupLoading ? <p className="setlist-lookup-status">{t("setlist.searching")}</p> : null}
                {lookupError ? <p className="setlist-lookup-status is-error">{lookupError}</p> : null}
                {!lookupLoading && !lookupError && communityResults.length ? (
                  <ul>
                    {communityResults.map((match) => (
                      <li key={match.id}>
                        <button
                          type="button"
                          className="setlist-lookup-item"
                          disabled={busyId === "add" || !match.hasLyrics}
                          onClick={() => importCommunityMatch(match)}
                        >
                          <strong>{match.trackName || t("setlist.noTitle")}</strong>
                          <span>
                            {match.artistName || t("setlist.unknownArtist")}
                            {match.durationSec ? ` · ${formatDuration(match.durationSec)}` : ""}
                            {match.hasLyrics ? ` · ${t("setlist.importLyrics")}` : ` · ${t("setlist.instrumental")}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!lookupLoading && !lookupError && !communityResults.length ? (
                  <p className="setlist-lookup-status">{t("setlist.noOnlineResults")}</p>
                ) : null}
              </section>
            ) : null}

            <div className="setlist-lookup-fallback">
              <button
                type="button"
                className="setlist-split-btn"
                disabled={busyId === "add" || !addQuery.trim()}
                onClick={() => addItemManual()}
              >
                {t("setlist.createEmptySong")}
              </button>
              <span className="setlist-lookup-note">{t("setlist.createEmptyHint")}</span>
            </div>
          </div>
        </div>
      ) : null}

      <label className="tech-rider-search">
        <span className="sr-only">{t("setlist.searchSongs")}</span>
        <input
          id="setlist-search"
          name="setlist-search"
          type="search"
          autoComplete="off"
          placeholder={t("setlist.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {readOnly ? (
        <p className="tech-rider-locknote">{t("setlist.locknote")}</p>
      ) : !canEdit ? (
        <p className="tech-rider-locknote">{t("setlist.noEdit")}</p>
      ) : null}

      <div className="tech-rider-desktop event-rack-table-wrap">
        <table className="tech-rider-table">
          <thead>
            <tr>
              <th>{t("setlist.col.num")}</th>
              <th>{t("setlist.col.song")}</th>
              <th>{t("setlist.key")}</th>
              <th>{t("setlist.col.time")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {filteredItems.length ? (
              filteredItems.map((item) => {
                const index = items.findIndex((row) => row.id === item.id);
                const rowBusy = busyId === String(item.id);
                return (
                  <tr key={item.id}>
                    <td className="tech-rider-ch">{formatItemNumber(mode, index)}</td>
                    <td>
                      <button
                        type="button"
                        className="setlist-title-btn"
                        onClick={() => openDrawer(item)}
                        title={item.notes || t("setlist.openDetails")}
                      >
                        {item.title || t("setlist.noTitle")}
                      </button>
                    </td>
                    <td>
                      <span className="event-rack-cell">{item.songKey || "—"}</span>
                    </td>
                    <td>
                      <span className="event-rack-cell">{formatDuration(item.durationSec)}</span>
                    </td>
                    <td className="tech-rider-actions">
                      {editable ? (
                        <>
                          <button
                            type="button"
                            className="tech-rider-icon-btn"
                            aria-label={t("setlist.lyricsAria")}
                            title={t("setlist.lyricsAria")}
                            disabled={rowBusy}
                            onClick={() => openDrawer(item)}
                          >
                            <LyricsIcon />
                          </button>
                          <button
                            type="button"
                            className="tech-rider-icon-btn"
                            aria-label={t("setlist.moveUp")}
                            disabled={rowBusy || index === 0}
                            onClick={() => moveItem(item, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="tech-rider-icon-btn"
                            aria-label={t("setlist.moveDown")}
                            disabled={rowBusy || index === items.length - 1}
                            onClick={() => moveItem(item, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="tech-rider-icon-btn tech-rider-icon-btn-danger"
                            aria-label={t("setlist.removeSong")}
                            disabled={rowBusy}
                            onClick={() => removeItem(item)}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="tech-rider-icon-btn"
                          aria-label={t("setlist.lyricsAria")}
                          title={t("setlist.lyricsAria")}
                          onClick={() => openDrawer(item)}
                        >
                          <LyricsIcon />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="tech-rider-empty-row">
                  {search.trim() ? t("search.noResults") : t("setlist.emptySection")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="tech-rider-mobile event-rack-mobile">
        {filteredItems.length ? (
          filteredItems.map((item) => {
            const index = items.findIndex((row) => row.id === item.id);
            const rowBusy = busyId === String(item.id);
            return (
              <li key={item.id} className="tech-rider-card">
                <div className="tech-rider-card-head">
                  <span className="tech-rider-ch">{formatItemNumber(mode, index)}</span>
                  <strong>{item.title || t("setlist.noTitle")}</strong>
                </div>
                <dl className="tech-rider-card-meta">
                  <div>
                    <dt>{t("setlist.key")}</dt>
                    <dd>{item.songKey || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("setlist.col.time")}</dt>
                    <dd>{formatDuration(item.durationSec)}</dd>
                  </div>
                </dl>
                <div className="tech-rider-card-actions">
                  <button type="button" disabled={rowBusy} onClick={() => openDrawer(item)}>
                    {t("setlist.lyricsBtn")}
                  </button>
                  {editable ? (
                    <>
                      <button type="button" disabled={rowBusy || index === 0} onClick={() => moveItem(item, -1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={rowBusy || index === items.length - 1}
                        onClick={() => moveItem(item, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        disabled={rowBusy}
                        onClick={() => removeItem(item)}
                        aria-label={t("setlist.removeSong")}
                      >
                        ×
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })
        ) : (
          <li className="tech-rider-card tech-rider-card-empty">
            {search.trim() ? t("search.noResults") : t("setlist.emptySection")}
          </li>
        )}
      </ul>

      {drawerItem && drawerDraft ? (
        <div className="tech-rider-drawer-backdrop" onClick={closeDrawer}>
          <div
            className="tech-rider-drawer setlist-drawer"
            role="dialog"
            aria-label={t("setlist.songDialog", { title: drawerDraft.title || "" })}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tech-rider-drawer-head">
              <h4>{drawerDraft.title || t("setlist.songDefault")}</h4>
              <button type="button" className="tech-rider-icon-btn" aria-label={t("common.close")} onClick={closeDrawer}>
                ×
              </button>
            </header>

            <label className="tech-rider-drawer-field">
              {t("setlist.titleField")}
              <input
                id={`setlist-${drawerItem.id}-title`}
                name={`setlist-${drawerItem.id}-title`}
                autoComplete="off"
                value={drawerDraft.title}
                readOnly={!editable}
                onChange={(e) => setDrawerDraft((current) => ({ ...current, title: e.target.value }))}
              />
            </label>

            <label className="tech-rider-drawer-field">
              {t("setlist.tonality")}
              <input
                id={`setlist-${drawerItem.id}-key`}
                name={`setlist-${drawerItem.id}-key`}
                autoComplete="off"
                value={drawerDraft.songKey}
                readOnly={!editable}
                placeholder="Am, G, …"
                onChange={(e) => setDrawerDraft((current) => ({ ...current, songKey: e.target.value }))}
              />
            </label>

            <label className="tech-rider-drawer-field">
              {t("setlist.duration")}
              <input
                id={`setlist-${drawerItem.id}-duration`}
                name={`setlist-${drawerItem.id}-duration`}
                type="number"
                min="0"
                autoComplete="off"
                value={drawerDraft.durationSec}
                readOnly={!editable}
                placeholder="240"
                onChange={(e) => setDrawerDraft((current) => ({ ...current, durationSec: e.target.value }))}
              />
            </label>

            <label className="tech-rider-drawer-field">
              {t("setlist.notes")}
              <input
                id={`setlist-${drawerItem.id}-notes`}
                name={`setlist-${drawerItem.id}-notes`}
                autoComplete="off"
                value={drawerDraft.notes}
                readOnly={!editable}
                placeholder={t("setlist.notesPlaceholder")}
                onChange={(e) => setDrawerDraft((current) => ({ ...current, notes: e.target.value }))}
              />
            </label>

            <div className="setlist-lyrics-head">
              <span className="tech-rider-drawer-label">{t("setlist.lyrics")}</span>
              {editable ? (
                <div className="setlist-lyrics-tools">
                  <label className="setlist-capital-test">
                    <input
                      id={`setlist-${drawerItem.id}-split-capitals`}
                      name={`setlist-${drawerItem.id}-split-capitals`}
                      type="checkbox"
                      checked={splitByCapitalsTest}
                      onChange={(e) => setSplitByCapitalsTest(e.target.checked)}
                    />
                    {t("setlist.splitCapitals")}
                  </label>
                  <button
                    type="button"
                    className="setlist-split-btn"
                    title={t("setlist.capitalSplitTitle")}
                    onClick={applyCapitalSplit}
                  >
                    {t("setlist.splitNow")}
                  </button>
                </div>
              ) : null}
            </div>
            <textarea
              id={`setlist-${drawerItem.id}-lyrics`}
              name={`setlist-${drawerItem.id}-lyrics`}
              className="setlist-lyrics-input"
              rows={10}
              autoComplete="off"
              value={drawerDraft.lyrics}
              readOnly={!editable}
              placeholder={t("setlist.lyricsPlaceholder")}
              onChange={(e) => setDrawerDraft((current) => ({ ...current, lyrics: e.target.value }))}
              onPaste={handleLyricsPaste}
            />

            {editable && drawerItem.songId ? (
              <label className="setlist-library-sync">
                <input
                  id={`setlist-${drawerItem.id}-update-library`}
                  name={`setlist-${drawerItem.id}-update-library`}
                  type="checkbox"
                  checked={updateLibrary}
                  onChange={(e) => setUpdateLibrary(e.target.checked)}
                />
                {t("setlist.updateLibrary")}
              </label>
            ) : null}

            <div className="setlist-drawer-actions">
              {editable ? (
                <button
                  type="button"
                  className="tech-rider-drawer-save"
                  disabled={busyId === String(drawerItem.id)}
                  onClick={saveDrawer}
                >
                  {t("common.save")}
                </button>
              ) : null}
              <button type="button" className="setlist-drawer-close" onClick={closeDrawer}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LyricsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 10h12M4 14h14M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
