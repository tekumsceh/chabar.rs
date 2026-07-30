import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import {
  CABLE_PRESETS,
  emptyTechChannel,
  GEAR_CATEGORIES,
  HARDWARE_PRESETS,
  OUTPUT_GEAR_PRESETS,
  POPULAR_GEAR,
} from "./techRiderPresets.js";

function formatInputCh(index) {
  return String(index + 1).padStart(2, "0");
}

function formatOutputCh(index) {
  return `A${index + 1}`;
}

export default function TechnicalRiderPanel({ eventId, bandId, readOnly = false, showToast }) {
  const [mode, setMode] = useState("input");
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [stats, setStats] = useState({ inputCount: 0, outputCount: 0, phantom48vActive: 0 });
  const [loading, setLoading] = useState(Boolean(eventId && bandId));
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [drawerChannel, setDrawerChannel] = useState(null);
  const [drawerDraft, setDrawerDraft] = useState(null);
  const [gearCategory, setGearCategory] = useState("dynamic");

  const channels = mode === "output" ? outputs : inputs;

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
        setInputs(Array.isArray(data.inputs) ? data.inputs : []);
        setOutputs(Array.isArray(data.outputs) ? data.outputs : []);
        setStats(data.stats || { inputCount: 0, outputCount: 0, phantom48vActive: 0 });
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
    };
  }, [eventId, bandId]);

  function applyBundle(data) {
    setInputs(Array.isArray(data.inputs) ? data.inputs : []);
    setOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    setStats(data.stats || { inputCount: 0, outputCount: 0, phantom48vActive: 0 });
  }

  async function addChannel() {
    if (readOnly || !eventId || !bandId) return;
    setBusyId("add");
    try {
      await api(`/api/events/${eventId}/tech-rider/channels`, {
        method: "POST",
        bandId,
        body: emptyTechChannel(mode),
      });
      const data = await api(`/api/events/${eventId}/tech-rider`, { bandId });
      applyBundle(data);
      showToast?.(mode === "output" ? "Output dodat" : "Input dodat");
    } catch (requestError) {
      showToast?.(requestError.message || "Kanal nije dodat", "error");
    } finally {
      setBusyId("");
    }
  }

  async function saveChannel(channel, patch) {
    if (readOnly || !eventId || !bandId) return;
    const next = { ...channel, ...patch };
    const applyLocal = (list) => list.map((row) => (row.id === channel.id ? next : row));

    if (channel.kind === "output") {
      setOutputs(applyLocal);
    } else {
      setInputs((current) => {
        const updated = applyLocal(current);
        if ("phantom48v" in patch) {
          setStats((currentStats) => ({
            ...currentStats,
            phantom48vActive: updated.filter((row) => row.phantom48v).length,
          }));
        }
        return updated;
      });
    }

    try {
      const updated = await api(`/api/events/${eventId}/tech-rider/channels/${channel.id}`, {
        method: "PUT",
        bandId,
        body: next,
      });
      const reconcile = (list) => list.map((row) => (row.id === channel.id ? updated : row));
      if (channel.kind === "output") {
        setOutputs(reconcile);
      } else {
        setInputs((current) => {
          const reconciled = reconcile(current);
          if ("phantom48v" in patch) {
            setStats((currentStats) => ({
              ...currentStats,
              phantom48vActive: reconciled.filter((row) => row.phantom48v).length,
            }));
          }
          return reconciled;
        });
      }
    } catch (requestError) {
      const revert = (list) => list.map((row) => (row.id === channel.id ? channel : row));
      if (channel.kind === "output") {
        setOutputs(revert);
      } else {
        setInputs((current) => {
          const restored = revert(current);
          setStats((currentStats) => ({
            ...currentStats,
            phantom48vActive: restored.filter((row) => row.phantom48v).length,
          }));
          return restored;
        });
      }
      showToast?.(requestError.message || "Kanal nije sačuvan", "error");
    }
  }

  async function removeChannel(channel) {
    if (readOnly || !eventId || !bandId) return;
    setBusyId(String(channel.id));
    try {
      await api(`/api/events/${eventId}/tech-rider/channels/${channel.id}`, {
        method: "DELETE",
        bandId,
      });
      const data = await api(`/api/events/${eventId}/tech-rider`, { bandId });
      applyBundle(data);
      showToast?.("Kanal obrisan");
    } catch (requestError) {
      showToast?.(requestError.message || "Brisanje nije uspelo", "error");
    } finally {
      setBusyId("");
    }
  }

  async function moveChannel(channel, direction) {
    if (readOnly || !eventId || !bandId) return;
    const list = channel.kind === "output" ? outputs : inputs;
    const index = list.findIndex((row) => row.id === channel.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;

    const orderedIds = list.map((row) => row.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];

    setBusyId(String(channel.id));
    try {
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
            disabled={busyId === "add"}
            onClick={addChannel}
          >
            {busyId === "add" ? "…" : "+ Add channel"}
          </button>
        )}
      </header>

      <div className="tech-rider-stats" aria-label="Patch statistika">
        <span>
          Inputs: <strong>{stats.inputCount}</strong>/32
        </span>
        <span>
          Aux outs: <strong>{stats.outputCount}</strong>
        </span>
        <span>
          +48V active: <strong>{stats.phantom48vActive}</strong>
        </span>
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
                        onChange={(e) => {
                          const value = e.target.value;
                          const updater = (list) =>
                            list.map((row) => (row.id === channel.id ? { ...row, label: value } : row));
                          if (mode === "output") setOutputs(updater);
                          else setInputs(updater);
                        }}
                        onBlur={(e) => {
                          if (e.target.value !== channel.label) {
                            saveChannel(channel, { label: e.target.value });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.gear}
                        readOnly={readOnly}
                        placeholder="Mic / DI"
                        onChange={(e) => {
                          const value = e.target.value;
                          const updater = (list) =>
                            list.map((row) => (row.id === channel.id ? { ...row, gear: value } : row));
                          if (mode === "output") setOutputs(updater);
                          else setInputs(updater);
                        }}
                        onBlur={(e) => {
                          if (e.target.value !== channel.gear) {
                            saveChannel(channel, { gear: e.target.value });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.cable}
                        readOnly={readOnly}
                        placeholder="XLR 3-Pin"
                        onChange={(e) => {
                          const value = e.target.value;
                          const updater = (list) =>
                            list.map((row) => (row.id === channel.id ? { ...row, cable: value } : row));
                          if (mode === "output") setOutputs(updater);
                          else setInputs(updater);
                        }}
                        onBlur={(e) => {
                          if (e.target.value !== channel.cable) {
                            saveChannel(channel, { cable: e.target.value });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="tech-rider-cell-input"
                        value={channel.hardware}
                        readOnly={readOnly}
                        placeholder="Stand / rack"
                        onChange={(e) => {
                          const value = e.target.value;
                          const updater = (list) =>
                            list.map((row) => (row.id === channel.id ? { ...row, hardware: value } : row));
                          if (mode === "output") setOutputs(updater);
                          else setInputs(updater);
                        }}
                        onBlur={(e) => {
                          if (e.target.value !== channel.hardware) {
                            saveChannel(channel, { hardware: e.target.value });
                          }
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
                            onChange={(e) => {
                              const value = e.target.value;
                              const updater = (list) =>
                                list.map((row) =>
                                  row.id === channel.id ? { ...row, levelDb: value } : row,
                                );
                              setOutputs(updater);
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const parsed = raw === "" ? null : Number(raw.replace(",", "."));
                              if (parsed !== channel.levelDb) {
                                saveChannel(channel, { levelDb: parsed });
                              }
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
        <button type="button" className="tech-rider-mobile-add" disabled={busyId === "add"} onClick={addChannel}>
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
