import { DEFAULT_RATE, LEGACY_RATE_THROUGH_TEXT, positiveNumber } from "./calculations.js";
import { INVITE_PREFERENCE_LABELS, INVITE_PREFERENCES } from "../shared/bandLimits.js";
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useConfirm } from "./confirmDialog.jsx";
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
  showToast,
}) {
  const { confirm } = useConfirm();
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMeta, setRateMeta] = useState(null);
  const [gcal, setGcal] = useState(null);
  const [gcalBusy, setGcalBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api("/api/google/calendar/status");
        if (!cancelled) setGcal(status);
      } catch (error) {
        if (!cancelled) {
          setGcal({
            configured: false,
            connected: false,
            loadError: error.message || "Status nije učitan",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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

  async function connectGoogle() {
    setGcalBusy(true);
    try {
      const data = await api("/api/google/calendar/connect?returnTo=settings");
      window.location.href = data.url;
    } catch (error) {
      showToast?.(error.message || "Povezivanje nije uspelo", "error");
      setGcalBusy(false);
    }
  }

  async function disconnectGoogle() {
    const ok = await confirm({
      title: "Odvezati Google?",
      message: "Odvezati Google nalog za kalendar?",
      confirmLabel: "Odveži",
      cancelLabel: "Otkaži",
      danger: true,
    });
    if (!ok) return;
    setGcalBusy(true);
    try {
      await api("/api/google/calendar/account", { method: "DELETE" });
      setGcal((current) => ({
        ...(current || {}),
        connected: false,
        email: "",
        personalSyncEnabled: false,
      }));
      showToast?.("Google kalendar odvezan");
    } catch (error) {
      showToast?.(error.message || "Odvezivanje nije uspelo", "error");
    } finally {
      setGcalBusy(false);
    }
  }

  async function togglePersonalSync() {
    if (!gcal?.connected) return;
    setGcalBusy(true);
    try {
      const next = !gcal.personalSyncEnabled;
      const status = await api("/api/google/calendar/prefs", {
        method: "PATCH",
        body: { personalSyncEnabled: next, personalCalendarId: "primary" },
      });
      setGcal(status);
      showToast?.(next ? "Lični sync uključen" : "Lični sync isključen");
    } catch (error) {
      showToast?.(error.message || "Izmena nije uspela", "error");
    } finally {
      setGcalBusy(false);
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

      <section className="settings-card" aria-label="Google kalendar">
        <h2>Google kalendar</h2>
        <p className="settings-note">
          Odvojeno od prijave Google-om. Ovde daješ dozvolu da Chabar piše termine u kalendar. Kako radi:
          docs/google-calendar-sync.md
        </p>
        {!gcal ? (
          <p className="settings-note">Proveravam…</p>
        ) : gcal.loadError ? (
          <p className="settings-note">Greška: {gcal.loadError}</p>
        ) : !gcal.configured ? (
          <p className="settings-note">
            Google Calendar nije konfigurisan na serveru. Proveri `.env` i restartuj API (`npm run
            dev` / PM2).
          </p>
        ) : gcal?.connected ? (
          <>
            <p className="settings-note">Povezano: {gcal.email || "Google nalog"}</p>
            <label className="settings-row">
              <span>
                <strong>Lični sync</strong>
                <small>Ako bend nema kalendar, termini koje TI sačuvaš idu u tvoj primary — ne u tuđe</small>
              </span>
              <button
                type="button"
                className="settings-toggle"
                disabled={gcalBusy}
                onClick={togglePersonalSync}
                aria-pressed={gcal.personalSyncEnabled}
              >
                {gcal.personalSyncEnabled ? "Uključeno" : "Isključeno"}
              </button>
            </label>
            <button type="button" className="danger" disabled={gcalBusy} onClick={disconnectGoogle}>
              Odveži Google kalendar
            </button>
          </>
        ) : (
          <button type="button" disabled={gcalBusy} onClick={connectGoogle}>
            {gcalBusy ? "…" : "Poveži Google kalendar"}
          </button>
        )}
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
