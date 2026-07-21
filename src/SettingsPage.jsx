import { DEFAULT_RATE, LEGACY_RATE_THROUGH_TEXT, positiveNumber } from "./calculations.js";
import { INVITE_PREFERENCE_LABELS, INVITE_PREFERENCES } from "../shared/bandLimits.js";
import { useState } from "react";
import FieldSelect from "./FieldSelect.jsx";

export default function SettingsPage({
  theme,
  onThemeChange,
  settings,
  onSaveSetting,
  onFetchExchangeRate,
  onOpenLegal,
  invitePreference = "accept",
  onInvitePreferenceChange,
  ownedGroupBands = 0,
  ownerLimit = 5,
}) {
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMeta, setRateMeta] = useState(null);

  async function handleFetchRate() {
    if (rateBusy || !onFetchExchangeRate) return;
    setRateBusy(true);
    try {
      const result = await onFetchExchangeRate();
      setRateMeta(result);
    } catch {
      // toast handled in App
    } finally {
      setRateBusy(false);
    }
  }

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
      </section>

      <section className="settings-card" aria-label="Bendovi">
        <h2>Bendovi</h2>
        <p className="settings-note">
          Vlasništvo grupnih bendova: {ownedGroupBands}/{ownerLimit}
          {ownedGroupBands >= ownerLimit ? " · za više treba grant" : ""}
        </p>

        <label className="settings-field" htmlFor="settingsInvitePreference">
          <span>Pozivnice u bend</span>
          <FieldSelect
            id="settingsInvitePreference"
            label="Pozivnice u bend"
            value={invitePreference}
            options={INVITE_PREFERENCES.map((id) => ({
              id,
              label: INVITE_PREFERENCE_LABELS[id],
              disabled: id === "digest",
            }))}
            onChange={(id) => onInvitePreferenceChange?.(id)}
          />
        </label>
        <p className="settings-note">
          Pozivnice uvek čekaju tvoju potvrdu. Blokiraj ako ne želiš da te iko pozove.
        </p>
      </section>

      <section className="settings-card" aria-label="Obračun">
        <h2>Obračun</h2>

        <label className="settings-field" htmlFor="settingsExchangeRate">
          <span>Kurs EUR/RSD (od 21.07.2026.)</span>
          <div className="settings-rate-row">
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
            <button
              type="button"
              className="settings-rate-fetch"
              disabled={rateBusy || !onFetchExchangeRate}
              onClick={handleFetchRate}
            >
              {rateBusy ? "…" : "Uzmi kurs"}
            </button>
          </div>
        </label>
        <p className="settings-note">
          Do {LEGACY_RATE_THROUGH_TEXT.replace(/\.$/, "")} svi termini i uplate idu po fiksnom kursu {DEFAULT_RATE}.
          Posle toga: NBS srednji kurs (Google Finance kao rezervna).
          {rateMeta
            ? ` Trenutno: ${rateMeta.rate} · ${rateMeta.sourceLabel}${rateMeta.asOf ? ` · ${rateMeta.asOf}` : ""}${
                rateMeta.source === "google" ? " (backup)" : ""
              }.`
            : ""}
        </p>

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

      <section className="settings-card" aria-label="Pravno">
        <h2>Pravno</h2>
        <div className="settings-legal-links">
          <button type="button" className="settings-legal-link" onClick={() => onOpenLegal?.("terms")}>
            <DocIcon />
            <span>Uslovi korišćenja</span>
          </button>
          <button type="button" className="settings-legal-link" onClick={() => onOpenLegal?.("privacy")}>
            <DocIcon />
            <span>Politika privatnosti</span>
          </button>
          <button type="button" className="settings-legal-link" onClick={() => onOpenLegal?.("cookies")}>
            <DocIcon />
            <span>Politika kolačića</span>
          </button>
          <button type="button" className="settings-legal-link" onClick={() => onOpenLegal?.("imprint")}>
            <DocIcon />
            <span>Pravne informacije</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7 3.5h7.5L19 8v12.5H7V3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14.5 3.5V8H19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
