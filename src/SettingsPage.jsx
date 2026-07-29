import { DEFAULT_RATE, positiveNumber } from "./calculations.js";
import { useEffect, useState } from "react";
import PageHeader from "./PageHeader.jsx";
import {
  disablePush,
  enablePush,
  getPushStatus,
  isPushSupported,
  syncPushSubscription,
} from "./pushNotifications.js";
import { api } from "./api.js";

function isAutoExchangeRate(settings) {
  return settings?.autoExchangeRate !== "0";
}

export default function SettingsPage({
  theme,
  onThemeChange,
  settings,
  onSaveSetting,
  onFetchExchangeRate,
  onOpenLegal,
  invitePreference = "accept",
  onInvitePreferenceChange,
  showToast,
  onBack,
  onOpenButtonShowcase,
}) {
  const [pushOn, setPushOn] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const pushSupported = isPushSupported();
  const autoRate = isAutoExchangeRate(settings);
  const invitesAllowed = invitePreference !== "block";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await syncPushSubscription(api);
      if (cancelled) return;
      setPushOn(status.prefEnabled);
      setPushReady(status.ready);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshPushState() {
    const status = await getPushStatus();
    setPushOn(status.prefEnabled);
    setPushReady(status.ready);
    return status;
  }

  async function handlePushToggle() {
    if (pushBusy || !pushSupported) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush(api);
        await refreshPushState();
        showToast?.("Obaveštenja isključena");
        return;
      }

      await enablePush(api);
      await refreshPushState();
      showToast?.("Obaveštenja dozvoljena");
    } catch (error) {
      await refreshPushState();
      showToast?.(error.message || "Obaveštenja nisu uspela", "error");
    } finally {
      setPushBusy(false);
    }
  }

  function pushStatusLabel() {
    if (pushBusy) return "…";
    if (pushReady) return "Dozvoljeno";
    if (pushOn && Notification.permission === "denied") return "Blokirano";
    if (pushOn) return "Dozvoljeno";
    return "Isključeno";
  }

  async function handleAutoRateToggle() {
    if (rateBusy) return;
    const next = !autoRate;
    await onSaveSetting?.("autoExchangeRate", next ? "1" : "0", true);
    if (next && onFetchExchangeRate) {
      setRateBusy(true);
      try {
        await onFetchExchangeRate();
      } catch {
        // toast in App
      } finally {
        setRateBusy(false);
      }
    }
  }

  return (
    <div className="settings-page">
      <PageHeader title="Podešavanja" onBack={onBack} />

      <section className="settings-card" aria-label="Izgled">
        <h2>Izgled</h2>
        <div className="settings-row">
          <span>
            <strong>Tema</strong>
            <small className="settings-row-status">{theme === "light" ? "Svetla" : "Tamna"}</small>
          </span>
          <div className="settings-theme-picker" role="group" aria-label="Tema">
            <button
              type="button"
              className={`settings-theme-option ${theme === "light" ? "is-active" : ""}`}
              aria-label="Svetla tema"
              aria-pressed={theme === "light"}
              title="Svetla"
              onClick={() => onThemeChange("light")}
            >
              <SunIcon />
            </button>
            <button
              type="button"
              className={`settings-theme-option ${theme === "dark" ? "is-active" : ""}`}
              aria-label="Tamna tema"
              aria-pressed={theme === "dark"}
              title="Tamna"
              onClick={() => onThemeChange("dark")}
            >
              <MoonIcon />
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card" aria-label="Obaveštenja">
        <h2>Obaveštenja</h2>
        <div className="settings-row">
          <span>
            <strong>Obaveštenja</strong>
            <small className="settings-row-status">{pushStatusLabel()}</small>
          </span>
          <SettingsSwitch
            checked={pushOn}
            disabled={!pushSupported || Notification.permission === "denied"}
            busy={pushBusy}
            label="Obaveštenja"
            onChange={handlePushToggle}
          />
        </div>
      </section>

      <section className="settings-card" aria-label="Pozivnice">
        <h2>Bendovi</h2>
        <div className="settings-row">
          <span>
            <strong>Pozivnice</strong>
            <small className="settings-row-status">{invitesAllowed ? "Dozvoljeno" : "Zabrani"}</small>
          </span>
          <SettingsSwitch
            checked={invitesAllowed}
            label="Pozivnice u bend"
            onChange={() => onInvitePreferenceChange?.(invitesAllowed ? "block" : "accept")}
          />
        </div>
      </section>

      <section className="settings-card" aria-label="Obračun">
        <h2>Obračun</h2>
        <div className="settings-row">
          <span>
            <strong>Kurs EUR/RSD</strong>
            <small className="settings-row-status">{rateBusy ? "…" : autoRate ? "Automatski" : "Ručno"}</small>
            <small className="settings-row-hint">NBS srednji kurs; Google Finance kao rezerva</small>
          </span>
          <SettingsSwitch
            checked={autoRate}
            busy={rateBusy}
            label="Automatski kurs EUR/RSD"
            onChange={handleAutoRateToggle}
          />
        </div>
        {!autoRate ? (
          <label className="settings-field settings-field-compact" htmlFor="settingsExchangeRate">
            <span>Ručni kurs</span>
            <input
              id="settingsExchangeRate"
              name="exchangeRate"
              type="number"
              min="0"
              step="0.01"
              value={settings.exchangeRate}
              onChange={(event) => onSaveSetting("exchangeRate", event.target.value, false)}
              onBlur={(event) =>
                onSaveSetting("exchangeRate", positiveNumber(event.target.value, DEFAULT_RATE), true)
              }
              autoComplete="off"
            />
          </label>
        ) : null}
        <p className="settings-note">
          Kada je automatski uključen, pri unosu uplate koristi se trenutni zvanični kurs. Inače unosiš
          svoj kurs ručno.
        </p>
        <p className="settings-note settings-note-muted">
          Napomena: vezivanje kursa po uplati i istorija kursa — još razmatramo.
        </p>
      </section>

      <section className="settings-card" aria-label="UI laboratorija">
        <h2>UI laboratorija</h2>
        <div className="settings-row">
          <span>
            <strong>Dugmad</strong>
            <small className="settings-row-status">10 dizajna za pregled</small>
          </span>
          <button type="button" className="settings-lab-link" onClick={() => onOpenButtonShowcase?.()}>
            <PaletteIcon />
            <span>Otvori</span>
            <ChevronSmallIcon />
          </button>
        </div>
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

function SettingsSwitch({ checked, disabled = false, busy = false, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      className={`settings-switch ${checked ? "is-on" : ""} ${busy ? "is-busy" : ""}`}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onChange}
    >
      <span className="settings-switch-track" aria-hidden="true">
        <span className="settings-switch-thumb" />
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M5.8 5.8 4.3 4.3M19.7 19.7l-1.5-1.5M18.2 5.8l1.5-1.5M5.8 18.2l-1.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20 14.5A7.5 7.5 0 0 1 9.5 4 6.5 6.5 0 1 0 20 14.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
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

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3.5c-4.2 0-7.5 2.8-7.5 6.5 0 2.4 1.4 4.2 3.5 5.2-.3.9-.9 2.5-1 2.8-.2.5.3.9.8.7.4-.2 2.4-1.4 3.2-1.9 1 .3 2 .5 3 .5 4.2 0 7.5-2.8 7.5-6.5S16.2 3.5 12 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="10" r="0.85" fill="currentColor" />
      <circle cx="12" cy="8" r="0.85" fill="currentColor" />
      <circle cx="15.5" cy="10" r="0.85" fill="currentColor" />
    </svg>
  );
}

function ChevronSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
