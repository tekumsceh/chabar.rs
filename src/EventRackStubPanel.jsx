import { useMemo, useState } from "react";

const PANEL_SPECS = {
  "hospitality-rider": {
    eyebrow: "Chabar hospitality",
    title: "Hospitality rider",
    accent: "amber",
    stats: [
      { label: "Rooms", value: "—" },
      { label: "Meals", value: "—" },
      { label: "Guests", value: "—" },
    ],
    modes: [
      { id: "rooms", label: "Rooms" },
      { id: "catering", label: "Catering" },
      { id: "contacts", label: "Contacts" },
    ],
    columns: ["Item", "Qty", "Notes", "Status"],
    rows: {
      rooms: [
        ["Single / quiet", "2", "Near stage if possible", "TBD"],
        ["Twin share", "3", "Band only", "TBD"],
        ["Green room", "1", "Water + towels", "TBD"],
      ],
      catering: [
        ["Hot meal", "6", "No pork", "TBD"],
        ["Coffee / tea", "1", "Continuous", "TBD"],
        ["Case of water", "2", "Room temp", "TBD"],
      ],
      contacts: [
        ["Promoter", "—", "Day-of contact", "TBD"],
        ["Hotel front desk", "—", "Late check-in", "TBD"],
        ["Runner", "—", "Load-in window", "TBD"],
      ],
    },
    addLabel: "+ Add hospitality item",
    canvas: null,
  },
  "lighting-rider": {
    eyebrow: "Chabar lighting",
    title: "Lighting rider",
    accent: "violet",
    stats: [
      { label: "Fixtures", value: "—" },
      { label: "Looks", value: "—" },
      { label: "DMX", value: "—" },
    ],
    modes: [
      { id: "fixtures", label: "Fixture list" },
      { id: "looks", label: "Looks" },
    ],
    columns: ["Fixture", "Qty", "Position", "Notes"],
    rows: {
      fixtures: [
        ["LED wash", "8", "Front truss", "RGBW"],
        ["Spot / profile", "4", "FOH", "Gobo ok"],
        ["Strobe / blinder", "2", "Upstage", "Cue only"],
        ["Hazers", "1", "Side wing", "Low haze"],
      ],
      looks: [
        ["Open / walk-in", "1", "Warm", "House to half"],
        ["Song A", "1", "Blue wash", "No strobe"],
        ["Encore", "1", "Full look", "Blinder hit"],
      ],
    },
    addLabel: "+ Add fixture / look",
    canvas: null,
  },
  "stage-plot": {
    eyebrow: "Chabar stage",
    title: "Stage plot",
    accent: "cyan",
    stats: [
      { label: "Width", value: "—" },
      { label: "Depth", value: "—" },
      { label: "Power drops", value: "—" },
    ],
    modes: [
      { id: "plot", label: "Plot" },
      { id: "power", label: "Power" },
      { id: "notes", label: "Notes" },
    ],
    columns: ["Element", "Side", "Depth", "Notes"],
    rows: {
      plot: [
        ["Drums", "US C", "Upstage", "Risers TBD"],
        ["Bass", "DS L", "Downstage", "DI + amp"],
        ["Keys", "DS R", "Downstage", "Stereo DI"],
        ["Vocals", "DS C", "Front", "2× boom"],
      ],
      power: [
        ["Drum world", "US", "1× 16A", "Shared"],
        ["Bass / guitar", "DS L", "1× 16A", ""],
        ["Keys / laptop", "DS R", "1× 16A", "UPS preferred"],
      ],
      notes: [
        ["Monitor wedge", "DS", "—", "Mix from FOH"],
        ["IEM rack", "Side", "—", "RF coordination"],
        ["Cable runs", "—", "—", "Avoid cross traffic"],
      ],
    },
    addLabel: "+ Add stage element",
    canvas: {
      title: "Stage overview",
      hint: "Canvas / PDF plot — coming soon",
      chips: ["Drums", "Bass", "Gtr", "Keys", "Vox", "Mon"],
    },
  },
  "set-lists": {
    eyebrow: "Chabar show",
    title: "Set lists",
    accent: "lime",
    stats: [
      { label: "Songs", value: "—" },
      { label: "Runtime", value: "—" },
      { label: "Encore", value: "—" },
    ],
    modes: [
      { id: "main", label: "Main set" },
      { id: "encore", label: "Encore" },
      { id: "alts", label: "Alternates" },
    ],
    columns: ["#", "Song", "Key", "Time"],
    rows: {
      main: [
        ["01", "Opener", "—", "—"],
        ["02", "Song title", "—", "—"],
        ["03", "Song title", "—", "—"],
        ["04", "Song title", "—", "—"],
      ],
      encore: [
        ["E1", "Encore A", "—", "—"],
        ["E2", "Encore B", "—", "—"],
      ],
      alts: [
        ["A1", "Swap option", "—", "If short"],
        ["A2", "Acoustic", "—", "Optional"],
      ],
    },
    addLabel: "+ Add song",
    canvas: null,
  },
  visuals: {
    eyebrow: "Chabar visuals",
    title: "Visuals",
    accent: "pink",
    stats: [
      { label: "Cues", value: "—" },
      { label: "Screens", value: "—" },
      { label: "Format", value: "—" },
    ],
    modes: [
      { id: "cues", label: "Cue list" },
      { id: "screens", label: "Screens" },
      { id: "assets", label: "Assets" },
    ],
    columns: ["Cue", "Song / time", "Content", "Notes"],
    rows: {
      cues: [
        ["Q01", "Walk-in", "Loop / logo", "Soft"],
        ["Q02", "Song 1", "Full look", "Sync to drums"],
        ["Q03", "Ballad", "Minimal", "No strobe"],
        ["Q04", "Encore", "Finale", "Blackout end"],
      ],
      screens: [
        ["LED wall", "Upstage", "16:9", "Primary"],
        ["Side screens", "L/R", "Optional", "IMAG"],
      ],
      assets: [
        ["Logo pack", "—", "PNG / SVG", "TBD"],
        ["Show file", "—", "Resolume / QLab", "TBD"],
      ],
    },
    addLabel: "+ Add cue",
    canvas: null,
  },
};

