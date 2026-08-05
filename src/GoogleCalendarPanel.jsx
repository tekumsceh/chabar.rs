import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { useConfirm } from "./confirmDialog.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

/**
 * Google Calendar connect + band shared link + per-member private calendar.
 * mode="account" — Settings: connect/disconnect only.
 * mode="band" — Band settings: full band + member prefs.
 */
export default function GoogleCalendarPanel({
  mode = "band",
  bandId = "",
  initialData = null,
  showToast,
  onChanged,
}) {
  const t = useT();
  const { confirm } = useConfirm();
  const [data, setData] = useState(initialData);
  const [calendars, setCalendars] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialData);

  const [bandCalendarId, setBandCalendarId] = useState("");
  const [memberCalendarId, setMemberCalendarId] = useState("primary");

  const refresh = useCallback(async () => {
    if (mode === "band" && bandId) {
      const payload = await api(`/api/bands/${bandId}/google-calendar`, { bandId });
      setData(payload);
      onChanged?.(payload);
      return payload;
    }
    const status = await api("/api/google/calendar/status");
    const wrapped = { configured: status.configured, account: status };
    setData(wrapped);
    onChanged?.(wrapped);
    return wrapped;
  }, [mode, bandId, onChanged]);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    }
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!initialData) await refresh();
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData, refresh]);

  useEffect(() => {
    if (data?.link?.calendarId) setBandCalendarId(data.link.calendarId);
    if (data?.memberPref?.calendarId) setMemberCalendarId(data.memberPref.calendarId);
    else if (data?.account?.personalCalendarId) setMemberCalendarId(data.account.personalCalendarId);
  }, [data]);

  useEffect(() => {
    if (!data?.account?.connected) {
      setCalendars([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/google/calendar/calendars");
        if (!cancelled) setCalendars(res.calendars || []);
      } catch {
        if (!cancelled) setCalendars([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.account?.connected]);

  if (loading) {
    return <p className="band-home-note">{t("common.loading")}</p>;
  }

  if (!data?.configured) {
    return <p className="band-home-note">{t("gcal.notConfigured")}</p>;
  }

  const connected = Boolean(data.account?.connected);
  const link = data.link || null;
  const memberPref = data.memberPref || null;
  const canManageLink = data.canManageLink !== false;

  async function connectGoogle() {
    setBusy(true);
    try {
      const returnTo = mode === "band" ? "band" : "settings";
      const res = await api(
        `/api/google/calendar/connect?returnTo=${returnTo}${bandId ? `&bandId=${encodeURIComponent(bandId)}` : ""}`,
      );
      window.location.href = res.url;
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
      setBusy(false);
    }
  }

  async function disconnectGoogle() {
    const ok = await confirm({
      title: t("gcal.disconnect"),
      message: t("gcal.disconnect"),
      confirmLabel: t("gcal.disconnect"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api("/api/google/calendar/account", { method: "DELETE" });
      await refresh();
      showToast?.(t("gcal.unlinked"));
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function linkBandCalendar() {
    if (!bandCalendarId) return;
    setBusy(true);
    try {
      const picked = calendars.find((c) => c.id === bandCalendarId);
      await api(`/api/bands/${bandId}/google-calendar`, {
        bandId,
        method: "PUT",
        body: {
          calendarId: bandCalendarId,
          summary: picked?.summary || "",
          syncEnabled: true,
        },
      });
      await refresh();
      showToast?.(t("gcal.saved"));
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBandSync(enabled) {
    setBusy(true);
    try {
      await api(`/api/bands/${bandId}/google-calendar`, {
        bandId,
        method: "PATCH",
        body: { syncEnabled: enabled },
      });
      await refresh();
      showToast?.(t("gcal.saved"));
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkBandCalendar() {
    const ok = await confirm({
      title: t("gcal.unlink"),
      message: t("gcal.unlink"),
      confirmLabel: t("gcal.unlink"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${bandId}/google-calendar`, { bandId, method: "DELETE" });
      await refresh();
      showToast?.(t("gcal.unlinked"));
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveMemberPref({ syncEnabled, calendarId }) {
    setBusy(true);
    try {
      await api(`/api/bands/${bandId}/google-calendar/member`, {
        bandId,
        method: "PATCH",
        body: {
          syncEnabled: syncEnabled ?? memberPref?.syncEnabled ?? false,
          calendarId: calendarId ?? memberCalendarId,
        },
      });
      await refresh();
      showToast?.(t("gcal.saved"));
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function pushToGoogle() {
    setBusy(true);
    try {
      const res = await api(`/api/bands/${bandId}/google-calendar/push`, {
        bandId,
        method: "POST",
      });
      showToast?.(
        t("gcal.pushed", { created: res.created || 0, linked: res.linked || 0 }),
      );
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function pullLinked() {
    setBusy(true);
    try {
      const res = await api(`/api/bands/${bandId}/google-calendar/pull`, {
        bandId,
        method: "POST",
        body: { mode: "linked" },
      });
      showToast?.(
        t("gcal.pulled", { updated: res.updated || 0, skipped: res.skipped || 0 }),
      );
      await refresh();
    } catch (error) {
      showToast?.(error.message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  function CalendarSelect({ id, value, onChange, disabled }) {
    return (
      <label className="band-share-field" htmlFor={id}>
        <span>{t("gcal.pickCalendar")}</span>
        <select id={id} value={value} disabled={disabled || busy} onChange={(e) => onChange(e.target.value)}>
          {!calendars.length ? <option value={value || "primary"}>{value || "primary"}</option> : null}
          {calendars.map((cal) => (
            <option key={cal.id} value={cal.id}>
              {cal.summary}
              {cal.primary ? " ★" : ""}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="gcal-panel">
      {!connected ? (
        <>
          <p className="band-home-note">{mode === "account" ? t("gcal.settingsHint") : t("gcal.connectFirst")}</p>
          <button type="button" className="band-home-side-action" disabled={busy} onClick={connectGoogle}>
            {t("gcal.connect")}
          </button>
        </>
      ) : (
        <>
          <p className="band-home-note">{t("gcal.connectedAs", { email: data.account.email || "Google" })}</p>
          {mode === "account" ? (
            <>
              <p className="band-home-note">{t("gcal.settingsHint")}</p>
              <button type="button" className="band-home-side-action" disabled={busy} onClick={disconnectGoogle}>
                {t("gcal.disconnect")}
              </button>
            </>
          ) : null}

          {mode === "band" ? (
            <>
              <div className="gcal-section">
                <strong>{t("gcal.bandShared")}</strong>
                <p className="band-home-note">{t("gcal.bandSharedHint")}</p>
                {canManageLink ? (
                  <>
                    {link ? (
                      <>
                        <p className="band-home-note">
                          {link.summary || link.calendarId}
                          {" · "}
                          {link.syncEnabled ? t("gcal.syncOn") : t("gcal.syncOff")}
                        </p>
                        <button
                          type="button"
                          className="band-home-side-action"
                          disabled={busy}
                          onClick={() => toggleBandSync(!link.syncEnabled)}
                        >
                          {link.syncEnabled ? t("gcal.syncOff") : t("gcal.syncOn")}
                        </button>
                        <CalendarSelect
                          id="gcal-band-calendar"
                          value={bandCalendarId || link.calendarId}
                          onChange={setBandCalendarId}
                        />
                        <button
                          type="button"
                          className="band-home-side-action"
                          disabled={busy || !bandCalendarId}
                          onClick={linkBandCalendar}
                        >
                          {t("gcal.link")}
                        </button>
                        <div className="band-share-actions">
                          <button type="button" className="band-home-side-action" disabled={busy || !link.syncEnabled} onClick={pushToGoogle}>
                            {t("gcal.push")}
                            <small>{t("gcal.pushHint")}</small>
                          </button>
                          <button type="button" className="band-home-side-action" disabled={busy || !link.syncEnabled} onClick={pullLinked}>
                            {t("gcal.pullLinked")}
                            <small>{t("gcal.pullLinkedHint")}</small>
                          </button>
                        </div>
                        <button type="button" className="band-home-side-action" disabled={busy} onClick={unlinkBandCalendar}>
                          {t("gcal.unlink")}
                        </button>
                      </>
                    ) : (
                      <>
                        <CalendarSelect
                          id="gcal-band-calendar"
                          value={bandCalendarId}
                          onChange={setBandCalendarId}
                        />
                        <button
                          type="button"
                          className="band-home-side-action"
                          disabled={busy || !bandCalendarId}
                          onClick={linkBandCalendar}
                        >
                          {t("gcal.link")}
                        </button>
                      </>
                    )}
                  </>
                ) : link ? (
                  <p className="band-home-note">
                    {link.summary || link.calendarId}
                    {" · "}
                    {link.syncEnabled ? t("gcal.syncOn") : t("gcal.syncOff")}
                  </p>
                ) : (
                  <p className="band-home-note">{t("gcal.connectorOnly")}</p>
                )}
              </div>

              <div className="gcal-section">
                <strong>{t("gcal.myCalendar")}</strong>
                <p className="band-home-note">{t("gcal.myCalendarHint")}</p>
                <label className="band-share-field gcal-toggle-row">
                  <span>{t("gcal.enableMySync")}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(memberPref?.syncEnabled)}
                    disabled={busy}
                    onChange={(e) => saveMemberPref({ syncEnabled: e.target.checked })}
                  />
                </label>
                <CalendarSelect
                  id="gcal-member-calendar"
                  value={memberCalendarId}
                  onChange={(id) => {
                    setMemberCalendarId(id);
                    if (memberPref?.syncEnabled) saveMemberPref({ calendarId: id });
                  }}
                />
                {!memberPref?.syncEnabled ? (
                  <button
                    type="button"
                    className="band-home-side-action"
                    disabled={busy}
                    onClick={() => saveMemberPref({ syncEnabled: true, calendarId: memberCalendarId })}
                  >
                    {t("gcal.link")}
                  </button>
                ) : null}
              </div>

              <button type="button" className="band-home-side-action" disabled={busy} onClick={disconnectGoogle}>
                {t("gcal.disconnect")}
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
