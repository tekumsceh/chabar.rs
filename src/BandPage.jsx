import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import { useConfirm } from "./confirmDialog.jsx";
import BandMemberFeesPanel from "./BandMemberFeesPanel.jsx";
import { parseDate, sameMonth, startOfToday, formatEur } from "./calculations.js";
import { joinUrlForToken, qrImageUrlForJoin } from "./joinLink.js";
import FadeScroll from "./FadeScroll.jsx";
import { GOOGLE_CALENDAR_SYNC } from "./featureFlags.js";
import GoogleCalendarPanel from "./GoogleCalendarPanel.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

const WEEKDAYS = ["P", "U", "S", "Č", "P", "S", "N"];
const SIDE_RATIO = 0.88;
const OPEN_THRESHOLD = 0.32;

function bandRoleT(t, role) {
  return t(`band.role.${role}`);
}

/**
 * Band home — calendar on the main pane;
 * swipe left (Viber-style) for members, management, and more.
 */
export default function BandPage({
  bands = [],
  activeBandId,
  allBandsId,
  isActive = true,
  authReady = true,
  onBandChange,
  onBack,
  onBandsChanged,
  showToast,
}) {
  const t = useT();
  const { confirm } = useConfirm();
  const isAllBands = activeBandId === allBandsId || !activeBandId;

  /** Band used for members / add-member tools (not calendar when “Svi”). */
  const manageBandId = useMemo(() => {
    if (!isAllBands) return activeBandId;
    return (
      bands.find((band) => band.kind === "group")?.id ||
      bands.find((band) => band.kind === "personal")?.id ||
      bands[0]?.id ||
      ""
    );
  }, [isAllBands, activeBandId, bands]);

  const [detail, setDetail] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const today = startOfToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  /** Active panel inside swipe «Upravljanje»: invite | kick | roles | fees | transfer | delete */
  const [managePanel, setManagePanel] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchSeq = useRef(0);

  const [sideOpen, setSideOpen] = useState(false);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);
  const panelWidthRef = useRef(280);
  const dragRef = useRef({
    active: false,
    tracking: false,
    startX: 0,
    startY: 0,
    origin: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
  });

  const colorByBandId = useMemo(() => {
    const map = new Map();
    for (const band of bands) {
      map.set(band.id, resolveBandColor(band, band.id));
    }
    return map;
  }, [bands]);

  // Members / invites for the focused band (when not “Svi”, that's the selection).
  useEffect(() => {
    let cancelled = false;
    if (!isActive || !authReady || !manageBandId || isAllBands) {
      if (!manageBandId || isAllBands) setDetail(null);
      return undefined;
    }
    (async () => {
      try {
        const data = await api(`/api/bands/${manageBandId}`, { bandId: manageBandId });
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manageBandId, isAllBands, isActive, authReady]);

  // Calendar dates from DB — all bands or one band.
  useEffect(() => {
    let cancelled = false;
    if (!isActive || !authReady) return undefined;
    (async () => {
      try {
        if (isAllBands) {
          const data = await api("/api/my-schedule?light=1");
          if (!cancelled) setCalendarEvents(data.events || []);
          return;
        }
        if (!activeBandId) {
          if (!cancelled) setCalendarEvents([]);
          return;
        }
        const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
        if (!cancelled) setCalendarEvents(data.events || []);
      } catch {
        if (!cancelled) setCalendarEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAllBands, activeBandId, isActive, authReady]);

  useEffect(() => {
    setManagePanel("");
    setQuery("");
    setSearchResults([]);
    setSideOpen(false);
    setDragPx(0);
    setDragging(false);
  }, [activeBandId]);

  useEffect(() => {
    const measure = () => {
      const width = rootRef.current?.clientWidth || 320;
      panelWidthRef.current = Math.round(width * SIDE_RATIO);
      setDragPx(sideOpen ? panelWidthRef.current : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sideOpen, activeBandId]);

  function toggleManagePanel(id) {
    setManagePanel((current) => {
      if (current === id) {
        setQuery("");
        setSearchResults([]);
        return "";
      }
      setQuery("");
      setSearchResults([]);
      return id;
    });
  }

  function openSide() {
    setSideOpen(true);
    setDragPx(panelWidthRef.current);
  }

  function closeSide() {
    setSideOpen(false);
    setDragPx(0);
  }

  function settleFromDrag() {
    const width = panelWidthRef.current || 1;
    const { velocity } = dragRef.current;
    const shouldOpen =
      velocity > 0.45 || (velocity > -0.35 && dragPx / width > OPEN_THRESHOLD);
    if (shouldOpen) openSide();
    else closeSide();
    setDragging(false);
    dragRef.current.active = false;
    dragRef.current.tracking = false;
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("input, textarea, select, button, a, label")) return;

    const width = rootRef.current?.clientWidth || 320;
    panelWidthRef.current = Math.round(width * SIDE_RATIO);
    const origin = sideOpen ? panelWidthRef.current : dragPx;

    dragRef.current = {
      active: true,
      tracking: false,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
    };
  }

  function onPointerMove(event) {
    const state = dragRef.current;
    if (!state.active) return;

    const dx = state.startX - event.clientX;
    const dy = Math.abs(event.clientY - state.startY);

    if (!state.tracking) {
      if (Math.abs(dx) < 10 && dy < 10) return;
      if (dy > Math.abs(dx)) {
        state.active = false;
        return;
      }
      state.tracking = true;
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // ignore
      }
    }

    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - state.lastT);
    state.velocity = (state.lastX - event.clientX) / dt;
    state.lastX = event.clientX;
    state.lastT = now;

    const width = panelWidthRef.current;
    setDragPx(Math.max(0, Math.min(width, state.origin + dx)));
  }

  function onPointerUp() {
    if (!dragRef.current.active && !dragging) return;
    if (dragRef.current.tracking || dragging) settleFromDrag();
    else {
      dragRef.current.active = false;
      setDragging(false);
    }
  }

  const band = !isAllBands
    ? detail?.band || bands.find((item) => item.id === activeBandId) || null
    : null;
  const permissions = detail?.permissions || {};
  const canInvite = Boolean(permissions.canInvite) && !isAllBands;
  const canKick = Boolean(permissions.canKick) && !isAllBands;
  const canAssignRoles = Boolean(permissions.canAssignRoles) && !isAllBands;
  const canManageFees = canAssignRoles;
  const canTransfer = Boolean(permissions.canTransfer) && !isAllBands;
  const canDelete = Boolean(permissions.canDelete) && !isAllBands;
  const isOwner = Boolean(permissions.isOwner) && !isAllBands;
  const isLead = Boolean(permissions.isLead) && !isAllBands;
  const members = detail?.members || [];
  const invites = detail?.invites || [];
  const bandColor = resolveBandColor(band, band?.id || activeBandId);
  const [sideSection, setSideSection] = useState("members");
  const [shareUrl, setShareUrl] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  function toggleSideSection(id) {
    setSideSection((current) => (current === id ? "" : id));
  }

  useEffect(() => {
    if (sideSection !== "sharing") return undefined;
    if (!canInvite || !manageBandId || band?.kind === "personal" || isAllBands) {
      setShareUrl("");
      setQrOpen(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setShareBusy(true);
      try {
        const data = await api(`/api/bands/${manageBandId}/invite-link`, { bandId: manageBandId });
        if (!cancelled) {
          setShareUrl(joinUrlForToken(data.token));
          setQrOpen(false);
        }
      } catch (error) {
        if (!cancelled) {
          setShareUrl("");
          showToast?.(error.message || t("band.linkNotLoaded"), "error");
        }
      } finally {
        if (!cancelled) setShareBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sideSection, canInvite, manageBandId, band?.kind, isAllBands, showToast]);

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast?.(t("toast.copied"));
    } catch {
      showToast?.(t("toast.copyFail"), "error");
    }
  }

  async function rotateShareLink() {
    if (!manageBandId || shareBusy) return;
    const ok = await confirm({
      title: t("band.confirmNewLink"),
      message: t("band.confirmNewLinkMessage"),
      confirmLabel: t("band.generateNew"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setShareBusy(true);
    try {
      const data = await api(`/api/bands/${manageBandId}/invite-link/rotate`, {
        method: "POST",
        bandId: manageBandId,
      });
      setShareUrl(joinUrlForToken(data.token));
      setQrOpen(false);
      showToast?.(t("band.newLinkReady"));
    } catch (error) {
      showToast?.(error.message || t("band.linkNotRotated"), "error");
    } finally {
      setShareBusy(false);
    }
  }

  /** day-of-month → events in the visible month */
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const event of calendarEvents) {
      const parsed = parseDate(event.date);
      if (Number.isNaN(parsed.getTime())) continue;
      if (!sameMonth(parsed, cursor)) continue;
      const day = parsed.getDate();
      const list = map.get(day) || [];
      list.push(event);
      map.set(day, list);
    }
    return map;
  }, [calendarEvents, cursor]);

  /** day-of-month → unique band colors for strips */
  const stripsByDay = useMemo(() => {
    const map = new Map();
    for (const [day, dayEvents] of eventsByDay) {
      const colors = [];
      for (const event of dayEvents) {
        const color =
          event.color ||
          colorByBandId.get(event.bandId) ||
          resolveBandColor({ id: event.bandId, name: event.bandName }, event.bandId);
        if (!colors.includes(color)) colors.push(color);
      }
      map.set(day, colors);
    }
    return map;
  }, [eventsByDay, colorByBandId]);

  const monthLabel = useMemo(
    () =>
      cursor.toLocaleDateString("sr-Latn-RS", {
        month: "long",
        year: "numeric",
      }),
    [cursor],
  );

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const today = startOfToday();
  const reveal = dragging ? dragPx : sideOpen ? panelWidthRef.current : dragPx;
  const panelWidth = panelWidthRef.current;
  const progress = panelWidth ? reveal / panelWidth : 0;

  useEffect(() => {
    if (managePanel !== "invite" || !activeBandId || isAllBands) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    const trimmed = query.trim();
    const seq = ++searchSeq.current;
    setSearching(true);
    const delay = trimmed ? 180 : 0;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ bandId: activeBandId });
        if (trimmed) params.set("q", trimmed);
        const data = await api(`/api/users/search?${params}`, { bandId: activeBandId });
        if (searchSeq.current !== seq) return;
        setSearchResults(data.users || []);
      } catch {
        if (searchSeq.current !== seq) return;
        setSearchResults([]);
      } finally {
        if (searchSeq.current === seq) setSearching(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [query, managePanel, activeBandId, isAllBands]);

  async function addMember(body) {
    if (!activeBandId || isAllBands || busy) return;
    setBusy(true);
    try {
      const result = await api(`/api/bands/${activeBandId}/members`, {
        method: "POST",
        bandId: activeBandId,
        body,
      });
      if (result.status === "invited") {
        showToast?.(
          result.registered
            ? t("band.inviteSentRegistered", { email: result.email })
            : t("band.inviteSaved", { email: result.email }),
        );
      } else {
        showToast?.(t("band.inviteGeneric", { email: result.email }));
      }
      setQuery("");
      setSearchResults([]);
      setManagePanel("");
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
      setCalendarEvents(data.events || []);
      await onBandsChanged?.();
    } catch (error) {
      showToast?.(error.message || t("band.addFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember(event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const match = searchResults.find(
      (user) =>
        String(user.email || "").toLowerCase() === trimmed.toLowerCase() ||
        String(user.displayName || "").toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      await addMember({ userId: match.id });
      return;
    }

    if (trimmed.includes("@")) {
      await addMember({ email: trimmed });
      return;
    }

    showToast?.(t("band.pickUserOrEmail"), "error");
  }

  async function handlePickUser(user) {
    await addMember({ userId: user.id });
  }

  async function handleSetRole(member, memberRole) {
    if (!activeBandId || isAllBands || busy || !canAssignRoles) return;
    if (member.memberRole === "owner") return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}/members/${member.id}`, {
        method: "PATCH",
        bandId: activeBandId,
        body: { memberRole },
      });
      showToast?.(t("band.roleChanged", { name: member.name, role: bandRoleT(t, memberRole) }));
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
      await onBandsChanged?.();
    } catch (error) {
      showToast?.(error.message || t("band.roleNotChanged"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleInvite(member) {
    if (!activeBandId || isAllBands || busy || !canAssignRoles) return;
    if (member.memberRole === "owner") return;
    setBusy(true);
    try {
      const next = !member.canInvite;
      await api(`/api/bands/${activeBandId}/members/${member.id}/invite`, {
        method: "PATCH",
        bandId: activeBandId,
        body: { canInvite: next },
      });
      showToast?.(
        next ? t("band.canInviteOn", { name: member.name }) : t("band.canInviteOff", { name: member.name }),
      );
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
    } catch (error) {
      showToast?.(error.message || t("band.invitePermNotChanged"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleKick(member) {
    if (!activeBandId || isAllBands || busy || !canKick) return;
    if (member.memberRole === "owner") return;
    if (isLead && member.memberRole !== "member") return;
    const ok = await confirm({
      title: t("band.confirmKick"),
      message: t("band.confirmKickMessage", { name: member.name }),
      confirmLabel: t("band.kick"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}/members/${member.id}`, {
        method: "DELETE",
        bandId: activeBandId,
      });
      showToast?.(t("band.removed", { name: member.name }));
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
      setCalendarEvents(data.events || []);
      await onBandsChanged?.();
    } catch (error) {
      showToast?.(error.message || t("band.removeFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(member) {
    if (!activeBandId || isAllBands || busy || !canTransfer) return;
    const ok = await confirm({
      title: t("band.confirmTransfer"),
      message: t("band.confirmTransferMessage", { name: member.name }),
      confirmLabel: t("band.transferBtn"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}/transfer`, {
        method: "POST",
        bandId: activeBandId,
        body: { userId: member.id },
      });
      showToast?.(t("band.ownershipTransferred", { name: member.name }));
      setManagePanel("");
      await onBandsChanged?.();
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
    } catch (error) {
      showToast?.(error.message || t("band.transferFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBand() {
    if (!activeBandId || isAllBands || busy || !canDelete) return;
    const name = band?.name || t("band.thisBand");
    const ok = await confirm({
      title: t("band.confirmDelete"),
      message: t("band.confirmDeleteMessage", { name }),
      confirmLabel: t("band.delete"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}`, { method: "DELETE", bandId: activeBandId });
      showToast?.(t("band.deleted", { name }));
      setManagePanel("");
      await onBandsChanged?.();
      onBandChange?.(allBandsId);
      onBack?.();
    } catch (error) {
      showToast?.(error.message || t("band.deleteFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const title = isAllBands ? t("common.allBands") : band?.name || t("band.title");
  const subtitle = isAllBands
    ? t("band.calendarAll")
    : band?.kind === "personal"
      ? t("band.personalSpace")
      : t(members.length === 1 ? "band.memberCountOne" : "band.memberCountMany", {
          count: members.length,
        });

  return (
    <section
      ref={rootRef}
      className={`band-home ${sideOpen || reveal > 0 ? "is-side-open" : ""} ${dragging ? "is-dragging" : ""}`}
    >
      <div
        className="band-home-stage"
        style={{ transform: `translate3d(${-reveal}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="band-home-main">
          <header className="band-home-top">
            <button
              type="button"
              className="band-home-back"
              aria-label={t("band.backToSchedule")}
              title={t("band.backToSchedule")}
              onClick={() => onBack?.()}
            >
              <ChevronLeftIcon />
            </button>
            <button type="button" className="band-home-title-tap" onClick={openSide} aria-label={t("band.openInfo")}>
              <div className="band-home-title-wrap">
                <h2 className="band-home-title">{title}</h2>
                <p className="band-home-sub">{subtitle}</p>
              </div>
            </button>
            <button
              type="button"
              className="band-home-info"
              aria-label={t("band.moreAbout")}
              title={t("band.more")}
              onClick={openSide}
            >
              <InfoIcon />
            </button>
          </header>

          <div className="band-cal" aria-label={t("band.calendar")}>
            <div className="band-cal-nav">
              <button
                type="button"
                className="band-cal-nav-btn"
                aria-label={t("band.prevMonth")}
                title={t("band.prevMonth")}
                onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              >
                <ChevronLeftIcon />
              </button>
              <h3 className="band-cal-month">{monthLabel}</h3>
              <button
                type="button"
                className="band-cal-nav-btn"
                aria-label={t("band.nextMonth")}
                title={t("band.nextMonth")}
                onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
            <div className="band-cal-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>
            <div className="band-cal-grid">
              {cells.map((cell) => {
                const inMonth = cell.getMonth() === cursor.getMonth();
                const isToday =
                  cell.getFullYear() === today.getFullYear() &&
                  cell.getMonth() === today.getMonth() &&
                  cell.getDate() === today.getDate();
                const dayKey = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`;
                const strips = inMonth ? stripsByDay.get(cell.getDate()) || [] : [];
                const dayEvents = inMonth ? eventsByDay.get(cell.getDate()) || [] : [];
                const briefs = dayEvents.map(eventLocationBrief).filter(Boolean);
                return (
                  <span
                    key={dayKey}
                    className={[
                      "band-cal-cell",
                      inMonth ? "" : "is-outside",
                      isToday ? "is-today" : "",
                      dayEvents.length ? "has-event" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    tabIndex={dayEvents.length ? 0 : undefined}
                  >
                    <span className="band-cal-daynum">{cell.getDate()}</span>
                    {strips.length ? (
                      <span className="band-cal-strips" aria-hidden="true">
                        {strips.map((color) => (
                          <span key={color} className="band-cal-strip" style={{ background: color }} />
                        ))}
                      </span>
                    ) : (
                      <span className="band-cal-strips is-blank" aria-hidden="true" />
                    )}
                    {briefs.length ? (
                      <span className="band-cal-pop" role="tooltip">
                        {briefs.map((line, index) => (
                          <span key={`${dayKey}-pop-${index}`} className="band-cal-pop-line">
                            {line}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>

          {isAllBands ? <p className="band-home-note">{t("band.selectForTools")}</p> : null}
          {!isAllBands ? (
            <p className="band-home-swipe-hint" aria-hidden="true">
              {t("band.swipeHint")}
            </p>
          ) : null}
        </div>

        <aside
          className="band-home-side"
          style={{ width: panelWidth }}
          aria-hidden={progress < 0.05}
          id="band-home-side"
        >
          <header className="band-home-side-top">
            <button type="button" className="band-home-back" onClick={closeSide} aria-label={t("common.close")}>
              <ChevronLeftIcon />
            </button>
            <div className="band-home-title-wrap">
              <h2 className="band-home-title">{t("band.more")}</h2>
              <p className="band-home-sub">{t("band.closeSwipe")}</p>
            </div>
          </header>

          <div className="band-home-side-body">
            <div className="band-home-side-hero">
              <span className="band-home-avatar" style={{ backgroundColor: bandColor }} aria-hidden="true">
                {bandInitials(band?.name || title)}
              </span>
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>

            <div className="band-accordion" role="list">
              <BandAccordionSection
                id="members"
                title={`${t("band.members")}${members.length ? ` · ${members.length}` : ""}`}
                open={sideSection === "members"}
                onToggle={toggleSideSection}
              >
                {isAllBands ? (
                  <p className="band-home-note">{t("band.selectForMembers")}</p>
                ) : band?.kind === "personal" ? (
                  <p className="band-home-note">{t("band.personalNoMembers")}</p>
                ) : (
                  <ul className="band-home-side-members">
                    {members.map((member) => (
                      <li key={member.id}>
                        <span className="band-home-avatar is-sm" aria-hidden="true">
                          {bandInitials(member.name)}
                        </span>
                        <span className="band-home-side-member-text">
                          <strong>{member.name}</strong>
                          {member.email ? <small>{member.email}</small> : null}
                        </span>
                        <span className="band-home-side-role">{bandRoleT(t, member.memberRole)}</span>
                        {canManageFees && member.defaultPriceEur != null ? (
                          <span className="band-home-side-fee" title={t("finance.defaultShort")}>
                            {formatEur(member.defaultPriceEur)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                    {invites.map((invite) => (
                      <li key={invite.id} className="is-pending">
                        <span className="band-home-avatar is-sm is-pending" aria-hidden="true">
                          ?
                        </span>
                        <span className="band-home-side-member-text">
                          <strong>{invite.email}</strong>
                          <small>{t("band.awaitingConfirm")}</small>
                        </span>
                        <span className="band-home-side-role">{t("band.inviteBadge")}</span>
                      </li>
                    ))}
                    {!members.length && !invites.length ? (
                      <li className="band-home-side-empty">{t("band.noMembersLoaded")}</li>
                    ) : null}
                  </ul>
                )}
              </BandAccordionSection>

              <BandAccordionSection
                id="manage"
                title={t("band.manage")}
                open={sideSection === "manage"}
                onToggle={toggleSideSection}
              >
                {isAllBands ? (
                  <p className="band-home-note">{t("band.selectForManage")}</p>
                ) : band?.kind === "personal" ? (
                  <p className="band-home-note">{t("band.personalNoManage")}</p>
                ) : (
                  <>
                    <div className="band-share-actions band-manage-actions">
                      <button
                        type="button"
                        className={`band-home-side-action ${managePanel === "invite" ? "is-active" : ""}`}
                        disabled={!canInvite}
                        onClick={() => toggleManagePanel("invite")}
                      >
                        {t("band.inviteMember")}
                        <small>{canInvite ? t("band.sendInvite") : t("band.noPermission")}</small>
                      </button>
                      <button
                        type="button"
                        className={`band-home-side-action ${managePanel === "kick" ? "is-active" : ""}`}
                        disabled={!canKick}
                        onClick={() => toggleManagePanel("kick")}
                      >
                        {t("band.removeMember")}
                        <small>{canKick ? t("band.fromBand") : t("band.ownerLeadOnly")}</small>
                      </button>
                      <button
                        type="button"
                        className={`band-home-side-action ${managePanel === "roles" ? "is-active" : ""}`}
                        disabled={!canAssignRoles}
                        onClick={() => toggleManagePanel("roles")}
                      >
                        {t("band.rolesAndInvites")}
                        <small>{canAssignRoles ? t("band.rolesHint") : t("band.ownerLeadOnly")}</small>
                      </button>
                      <button
                        type="button"
                        className={`band-home-side-action ${managePanel === "fees" ? "is-active" : ""}`}
                        disabled={!canManageFees}
                        onClick={() => toggleManagePanel("fees")}
                      >
                        {t("band.memberFees")}
                        <small>{canManageFees ? t("band.feesHintShort") : t("band.ownerLeadOnly")}</small>
                      </button>
                      {canTransfer ? (
                        <button
                          type="button"
                          className={`band-home-side-action ${managePanel === "transfer" ? "is-active" : ""}`}
                          onClick={() => toggleManagePanel("transfer")}
                        >
                          {t("band.transfer")}
                          <small>{t("band.transferYouLead")}</small>
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className={`band-home-side-action band-home-side-action-danger ${managePanel === "delete" ? "is-active" : ""}`}
                          onClick={() => toggleManagePanel("delete")}
                        >
                          {t("band.delete")}
                          <small>{t("band.deletePermanent")}</small>
                        </button>
                      ) : null}
                    </div>

                    {managePanel === "invite" && canInvite ? (
                      <form className="band-add-form band-manage-panel" onSubmit={handleAddMember}>
                        <label className="band-add-label" htmlFor="band-add-search">
                          {t("band.searchMemberLabel")}
                        </label>
                        <div className="band-add-row">
                          <input
                            id="band-add-search"
                            type="search"
                            autoComplete="off"
                            autoFocus
                            placeholder={t("band.searchMember")}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                          />
                          <button type="submit" className="band-add-submit" disabled={busy || !query.trim()}>
                            {busy ? "…" : t("band.invite")}
                          </button>
                        </div>
                        <FadeScroll className="fade-scroll-inset band-user-results-scroll">
                          <ul className="band-user-results" role="listbox" aria-label={t("band.registeredUsers")}>
                            {searching && searchResults.length === 0 ? (
                              <li className="band-user-empty">{t("common.loading")}</li>
                            ) : null}
                            {!searching && searchResults.length === 0 ? (
                              <li className="band-user-empty">{t("band.noOtherUsers")}</li>
                            ) : null}
                            {searchResults.map((user) => (
                              <li key={user.id}>
                                <button
                                  type="button"
                                  className="band-user-result"
                                  role="option"
                                  disabled={busy}
                                  onClick={() => handlePickUser(user)}
                                >
                                  <span className="band-user-result-name">{user.displayName}</span>
                                  <span className="band-user-result-email">{user.email}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </FadeScroll>
                        <p className="band-add-hint">{t("band.inviteHint")}</p>
                      </form>
                    ) : null}

                    {managePanel === "kick" && canKick ? (
                      <div className="band-role-panel band-manage-panel" aria-label={t("band.removeMember")}>
                        <p className="band-add-hint">
                          {isOwner ? t("band.kickHintOwner") : t("band.kickHintLead")}
                        </p>
                        <ul className="band-member-list">
                          {members
                            .filter((member) => {
                              if (member.memberRole === "owner") return false;
                              if (isLead && member.memberRole !== "member" && member.memberRole !== "saradnik")
                                return false;
                              return true;
                            })
                            .map((member) => (
                              <li key={member.id} className="band-member-row band-role-row">
                                <span className="band-member-name">{member.name}</span>
                                <button
                                  type="button"
                                  className="band-kick-btn"
                                  disabled={busy}
                                  onClick={() => handleKick(member)}
                                >
                                  {t("band.kick")}
                                </button>
                              </li>
                            ))}
                        </ul>
                        {!members.some((member) => {
                          if (member.memberRole === "owner") return false;
                          if (isLead && member.memberRole !== "member" && member.memberRole !== "saradnik")
                            return false;
                          return true;
                        }) ? (
                          <p className="band-home-note">{t("band.noMembersToKick")}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {managePanel === "roles" && canAssignRoles ? (
                      <div className="band-role-panel band-manage-panel" aria-label={t("band.rolesPanel")}>
                        <p className="band-add-hint">
                          {isOwner ? t("band.rolesHintOwner") : t("band.rolesHintLead")}
                        </p>
                        <ul className="band-member-list">
                          {members
                            .filter((member) => member.memberRole !== "owner")
                            .map((member) => {
                              const leadCanTouch =
                                isOwner ||
                                (isLead && (member.memberRole === "member" || member.memberRole === "saradnik"));
                              const canSetSaradnik = isOwner || (isLead && member.memberRole !== "lead");
                              const canToggleInvite =
                                (isOwner || (isLead && member.memberRole === "member")) &&
                                member.memberRole !== "saradnik";
                              return (
                                <li key={member.id} className="band-member-row band-role-row band-role-row-stack">
                                  <div className="band-role-row-top">
                                    <span className="band-member-name">{member.name}</span>
                                    <span className="band-member-role">{bandRoleT(t, member.memberRole)}</span>
                                  </div>
                                  <div className="band-role-actions">
                                    <button
                                      type="button"
                                      className={member.memberRole === "lead" ? "is-active" : ""}
                                      disabled={busy || member.memberRole === "lead" || !leadCanTouch}
                                      onClick={() => handleSetRole(member, "lead")}
                                    >
                                      {t("band.role.lead")}
                                    </button>
                                    <button
                                      type="button"
                                      className={member.memberRole === "member" ? "is-active" : ""}
                                      disabled={
                                        busy ||
                                        member.memberRole === "member" ||
                                        !(isOwner || (isLead && member.memberRole === "saradnik"))
                                      }
                                      onClick={() => handleSetRole(member, "member")}
                                    >
                                      {t("band.role.member")}
                                    </button>
                                    <button
                                      type="button"
                                      className={member.memberRole === "saradnik" ? "is-active" : ""}
                                      disabled={busy || member.memberRole === "saradnik" || !canSetSaradnik}
                                      onClick={() => handleSetRole(member, "saradnik")}
                                      title={t("band.saradnikTitle")}
                                    >
                                      {t("band.role.saradnik")}
                                    </button>
                                    <button
                                      type="button"
                                      className={member.canInvite ? "is-active" : ""}
                                      disabled={busy || !canToggleInvite}
                                      title={t("band.invitePermTitle")}
                                      onClick={() => handleToggleInvite(member)}
                                    >
                                      {t("band.inviteShort")}
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                        {!members.some((member) => member.memberRole !== "owner") ? (
                          <p className="band-home-note">{t("band.noOtherMembers")}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {managePanel === "fees" && canManageFees ? (
                      <BandMemberFeesPanel
                        bandId={activeBandId}
                        members={members}
                        busy={busy}
                        showToast={showToast}
                        onSaved={async () => {
                          const data = await api(`/api/bands/${activeBandId}`, {
                            bandId: activeBandId,
                          });
                          setDetail(data);
                        }}
                      />
                    ) : null}

                    {managePanel === "transfer" && canTransfer ? (
                      <div className="band-role-panel band-manage-panel" aria-label={t("band.transferPanel")}>
                        <p className="band-add-hint">{t("band.transferHint")}</p>
                        <ul className="band-member-list">
                          {members
                            .filter((member) => member.memberRole !== "owner")
                            .map((member) => (
                              <li key={member.id} className="band-member-row band-role-row">
                                <span className="band-member-name">{member.name}</span>
                                <button
                                  type="button"
                                  className="band-transfer-btn"
                                  disabled={busy}
                                  onClick={() => handleTransfer(member)}
                                >
                                  {t("band.transferBtn")}
                                </button>
                              </li>
                            ))}
                        </ul>
                        {!members.some((member) => member.memberRole !== "owner") ? (
                          <p className="band-home-note">{t("band.noTransferTarget")}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {managePanel === "delete" && canDelete ? (
                      <div className="band-role-panel band-manage-panel band-danger-zone" aria-label={t("band.deleteZone")}>
                        <p className="band-add-hint">{t("band.deleteHint")}</p>
                        <button type="button" className="band-delete-btn" disabled={busy} onClick={handleDeleteBand}>
                          {t("band.delete")}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </BandAccordionSection>

              <BandAccordionSection
                id="media"
                title={t("band.media")}
                open={sideSection === "media"}
                onToggle={toggleSideSection}
              >
                <p className="band-home-note">{t("band.mediaSoon")}</p>
              </BandAccordionSection>

              <BandAccordionSection
                id="notifications"
                title={t("band.notifications")}
                open={sideSection === "notifications"}
                onToggle={toggleSideSection}
              >
                <p className="band-home-note">{t("band.notificationsSoon")}</p>
              </BandAccordionSection>

              <BandAccordionSection
                id="sharing"
                title={t("band.sharing")}
                open={sideSection === "sharing"}
                onToggle={toggleSideSection}
              >
                {isAllBands ? (
                  <p className="band-home-note">{t("band.selectForShare")}</p>
                ) : band?.kind === "personal" ? (
                  <p className="band-home-note">{t("band.personalNoShare")}</p>
                ) : !canInvite ? (
                  <p className="band-home-note">{t("band.noSharePermission")}</p>
                ) : (
                  <div className="band-share">
                    <p className="band-home-note">{t("band.shareHint")}</p>
                    <label className="band-share-field">
                      <span>{t("band.inviteLink")}</span>
                      <input
                        id="band-share-url"
                        name="band-share-url"
                        type="text"
                        readOnly
                        autoComplete="off"
                        value={shareBusy && !shareUrl ? t("band.loadingShare") : shareUrl}
                      />
                    </label>
                    <div className="band-share-actions">
                      <button type="button" className="band-home-side-action" disabled={!shareUrl || shareBusy} onClick={copyShareLink}>
                        {t("band.copyLink")}
                        <small>{t("band.copyLinkHint")}</small>
                      </button>
                      <button
                        type="button"
                        className="band-home-side-action"
                        disabled={!shareUrl || shareBusy}
                        onClick={() => setQrOpen((open) => !open)}
                      >
                        {qrOpen ? t("band.hideQr") : t("band.showQr")}
                        <small>{t("band.qrSameLink")}</small>
                      </button>
                      <button
                        type="button"
                        className="band-home-side-action"
                        disabled={shareBusy}
                        onClick={rotateShareLink}
                      >
                        {t("band.newLink")}
                        <small>{t("band.oldLinkInvalid")}</small>
                      </button>
                    </div>
                    {qrOpen && shareUrl ? (
                      <div className="band-share-qr">
                        <img src={qrImageUrlForJoin(shareUrl, 220)} alt={t("band.qrAlt")} width={220} height={220} />
                        <p className="band-home-note">{t("band.qrScanHint")}</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </BandAccordionSection>

              <BandAccordionSection
                id="settings"
                title={t("band.settings")}
                open={sideSection === "settings"}
                onToggle={toggleSideSection}
              >
                {isAllBands ? (
                  <p className="band-home-note">{t("band.selectForSettings")}</p>
                ) : GOOGLE_CALENDAR_SYNC ? (
                  <GoogleCalendarPanel
                    mode="band"
                    bandId={activeBandId}
                    initialData={detail?.googleCalendar}
                    showToast={showToast}
                    onChanged={async () => {
                      try {
                        const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
                        setDetail(data);
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                ) : (
                  <p className="band-home-note">{t("band.settingsSoon")}</p>
                )}
              </BandAccordionSection>
            </div>
          </div>
        </aside>
      </div>

      {reveal > 8 ? (
        <button
          type="button"
          className="band-home-scrim"
          style={{ opacity: Math.min(0.45, progress * 0.45) }}
          aria-label={t("band.closePanel")}
          onClick={closeSide}
        />
      ) : null}
    </section>
  );
}


function BandAccordionSection({ id, title, open, onToggle, children }) {
  return (
    <section className={`band-accordion-item ${open ? "is-open" : ""}`} role="listitem">
      <h3 className="band-accordion-heading">
        <button
          type="button"
          className="band-accordion-trigger"
          aria-expanded={open}
          aria-controls={`band-acc-${id}`}
          id={`band-acc-btn-${id}`}
          onClick={() => onToggle(id)}
        >
          <span>{title}</span>
          <span className="band-accordion-chevron" aria-hidden="true">
            <AccordionChevronIcon />
          </span>
        </button>
      </h3>
      {open ? (
        <div
          className="band-accordion-panel"
          id={`band-acc-${id}`}
          role="region"
          aria-labelledby={`band-acc-btn-${id}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function AccordionChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8 10l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Always 6 weeks (42 cells), Mon–Sun, with adjacent-month days filled in. */
function buildMonthCells(monthStart) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(year, month, 1 - startPad);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

/** Popup line: city · venue when venue is set, otherwise city only. */
function eventLocationBrief(event) {
  const city = String(event?.city || "").trim();
  const venue = String(event?.venue || "").trim();
  if (venue) return city ? `${city} · ${venue}` : venue;
  return city;
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9.5 5.5 16 12l-6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
