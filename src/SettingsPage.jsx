import { DEFAULT_RATE, positiveNumber } from "./calculations.js";

/**
 * App settings (theme, compact preview, finance calculation inputs).
 * Opened from avatar menu — not in top nav.
 */
export default function SettingsPage({
  theme,
  onThemeChange,
  compactPreview,
  onCompactPreviewChange,
  settings,
  onSaveSetting,
}) {
  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>Podešavanja</h1>
        <p>Izgled aplikacije i parametri obračuna.</p>
      </header>

      <section className="settings-card" aria-label="Izgled">
        <h2>Izgled</h2>

        <label className="settings-row">
          <span>
            <strong>Tema</strong>
            <small>Svetla ili tamna</small>
          </span>
          <button
            type="button"
            className="settings-toggle"
            onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
            aria-pressed={theme === "dark"}
          >
            {theme === "light" ? "Svetla" : "Tamna"}
          </button>
        </label>

        <label className="settings-row">
          <span>
            <strong>Uži prikaz</strong>
            <small>Phone preview na desktopu</small>
          </span>
          <button
            type="button"
            className="settings-toggle"
            onClick={() => onCompactPreviewChange(!compactPreview)}
            aria-pressed={compactPreview}
          >
            {compactPreview ? "Uključeno" : "Isključeno"}
          </button>
        </label>
      </section>

      <section className="settings-card" aria-label="Obračun">
        <h2>Obračun</h2>

        <label className="settings-field" htmlFor="settingsExchangeRate">
          <span>Kurs EUR/RSD</span>
          <input
            id="settingsExchangeRate"
            name="exchangeRate"
            type="number"
            min="0"
            step="0.01"
            value={settings.exchangeRate}
            onChange={(event) => onSaveSetting("exchangeRate", event.target.value, false)}
            onBlur={(event) => onSaveSetting("exchangeRate", positiveNumber(event.target.value, DEFAULT_RATE), true)}
            autoComplete="off"
          />
        </label>

        <label className="settings-field" htmlFor="settingsAsOfDate">
          <span>Obračun do datuma</span>
          <input
            id="settingsAsOfDate"
            name="asOfDate"
            type="text"
            inputMode="numeric"
            placeholder="dd.mm.yyyy."
            value={settings.asOfDate}
            onChange={(event) => onSaveSetting("asOfDate", event.target.value, false)}
            onBlur={(event) => onSaveSetting("asOfDate", event.target.value, true)}
            autoComplete="off"
          />
        </label>
      </section>
    </div>
  );
}
