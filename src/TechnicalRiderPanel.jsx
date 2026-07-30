import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import { MIXING_CONSOLE_GROUPS } from "./mixingConsoles.js";
import { reorderArray, useTechChannelDrag } from "./useTechChannelDrag.js";
import {
  emptyTechChannel,
  HARDWARE_PRESETS,
  suggestGearForSource,
} from "./techRiderPresets.js";

const SAVE_DEBOUNCE_MS = 700;

function formatInputCh(index) {
  return String(index + 1).padStart(2, "0");
}

function formatOutputCh(index) {
  return `A${index + 1}`;
}

function channelSnapshot(row) {
  return {
    kind: row.kind,
    label: row.label ?? "",
    gear: row.gear ?? "",
    cable: row.cable ?? "",
    hardware: row.hardware ?? "",
    phantom48v: Boolean(row.phantom48v),
    pad: Boolean(row.pad),
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
    left.phantom48v === right.phantom48v &&
    left.pad === right.pad &&
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

export default function TechnicalRiderPanel({ eventId, bandId, readOnly = false, showToast }) {
  const [mode, setMode] = useState("input");
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [stats, setStats] = useState({ inputCount: 0, outputCount: 0, phantom48vActive: 0 });
  const [consoleIds, setConsoleIds] = useState([]);
  const [limits, setLimits] = useState({ inputMax: 0, outputMax: 0 });
  const [loading, setLoading] = useState(Boolean(eventId && bandId));
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [drawerChannel, setDrawerChannel] = useState(null);
  const [drawerDraft, setDrawerDraft] = useState(null);
  const [mobileMenuChannelId, setMobileMenuChannelId] = useState(null);

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
        showToast?.(requestError.message || "Redosled nije sačuvan", "error");
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
    [readOnly, eventId, bandId, mode, showToast],
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
        const data = await api(`/api/events/${eventId}/tech-rider`, { bandId });
        if (cancelled) return;
        const nextInputs = Array.isArray(data.inputs) ? data.inputs : [];
        const nextOutputs = Array.isArray(data.outputs) ? data.outputs : [];
        setInputs(nextInputs);
        setOutputs(nextOutputs);
        setStats(data.stats || { inputCount: 0, outputCount: 0, phantom48vActive: 0 });
        setConsoleIds(Array.isArray(data.consoleIds) ? data.consoleIds : []);
        setLimits(data.limits || { inputMax: 0, outputMax: 0 });
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Rider nije učitan.");
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
  }, [eventId, bandId]);

  function applyBundle(data) {
    setInputs(Array.isArray(data.inputs) ? data.inputs : []);
    setOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    setStats(data.stats || { inputCount: 0, outputCount: 0, phantom48vActive: 0 });
    setConsoleIds(Array.isArray(data.consoleIds) ? data.consoleIds : []);
    setLimits(data.limits || { inputMax: 0, outputMax: 0 });
  }

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
        showToast?.(requestError.message || "Kanal nije sačuvan", "error");
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
    if (kind === "output") {
      const next = outputsRef.current.map((row) => (row.id === id ? { ...row, ...patch } : row));
      outputsRef.current = next;
      setOutputs(next);
    } else {
      const next = inputsRef.current.map((row) => (row.id === id ? { ...row, ...patch } : row));
      inputsRef.current = next;
      setInputs(next);
      if ("phantom48v" in patch) refreshStats(next, outputsRef.current);
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
    } catch (requestError) {
      setConsoleIds(previousIds);
      showToast?.(requestError.message || "Konzole nisu sačuvane", "error");
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
      showToast?.("Izaberi mixing konzolu pre dodavanja kanala.", "error");
      return;
    }
    if (atChannelLimit) {
      showToast?.(
        mode === "output"
          ? `Maksimum ${limits.outputMax} izlaza za izabrane konzole.`
          : `Maksimum ${limits.inputMax} ulaza za izabrane konzole.`,
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
      showToast?.(mode === "output" ? "Output dodat" : "Input dodat");
    } catch (requestError) {
      showToast?.(requestError.message || "Kanal nije dodat", "error");
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
      showToast?.("Kanal obrisan");
    } catch (requestError) {
      showToast?.(requestError.message || "Brisanje nije uspelo", "error");
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
    setMobileMenuChannelId(null);
  }

  async function saveDrawer() {
    if (!drawerChannel || !drawerDraft) return;
    await saveChannel(drawerChannel, drawerDraft);
    closeDrawer();
  }

  if (loading) {
    return <p className="tech-rider-status">Učitavam technical rider…</p>;
  }

  if (error) {
    return <p className="tech-rider-status is-error">{error}</p>;
  }

  return (
    <div className="tech-rider">
      <header className="tech-rider-head">
        <h3 className="tech-rider-title">Technical rider</h3>
        {readOnly ? null : (
          <button
            type="button"
            className="tech-rider-add-btn"
            disabled={busyId === "add" || !canAddChannel}
            title={
              !consoleIds.length
                ? "Izaberi mixing konzolu u stats traci"
                : atChannelLimit
                  ? `Maksimum ${activeLimit} kanala za izabrane konzole`
                  : "+ Dodaj kanal"
            }
            onClick={addChannel}
          >
            {busyId === "add" ? "…" : "+ Add channel"}
          </button>
        )}
      </header>

      <div className="tech-rider-console-bar">
        <ConsoleMultiSelect
          groups={MIXING_CONSOLE_GROUPS}
          selectedIds={consoleIds}
          readOnly={readOnly}
          onToggle={toggleConsole}
        />
      </div>

      <div className="tech-rider-mode" role="tablist" aria-label="Patch mode">
        <button
          type="button"
          role="tab"
          className={`tech-rider-mode-btn is-input ${mode === "input" ? "is-active" : ""}`}
          aria-selected={mode === "input"}
          onClick={() => setMode("input")}
        >
          Input list ({stats.inputCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`tech-rider-mode-btn is-output ${mode === "output" ? "is-active" : ""}`}
          aria-selected={mode === "output"}
          onClick={() => setMode("output")}
        >
          Output / monitor ({stats.outputCount})
        </button>
      </div>

      <label className="tech-rider-search">
        <span className="sr-only">Pretraga kanala</span>
        <input
          type="search"
          placeholder="Search gear / source…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {readOnly ? (
        <p className="tech-rider-locknote">Prošli termin — rider je samo za pregled.</p>
      ) : null}

      <div className="tech-rider-desktop">
        <table className="tech-rider-table">
          <thead>
            <tr>
              <th>CH</th>
              <th>{mode === "output" ? "Destination" : "Source"}</th>
              <th>Gear</th>
              <th>Hardware</th>
              {mode === "input" ? (
                <>
                  <th>+48V</th>
                  <th>Pad</th>
                </>
              ) : (
                <>
                  <th>Stereo</th>
                  <th>Level</th>
                </>
              )}
              <th>Empty</th>
              <th aria-label="Akcije" />
            </tr>
          </thead>
          <tbody>
            {filteredChannels.length ? (
              filteredChannels.map((channel) => {
                const index = channels.findIndex((row) => row.id === channel.id);
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
                        <span className="tech-rider-empty-badge">EMPTY</span>
                      ) : (
                        <input
                          className="tech-rider-cell-input"
                          value={channel.label}
                          readOnly={fieldsLocked}
                          placeholder={mode === "output" ? "Mon 1" : "Kick In"}
                          onChange={(e) => updateChannel(channel.id, channel.kind, { label: e.target.value })}
                          onBlur={() => flushSave(channel.id, channel.kind)}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.isEmpty ? "" : channel.gear}
                        readOnly={fieldsLocked}
                        placeholder={channel.isEmpty ? "—" : "Mic / DI"}
                        onChange={(e) => updateChannel(channel.id, channel.kind, { gear: e.target.value })}
                        onBlur={() => flushSave(channel.id, channel.kind)}
                      />
                    </td>
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
                    {mode === "input" ? (
                      <>
                        <td>
                          <ToggleButton
                            label="+48V"
                            active={channel.phantom48v}
                            tone="phantom"
                            disabled={fieldsLocked}
                            onClick={() => saveChannel(channel, { phantom48v: !channel.phantom48v })}
                          />
                        </td>
                        <td>
                          <ToggleButton
                            label="Pad"
                            active={channel.pad}
                            tone="pad"
                            disabled={fieldsLocked}
                            onClick={() => saveChannel(channel, { pad: !channel.pad })}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <ToggleButton
                            label="Stereo"
                            active={channel.stereo}
                            tone="output"
                            disabled={fieldsLocked}
                            onClick={() => saveChannel(channel, { stereo: !channel.stereo })}
                          />
                        </td>
                        <td>
                          <input
                            className="tech-rider-cell-input tech-rider-level-input"
                            type="text"
                            inputMode="decimal"
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
                    )}
                    <td>
                      <ToggleButton
                        label="Empty"
                        active={channel.isEmpty}
                        tone="empty"
                        disabled={readOnly}
                        onClick={() => toggleEmpty(channel)}
                      />
                    </td>
                    <td className="tech-rider-actions">
                      {readOnly ? null : (
                        <button
                          type="button"
                          className="tech-rider-icon-btn tech-rider-icon-btn-danger"
                          aria-label="Obriši kanal"
                          disabled={rowActionsBusy}
                          onClick={() => removeChannel(channel)}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="tech-rider-empty-row">
                  {search.trim() ? "Nema rezultata pretrage." : "Nema kanala — dodaj prvi input ili output."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="tech-rider-mobile">
        {filteredChannels.length ? (
          filteredChannels.map((channel) => {
            const index = channels.findIndex((row) => row.id === channel.id);
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
                className={`tech-rider-strip ${channelRowStateClass(channel, index)}`}
              >
                <ChannelDragHandle
                  label={chLabel}
                  dragEnabled={dragEnabled}
                  isDragging={draggingId === channel.id}
                  onPointerDown={(event) => onHandlePointerDown(event, channel, index)}
                />
                <label className="tech-rider-strip-field tech-rider-strip-source">
                  <span className="sr-only">{mode === "output" ? "Destination" : "Instrument / source"}</span>
                  {channel.isEmpty ? (
                    <span className="tech-rider-empty-badge">EMPTY</span>
                  ) : (
                    <input
                      className="tech-rider-cell-input"
                      value={channel.label}
                      readOnly={fieldsLocked}
                      placeholder={mode === "output" ? "Mon 1" : "Kick"}
                      onChange={(e) => updateChannel(channel.id, channel.kind, { label: e.target.value })}
                      onBlur={() => flushSave(channel.id, channel.kind)}
                    />
                  )}
                </label>
                <label className="tech-rider-strip-field tech-rider-strip-gear">
                  <span className="sr-only">{mode === "output" ? "Receiver / wedge" : "Mic / DI / gear"}</span>
                  <input
                    className="tech-rider-cell-input"
                    value={channel.isEmpty ? "" : channel.gear}
                    readOnly={fieldsLocked}
                    placeholder={channel.isEmpty ? "—" : mode === "output" ? "IEM" : "SM57"}
                    onChange={(e) => updateChannel(channel.id, channel.kind, { gear: e.target.value })}
                    onBlur={() => flushSave(channel.id, channel.kind)}
                  />
                </label>
                <label className="tech-rider-strip-field tech-rider-strip-hardware">
                  <span className="sr-only">Hardware / stand</span>
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
                <MobileStripMenu
                  channel={channel}
                  mode={mode}
                  readOnly={readOnly}
                  rowActionsBusy={rowActionsBusy}
                  isOpen={mobileMenuChannelId === channel.id}
                  onOpen={() => setMobileMenuChannelId(channel.id)}
                  onClose={() => setMobileMenuChannelId(null)}
                  onEdit={() => openDrawer(channel)}
                  onToggleEmpty={() => toggleEmpty(channel)}
                  onToggle48={() => saveChannel(channel, { phantom48v: !channel.phantom48v })}
                  onTogglePad={() => saveChannel(channel, { pad: !channel.pad })}
                  onToggleStereo={() => saveChannel(channel, { stereo: !channel.stereo })}
                  onDelete={() => removeChannel(channel)}
                />
              </li>
            );
          })
        ) : (
          <li className="tech-rider-strip tech-rider-strip-empty">
            {search.trim() ? "Nema rezultata pretrage." : "Nema kanala — dodaj prvi input ili output."}
          </li>
        )}
      </ul>

      {readOnly ? null : (
        <button
          type="button"
          className="tech-rider-add-btn tech-rider-add-btn-bottom"
          disabled={busyId === "add" || !canAddChannel}
          title={
            !consoleIds.length
              ? "Izaberi mixing konzolu u stats traci"
              : atChannelLimit
                ? `Maksimum ${activeLimit} kanala za izabrane konzole`
                : "+ Dodaj kanal"
          }
          onClick={addChannel}
        >
          {busyId === "add" ? "…" : "+ Add channel"}
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
    </div>
  );
}

function ConsoleMultiSelect({ groups, selectedIds, readOnly = false, onToggle }) {
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
      aria-label="Mixing konzole"
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
        aria-label="Console"
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
        <span className="tech-rider-console-select-label">Console</span>
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
  const current = String(value || "");
  const known = HARDWARE_PRESETS.includes(current);
  return (
    <select
      className={`tech-rider-cell-input tech-rider-select ${compact ? "is-compact" : ""} ${current ? "" : "is-empty"}`}
      value={current}
      disabled={disabled}
      aria-label="Hardware"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{current ? "— Clear —" : ""}</option>
      {HARDWARE_PRESETS.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
      {current && !known ? <option value={current}>{current}</option> : null}
    </select>
  );
}

function GearPresetSelect({ mode, sourceLabel, value, disabled = false, onChange }) {
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
      value={current}
      disabled={disabled}
      aria-label="Gear"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Gear</option>
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
  const patchHidden = Boolean(draft.isEmpty);

  return (
    <div className="tech-rider-drawer-backdrop" onClick={onClose}>
      <div
        className={`tech-rider-drawer ${draft.isEmpty ? "is-empty" : ""}`}
        role="dialog"
        aria-label={`Edit ${chLabel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tech-rider-drawer-handle" aria-hidden="true" />
        <header className="tech-rider-drawer-head">
          <div className="tech-rider-drawer-title-block">
            <span className="tech-rider-drawer-ch">{chLabel}</span>
            <h4>{mode === "output" ? "Output" : "Channel"}</h4>
          </div>
          <button type="button" className="tech-rider-icon-btn" aria-label="Zatvori" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tech-rider-drawer-body">
          <section className="tech-rider-drawer-card">
            <div className="tech-rider-drawer-card-head">
              <span className="tech-rider-drawer-label">
                {mode === "output" ? "Destination" : "Source"}
              </span>
              <ToggleButton
                label="Empty"
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
              value={draft.isEmpty ? "" : draft.label}
              disabled={draft.isEmpty || readOnly}
              placeholder={mode === "output" ? "Mon 1" : "Kick"}
              onChange={(e) => onDraftChange((current) => ({ ...current, label: e.target.value }))}
            />
          </section>

          {patchHidden ? null : (
            <>
              <section className="tech-rider-drawer-card">
                <div className="tech-rider-drawer-flags">
                  {mode === "input" ? (
                    <>
                      <ToggleButton
                        label="+48V"
                        active={Boolean(draft.phantom48v)}
                        tone="phantom"
                        compact
                        disabled={readOnly}
                        onClick={() =>
                          onDraftChange((current) => ({
                            ...current,
                            phantom48v: !current.phantom48v,
                          }))
                        }
                      />
                      <ToggleButton
                        label="Pad"
                        active={Boolean(draft.pad)}
                        tone="pad"
                        compact
                        disabled={readOnly}
                        onClick={() =>
                          onDraftChange((current) => ({
                            ...current,
                            pad: !current.pad,
                          }))
                        }
                      />
                    </>
                  ) : (
                    <>
                      <ToggleButton
                        label="Stereo"
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
                        type="text"
                        inputMode="decimal"
                        value={draft.levelDb ?? ""}
                        disabled={readOnly}
                        placeholder="dB"
                        aria-label="Level"
                        onChange={(e) =>
                          onDraftChange((current) => ({ ...current, levelDb: e.target.value }))
                        }
                      />
                    </>
                  )}
                </div>
              </section>

              <section className="tech-rider-drawer-card">
                <span className="tech-rider-drawer-label">Gear</span>
                <GearPresetSelect
                  mode={mode}
                  sourceLabel={draft.label}
                  value={draft.gear}
                  disabled={readOnly}
                  onChange={(next) => onDraftChange((current) => ({ ...current, gear: next }))}
                />
                <input
                  className="tech-rider-drawer-input"
                  value={draft.gear}
                  disabled={readOnly}
                  onChange={(e) => onDraftChange((current) => ({ ...current, gear: e.target.value }))}
                />
              </section>

              <section className="tech-rider-drawer-card">
                <span className="tech-rider-drawer-label">Hardware</span>
                <HardwareSelect
                  value={draft.hardware}
                  disabled={readOnly}
                  onChange={(next) => onDraftChange((current) => ({ ...current, hardware: next }))}
                />
              </section>
            </>
          )}
        </div>

        <footer className="tech-rider-drawer-foot">
          <button type="button" className="tech-rider-drawer-save" disabled={busy || readOnly} onClick={onSave}>
            Save
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

function MobileStripMenu({
  channel,
  mode,
  readOnly,
  rowActionsBusy,
  isOpen,
  onOpen,
  onClose,
  onEdit,
  onToggleEmpty,
  onToggle48,
  onTogglePad,
  onToggleStereo,
  onDelete,
}) {
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
    channel.isEmpty ||
    (mode === "input" ? channel.phantom48v || channel.pad : channel.stereo);

  return (
    <div className="tech-rider-strip-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`tech-rider-strip-menu-btn ${menuActive ? "has-active" : ""} ${channel.isEmpty ? "is-empty" : ""} ${isOpen ? "is-open" : ""}`}
        aria-label="Channel options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={rowActionsBusy}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        <VerticalDotsIcon />
      </button>
      {isOpen ? (
        <div className="tech-rider-strip-menu" role="menu" aria-label="Channel options">
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
            Empty
          </button>
          {mode === "input" ? (
            <>
              <button
                type="button"
                role="menuitemcheckbox"
                className={`tech-rider-strip-menu-item ${channel.phantom48v ? "is-on is-phantom" : ""}`}
                aria-checked={channel.phantom48v}
                disabled={readOnly || channel.isEmpty}
                onClick={onToggle48}
              >
                +48V
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                className={`tech-rider-strip-menu-item ${channel.pad ? "is-on is-pad" : ""}`}
                aria-checked={channel.pad}
                disabled={readOnly || channel.isEmpty}
                onClick={onTogglePad}
              >
                Pad
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitemcheckbox"
              className={`tech-rider-strip-menu-item ${channel.stereo ? "is-on is-output" : ""}`}
              aria-checked={channel.stereo}
              disabled={readOnly || channel.isEmpty}
              onClick={onToggleStereo}
            >
              Stereo
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="tech-rider-strip-menu-item"
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            Edit channel
          </button>
          {readOnly ? null : (
            <button
              type="button"
              role="menuitem"
              className="tech-rider-strip-menu-item is-danger"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              Obriši
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
