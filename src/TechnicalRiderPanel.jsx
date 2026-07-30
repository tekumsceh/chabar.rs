import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import { MIXING_CONSOLE_GROUPS } from "./mixingConsoles.js";
import {
  CABLE_PRESETS,
  emptyTechChannel,
  GEAR_CATEGORIES,
  HARDWARE_PRESETS,
  OUTPUT_GEAR_PRESETS,
  POPULAR_GEAR,
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
    left.levelDb === right.levelDb &&
    left.notes === right.notes
  );
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
  const [gearCategory, setGearCategory] = useState("dynamic");

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

  async function moveChannel(channel, direction) {
    if (readOnly || !eventId || !bandId) return;
    const list = channel.kind === "output" ? outputsRef.current : inputsRef.current;
    const index = list.findIndex((row) => row.id === channel.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;

    const orderedIds = list.map((row) => row.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];

    setBusyId(String(channel.id));
    try {
      await flushAllPending();
      const data = await api(`/api/events/${eventId}/tech-rider/reorder`, {
        method: "PUT",
        bandId,
        body: { kind: channel.kind, orderedIds },
      });
      applyBundle(data);
    } catch (requestError) {
      showToast?.(requestError.message || "Redosled nije sačuvan", "error");
    } finally {
      setBusyId("");
    }
  }

  function openDrawer(channel) {
    setDrawerChannel(channel);
    setDrawerDraft({ ...channel });
    setGearCategory("dynamic");
  }

  function closeDrawer() {
    setDrawerChannel(null);
    setDrawerDraft(null);
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
        <div>
          <p className="tech-rider-eyebrow">Chabar rider builder</p>
          <h3 className="tech-rider-title">Technical rider</h3>
        </div>
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

      <div className="tech-rider-stats" aria-label="Patch statistika">
        <span>
          Inputs:{" "}
          <strong>
            {stats.inputCount}
            {limits.inputMax ? `/${limits.inputMax}` : ""}
          </strong>
        </span>
        <span>
          Aux outs:{" "}
          <strong>
            {stats.outputCount}
            {limits.outputMax ? `/${limits.outputMax}` : ""}
          </strong>
        </span>
        <span>
          +48V active: <strong>{stats.phantom48vActive}</strong>
        </span>
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
              <th>Cable</th>
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
              <th aria-label="Akcije" />
            </tr>
          </thead>
          <tbody>
            {filteredChannels.length ? (
              filteredChannels.map((channel) => {
                const index = channels.findIndex((row) => row.id === channel.id);
                const chLabel = mode === "output" ? formatOutputCh(index) : formatInputCh(index);
                const rowActionsBusy = busyId === String(channel.id);
                return (
                  <tr key={channel.id}>
                    <td className="tech-rider-ch">{chLabel}</td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.label}
                        readOnly={readOnly}
                        placeholder={mode === "output" ? "Mon 1" : "Kick In"}
                        onChange={(e) => updateChannel(channel.id, channel.kind, { label: e.target.value })}
                        onBlur={() => flushSave(channel.id, channel.kind)}
                      />
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.gear}
                        readOnly={readOnly}
                        placeholder="Mic / DI"
                        onChange={(e) => updateChannel(channel.id, channel.kind, { gear: e.target.value })}
                        onBlur={() => flushSave(channel.id, channel.kind)}
                      />
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.cable}
                        readOnly={readOnly}
                        placeholder="XLR 3-Pin"
                        onChange={(e) => updateChannel(channel.id, channel.kind, { cable: e.target.value })}
                        onBlur={() => flushSave(channel.id, channel.kind)}
                      />
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.hardware}
                        readOnly={readOnly}
                        placeholder="Stand / rack"
                        onChange={(e) => updateChannel(channel.id, channel.kind, { hardware: e.target.value })}
                        onBlur={() => flushSave(channel.id, channel.kind)}
                      />
                    </td>
                    {mode === "input" ? (
                      <>
                        <td>
                          <ToggleButton
                            label="+48V"
                            active={channel.phantom48v}
                            tone="phantom"
                            disabled={readOnly}
                            onClick={() => saveChannel(channel, { phantom48v: !channel.phantom48v })}
                          />
                        </td>
                        <td>
                          <ToggleButton
                            label="Pad"
                            active={channel.pad}
                            tone="pad"
                            disabled={readOnly}
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
                            disabled={readOnly}
                            onClick={() => saveChannel(channel, { stereo: !channel.stereo })}
                          />
                        </td>
                        <td>
                          <input
                            className="tech-rider-cell-input tech-rider-level-input"
                            type="text"
                            inputMode="decimal"
                            value={channel.levelDb ?? ""}
                            readOnly={readOnly}
                            placeholder="0 dB"
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
                    <td className="tech-rider-actions">
                      {readOnly ? null : (
                        <>
                          <button
                            type="button"
                            className="tech-rider-icon-btn"
                            aria-label="Pomeri gore"
                            disabled={rowActionsBusy || index === 0}
                            onClick={() => moveChannel(channel, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="tech-rider-icon-btn"
                            aria-label="Pomeri dole"
                            disabled={rowActionsBusy || index === channels.length - 1}
                            onClick={() => moveChannel(channel, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="tech-rider-icon-btn tech-rider-icon-btn-danger"
                            aria-label="Obriši kanal"
                            disabled={rowActionsBusy}
                            onClick={() => removeChannel(channel)}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={mode === "input" ? 8 : 8} className="tech-rider-empty-row">
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
            return (
              <li key={channel.id} className="tech-rider-card">
                <div className="tech-rider-card-head">
                  <span className="tech-rider-ch">{chLabel}</span>
                  <strong>{channel.label || (mode === "output" ? "Output" : "Input")}</strong>
                </div>
                <dl className="tech-rider-card-meta">
                  <div>
                    <dt>Gear</dt>
                    <dd>{channel.gear || "—"}</dd>
                  </div>
                  <div>
                    <dt>Cable</dt>
                    <dd>{channel.cable || "—"}</dd>
                  </div>
                  <div>
                    <dt>Hardware</dt>
                    <dd>{channel.hardware || "—"}</dd>
                  </div>
                </dl>
                {mode === "input" ? (
                  <div className="tech-rider-card-toggles">
                    <ToggleButton
                      label="+48V"
                      active={channel.phantom48v}
                      tone="phantom"
                      disabled={readOnly}
                      onClick={() => saveChannel(channel, { phantom48v: !channel.phantom48v })}
                    />
                    <ToggleButton
                      label="Pad"
                      active={channel.pad}
                      tone="pad"
                      disabled={readOnly}
                      onClick={() => saveChannel(channel, { pad: !channel.pad })}
                    />
                  </div>
                ) : (
                  <div className="tech-rider-card-toggles">
                    <ToggleButton
                      label="Stereo"
                      active={channel.stereo}
                      tone="output"
                      disabled={readOnly}
                      onClick={() => saveChannel(channel, { stereo: !channel.stereo })}
                    />
                    <span className="tech-rider-card-level">
                      Level: {channel.levelDb != null ? `${channel.levelDb} dB` : "—"}
                    </span>
                  </div>
                )}
                {readOnly ? null : (
                  <div className="tech-rider-card-actions">
                    <button type="button" disabled={rowActionsBusy} onClick={() => openDrawer(channel)}>
                      Edit gear
                    </button>
                    <button type="button" disabled={rowActionsBusy} onClick={() => addChannel()}>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={rowActionsBusy}
                      onClick={() => removeChannel(channel)}
                      aria-label="Obriši kanal"
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            );
          })
        ) : (
          <li className="tech-rider-card tech-rider-card-empty">
            {search.trim() ? "Nema rezultata pretrage." : "Nema kanala — dodaj prvi input ili output."}
          </li>
        )}
      </ul>

      {readOnly ? null : (
        <button
          type="button"
          className="tech-rider-mobile-add"
          disabled={busyId === "add" || !canAddChannel}
          onClick={addChannel}
        >
          + Add new channel line
        </button>
      )}

      {drawerChannel && drawerDraft ? (
        <div className="tech-rider-drawer-backdrop" onClick={closeDrawer}>
          <div
            className="tech-rider-drawer"
            role="dialog"
            aria-label={`Edit channel ${drawerChannel.label || ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tech-rider-drawer-head">
              <h4>
                Edit {mode === "output" ? "output" : "channel"}: {drawerDraft.label || "—"}
              </h4>
              <button type="button" className="tech-rider-icon-btn" aria-label="Zatvori" onClick={closeDrawer}>
                ×
              </button>
            </header>

            <label className="tech-rider-drawer-field">
              Source / destination
              <input
                value={drawerDraft.label}
                onChange={(e) => setDrawerDraft((current) => ({ ...current, label: e.target.value }))}
              />
            </label>

            <div className="tech-rider-drawer-section">
              <span className="tech-rider-drawer-label">Category</span>
              <div className="tech-rider-chip-row">
                {GEAR_CATEGORIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`tech-rider-chip ${gearCategory === item.id ? "is-active" : ""}`}
                    onClick={() => setGearCategory(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tech-rider-drawer-section">
              <span className="tech-rider-drawer-label">
                {mode === "output" ? "Receivers / wedges" : "Popular microphones"}
              </span>
              <div className="tech-rider-chip-row">
                {(mode === "output" ? OUTPUT_GEAR_PRESETS : POPULAR_GEAR[gearCategory] || []).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`tech-rider-chip ${drawerDraft.gear === item ? "is-active" : ""}`}
                    onClick={() => setDrawerDraft((current) => ({ ...current, gear: item }))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="tech-rider-drawer-section">
              <span className="tech-rider-drawer-label">Cable & protocol</span>
              <div className="tech-rider-chip-row">
                {CABLE_PRESETS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`tech-rider-chip ${drawerDraft.cable === item ? "is-active" : ""}`}
                    onClick={() => setDrawerDraft((current) => ({ ...current, cable: item }))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="tech-rider-drawer-section">
              <span className="tech-rider-drawer-label">Hardware & accessories</span>
              <div className="tech-rider-chip-row">
                {HARDWARE_PRESETS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`tech-rider-chip ${drawerDraft.hardware === item ? "is-active" : ""}`}
                    onClick={() => setDrawerDraft((current) => ({ ...current, hardware: item }))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="tech-rider-drawer-save" disabled={busyId === "add"} onClick={saveDrawer}>
              Save channel
            </button>
          </div>
        </div>
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
    if (selectedIds.length === 1) {
      const match = flatConsoles.find((item) => item.id === selectedIds[0]);
      return match?.model || "1";
    }
    return String(selectedIds.length);
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
        aria-label={
          selectedIds.length
            ? `Console: ${selectedIds.length} selected`
            : "Izaberi mixing konzole"
        }
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

function ToggleButton({ label, active, tone = "phantom", disabled = false, onClick }) {
  return (
    <button
      type="button"
      className={`tech-rider-toggle is-${tone} ${active ? "is-on" : ""}`}
      aria-pressed={active}
      aria-label={label}
      title={active ? `${label} — uključeno (klikni za isključivanje)` : `${label} — klikni za uključivanje`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tech-rider-toggle-led" aria-hidden="true" />
      <span className="tech-rider-toggle-label">{label}</span>
    </button>
  );
}