export default function EventRackStubPanel({ panelId, readOnly = false, showToast }) {
  const spec = PANEL_SPECS[panelId];
  const [mode, setMode] = useState(spec?.modes?.[0]?.id || "");

  const rows = useMemo(() => {
    if (!spec) return [];
    return spec.rows[mode] || Object.values(spec.rows)[0] || [];
  }, [spec, mode]);

  if (!spec) {
    return <p className="tech-rider-status">Nepoznat panel.</p>;
  }

  function handleAdd() {
    showToast?.("Uskoro — ovaj deo još nije povezan.");
  }

  return (
    <div className={`tech-rider event-rack is-${spec.accent}`}>
      <header className="tech-rider-head">
        <div>
          <p className="tech-rider-eyebrow">{spec.eyebrow}</p>
          <h3 className="tech-rider-title">{spec.title}</h3>
        </div>
        {readOnly ? null : (
          <button type="button" className="tech-rider-add-btn" onClick={handleAdd}>
            {spec.addLabel}
          </button>
        )}
      </header>

      <div className="tech-rider-stats event-rack-stats" aria-label="Pregled">
        {spec.stats.map((item) => (
          <span key={item.label}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
        <span className="event-rack-preview-pill">Preview</span>
      </div>

      <div className="tech-rider-mode" role="tablist" aria-label={`${spec.title} sections`}>
        {spec.modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={`tech-rider-mode-btn is-input ${mode === item.id ? "is-active" : ""}`}
            aria-selected={mode === item.id}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {spec.canvas ? (
        <div className="event-rack-canvas" aria-label={spec.canvas.title}>
          <div className="event-rack-canvas-grid" aria-hidden="true" />
          <div className="event-rack-canvas-copy">
            <strong>{spec.canvas.title}</strong>
            <span>{spec.canvas.hint}</span>
          </div>
          <div className="event-rack-canvas-chips">
            {spec.canvas.chips.map((chip) => (
              <span key={chip} className="event-rack-chip">
                {chip}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="tech-rider-desktop event-rack-table-wrap">
        <table className="tech-rider-table">
          <thead>
            <tr>
              {spec.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${mode}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${mode}-${index}-${cellIndex}`}>
                    {cellIndex === 0 ? (
                      <span className="tech-rider-ch">{cell}</span>
                    ) : (
                      <span className="event-rack-cell">{cell}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="tech-rider-mobile event-rack-mobile">
        {rows.map((row, index) => (
          <li key={`m-${mode}-${index}`} className="tech-rider-card">
            <div className="tech-rider-card-head">
              <span className="tech-rider-ch">{row[0]}</span>
              <strong>{row[1] || "—"}</strong>
            </div>
            <dl className="tech-rider-card-meta">
              {spec.columns.slice(2).map((col, colIndex) => (
                <div key={col}>
                  <dt>{col}</dt>
                  <dd>{row[colIndex + 2] || "—"}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <p className="event-rack-footnote">
        Layout preview — sadržaj i čuvanje stižu kad dogovorimo šta tačno treba.
      </p>
    </div>
  );
}
