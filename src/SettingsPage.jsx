import { DEFAULT_RATE, LEGACY_RATE_THROUGH_TEXT, positiveNumber } from "./calculations.js";
import { INVITE_PREFERENCE_LABELS, INVITE_PREFERENCES } from "../shared/bandLimits.js";
import { useEffect, useState } from "react";
import FieldSelect from "./FieldSelect.jsx";
import {
  disablePush,
  enablePush,
  getPushPrefEnabled,
  isPushSupported,
} from "./pushNotifications.js";
import { api } from "./api.js";

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
  showToast,
}) {
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMeta, setRateMeta] = useState(null);
  const [pushOn, setPushOn] = useState(() => getPushPrefEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const pushSupported = isPushSupported();

  useEffect(() => {
    setPushOn(getPushPrefEnabled());
  }, []);

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

  async function handlePushToggle() {
    if (pushBusy || !pushSupported) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush(api);
        setPushOn(false);
        showToast?.("Push obaveštenja isključena");
      } else {
        await enablePush(api);
        setPushOn(true);
        showToast?.("Push obaveštenja uključena");
      }
    } catch (error) {
      showToast?.(error.message || "Push nije uspeo", "error");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleTestNotification() {
    if (testBusy) return;
    setTestBusy(true);
    try {
      const result = await api("/api/me/notifications/test", { method: "POST" });
      const pushHint =
        result.pushSubscriptions > 0
          ? " · push poslat (ako je dozvola data)"
          : " · samo u aplikaciji (uključi Push iznad)";
      showToast?.(`Test poslat${pushHint}`);
    } catch (error) {
      showToast?.(error.message || "Test nije uspeo", "error");
    } finally {
      setTestBusy(false);
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

      <section className="settings-card" aria-label="Obaveštenja">
        <h2>Obaveštenja</h2>
        <label className="settings-row">
          <span>
            <strong>Push obaveštenja</strong>
            <small>
              {pushSupported
                ? "Na telefonu: dodaj Chabar na Home Screen za pouzdan push (iOS)."
                : "Ovaj pregledač ne podržava push."}
            </small>
          </span>
          <button
            type="button"
            className="settings-toggle"
            disabled={!pushSupported || pushBusy}
            onClick={handlePushToggle}
            aria-pressed={pushOn}
          >
            {pushBusy ? "…" : pushOn ? "Uključeno" : "Isključeno"}
          </button>
        </label>
        <p className="settings-note">
          Uključivanje traži dozvolu pregledača. Lični bend ne šalje obaveštenja.
        </p>
        <button
          type="button"
          className="settings-rate-fetch"
          disabled={testBusy}
          onClick={handleTestNotification}
          style={{ marginTop: "0.65rem" }}
        >
          {testBusy ? "…" : "Pošalji test obaveštenje"}
        </button>
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
