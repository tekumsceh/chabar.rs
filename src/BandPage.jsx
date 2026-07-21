import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import { useConfirm } from "./confirmDialog.jsx";
import { bandRoleLabel } from "../shared/roles.js";
import { parseDate, sameMonth, startOfToday } from "./calculations.js";
import { joinUrlForToken, qrImageUrlForJoin } from "./joinLink.js";

const WEEKDAYS = ["P", "U", "S", "Č", "P", "S", "N"];
const SIDE_RATIO = 0.88;
const OPEN_THRESHOLD = 0.32;

/**
 * Band home — calendar + tools on the main pane;
 * swipe left (Viber-style) for members and more.
 */
export default function BandPage({
  bands = [],
  activeBandId,
  allBandsId,
  onBandChange,
  onBack,
  onBandsChanged,
  showToast,
}) {
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
  const [addOpen, setAddOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
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
    if (!manageBandId || isAllBands) {
      setDetail(null);
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
  }, [manageBandId, isAllBands]);

  // Calendar dates from DB — all bands or one band.
  useEffect(() => {
    let cancelled = false;
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
  }, [isAllBands, activeBandId]);

  useEffect(() => {
    setAddOpen(false);
    setRoleOpen(false);
    setKickOpen(false);
    setOwnerOpen(false);
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

  function closeToolPanels() {
    setAddOpen(false);
    setRoleOpen(false);
    setKickOpen(false);
    setOwnerOpen(false);
    setQuery("");
    setSearchResults([]);
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
          showToast?.(error.message || "Link nije učitan", "error");
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
      showToast?.("Link kopiran");
    } catch {
      showToast?.("Kopiranje nije uspelo", "error");
    }
  }

  async function rotateShareLink() {
    if (!manageBandId || shareBusy) return;
    const ok = await confirm({
      title: "Novi link?",
      message: "Stari link i QR prestaju da važe. Nastaviti?",
      confirmLabel: "Generiši novi",
      cancelLabel: "Otkaži",
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
      showToast?.("Novi link je spreman");
    } catch (error) {
      showToast?.(error.message || "Link nije obnovljen", "error");
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
    if (!addOpen || !activeBandId || isAllBands) {
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
  }, [query, addOpen, activeBandId, isAllBands]);

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
            ? `Pozivnica poslata: ${result.email} (čeka potvrdu)`
            : `Pozivnica sačuvana: ${result.email}`,
        );
      } else {
        showToast?.(`Pozivnica: ${result.email}`);
      }
      setQuery("");
      setSearchResults([]);
      setAddOpen(false);
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
      setCalendarEvents(data.events || []);
      await onBandsChanged?.();
    } catch (error) {
      showToast?.(error.message || "Dodavanje nije uspelo", "error");
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

    showToast?.("Izaberi korisnika iz liste ili unesi email za pozivnicu.", "error");
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
      showToast?.(`${member.name}: ${bandRoleLabel(memberRole)}`);
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
      await onBandsChanged?.();
    } catch (error) {
      showToast?.(error.message || "Uloga nije promenjena", "error");
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
      showToast?.(next ? `${member.name}: može pozivati` : `${member.name}: bez pozivnica`);
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
    } catch (error) {
      showToast?.(error.message || "Dozvola nije promenjena", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleKick(member) {
    if (!activeBandId || isAllBands || busy || !canKick) return;
    if (member.memberRole === "owner") return;
    if (isLead && member.memberRole !== "member") return;
    const ok = await confirm({
      title: "Ukloniti člana?",
      message: `${member.name} će biti uklonjen/a iz benda.`,
      confirmLabel: "Ukloni",
      cancelLabel: "Otkaži",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}/members/${member.id}`, {
        method: "DELETE",
        bandId: activeBandId,
      });
      showToast?.(`Uklonjen/a: ${member.name}`);
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
      setCalendarEvents(data.events || []);
      await onBandsChanged?.();
    } catch (error) {
      showToast?.(error.message || "Uklanjanje nije uspelo", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(member) {
    if (!activeBandId || isAllBands || busy || !canTransfer) return;
    const ok = await confirm({
      title: "Preneti vlasništvo?",
      message: `Preneti vlasništvo na ${member.name}?\nTi postaješ lead. Ovo ne možeš poništiti sam/a.`,
      confirmLabel: "Prenesi",
      cancelLabel: "Otkaži",
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
      showToast?.(`Vlasništvo: ${member.name}`);
      setOwnerOpen(false);
      await onBandsChanged?.();
      const data = await api(`/api/bands/${activeBandId}`, { bandId: activeBandId });
      setDetail(data);
    } catch (error) {
      showToast?.(error.message || "Prenos nije uspeo", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBand() {
    if (!activeBandId || isAllBands || busy || !canDelete) return;
    const name = band?.name || "ovaj bend";
    const ok = await confirm({
      title: "Obrisati bend?",
      message: `Trajno obrisati bend „${name}“?\nTermini i članstva nestaju. Nema povratka.`,
      confirmLabel: "Obriši bend",
      cancelLabel: "Otkaži",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}`, { method: "DELETE", bandId: activeBandId });
      showToast?.(`Obrisan bend: ${name}`);
      setOwnerOpen(false);
      await onBandsChanged?.();
      onBandChange?.(allBandsId);
      onBack?.();
    } catch (error) {
      showToast?.(error.message || "Brisanje nije uspelo", "error");
    } finally {
      setBusy(false);
    }
  }

  const title = isAllBands ? "Svi bendovi" : band?.name || "Bend";
  const subtitle = isAllBands
    ? "Kalendar svih termina"
    : band?.kind === "personal"
      ? "Lični prostor"
      : `${members.length} ${members.length === 1 ? "član" : "članova"}`;

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
              aria-label="Nazad na raspored"
              title="Nazad na raspored"
              onClick={() => onBack?.()}
            >
              <ChevronLeftIcon />
            </button>
            <button type="button" className="band-home-title-tap" onClick={openSide} aria-label="Otvori info benda">
              <div className="band-home-title-wrap">
                <h2 className="band-home-title">{title}</h2>
                <p className="band-home-sub">{subtitle}</p>
              </div>
            </button>
            <button
              type="button"
              className="band-home-info"
              aria-label="Više o bendu"
              title="Više"
              onClick={openSide}
            >
              <InfoIcon />
            </button>
          </header>

          <div className="band-cal" aria-label="Kalendar benda">
            <div className="band-cal-nav">
              <button
                type="button"
                className="band-cal-nav-btn"
                aria-label="Prethodni mesec"
                title="Prethodni mesec"
                onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              >
                <ChevronLeftIcon />
              </button>
              <h3 className="band-cal-month">{monthLabel}</h3>
              <button
                type="button"
                className="band-cal-nav-btn"
                aria-label="Sledeći mesec"
                title="Sledeći mesec"
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

          <div className="band-tools" role="toolbar" aria-label="Alati benda">
            <button
              type="button"
              className={`band-tool-btn ${addOpen ? "is-active" : ""}`}
              aria-label="Pozovi člana"
              title={isAllBands ? "Izaberi bend" : canInvite ? "Pošalji pozivnicu" : "Nemaš dozvolu za pozivnice"}
              disabled={!canInvite}
              onClick={() => {
                if (addOpen) {
                  closeToolPanels();
                  return;
                }
                closeToolPanels();
                setAddOpen(true);
              }}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className={`band-tool-btn ${kickOpen ? "is-active" : ""}`}
              aria-label="Ukloni člana"
              title={canKick ? "Ukloni člana" : isAllBands ? "Izaberi bend" : "Samo vlasnik / lead"}
              disabled={!canKick}
              onClick={() => {
                if (kickOpen) {
                  closeToolPanels();
                  return;
                }
                closeToolPanels();
                setKickOpen(true);
              }}
            >
              <MinusIcon />
            </button>
            <button
              type="button"
              className={`band-tool-btn ${roleOpen ? "is-active" : ""}`}
              aria-label="Uloge i pozivnice"
              title={
                canAssignRoles
                  ? "Uloge i dozvola za pozivnice"
                  : isAllBands
                    ? "Izaberi bend"
                    : "Samo vlasnik / lead"
              }
              disabled={!canAssignRoles}
              onClick={() => {
                if (roleOpen) {
                  closeToolPanels();
                  return;
                }
                closeToolPanels();
                setRoleOpen(true);
              }}
            >
              <RoleIcon />
            </button>
            <button
              type="button"
              className={`band-tool-btn ${ownerOpen ? "is-active" : ""}`}
              aria-label="Vlasništvo benda"
              title={canTransfer || canDelete ? "Prenos vlasništva / brisanje" : "Samo vlasnik"}
              disabled={!canTransfer && !canDelete}
              onClick={() => {
                if (ownerOpen) {
                  closeToolPanels();
                  return;
                }
                closeToolPanels();
                setOwnerOpen(true);
              }}
            >
              <CrownIcon />
            </button>
          </div>

          {addOpen && canInvite ? (
            <form className="band-add-form" onSubmit={handleAddMember}>
              <label className="band-add-label" htmlFor="band-add-search">
                Traži člana
              </label>
              <div className="band-add-row">
                <input
                  id="band-add-search"
                  type="search"
                  autoComplete="off"
                  autoFocus
                  placeholder="Ime ili email…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button type="submit" className="band-add-submit" disabled={busy || !query.trim()}>
                  {busy ? "…" : "Pozovi"}
                </button>
              </div>
              <ul className="band-user-results" role="listbox" aria-label="Registrovani korisnici">
                {searching && searchResults.length === 0 ? <li className="band-user-empty">Učitavam…</li> : null}
                {!searching && searchResults.length === 0 ? (
                  <li className="band-user-empty">
                    Nema drugih registrovanih. Unesi email i pritisni Pozovi.
                  </li>
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
              <p className="band-add-hint">Šalje se pozivnica — ulaze tek kad potvrde.</p>
            </form>
          ) : null}

          {kickOpen && canKick ? (
            <div className="band-role-panel" aria-label="Ukloni člana">
              <p className="band-add-hint">
                {isOwner ? "Ukloni lead ili člana." : "Lead može ukloniti samo obične članove."}
              </p>
              <ul className="band-member-list">
                {members
                  .filter((member) => {
                    if (member.memberRole === "owner") return false;
                    if (isLead && member.memberRole !== "member") return false;
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
                        Ukloni
                      </button>
                    </li>
                  ))}
              </ul>
              {!members.some((member) => {
                if (member.memberRole === "owner") return false;
                if (isLead && member.memberRole !== "member") return false;
                return true;
              }) ? (
                <p className="band-home-note">Nema članova za uklanjanje.</p>
              ) : null}
            </div>
          ) : null}

          {roleOpen && canAssignRoles ? (
            <div className="band-role-panel" aria-label="Uloge članova">
              <p className="band-add-hint">
                {isOwner
                  ? "Postavi lead / člana. Isključi pozivnice po članu."
                  : "Lead može unaprediti člana u lead. Isključi pozivnice običnim članovima."}
              </p>
              <ul className="band-member-list">
                {members
                  .filter((member) => member.memberRole !== "owner")
                  .map((member) => {
                    const leadCanTouch = isOwner || (isLead && member.memberRole === "member");
                    const canDemote = isOwner;
                    const canToggleInvite = isOwner || (isLead && member.memberRole === "member");
                    return (
                      <li key={member.id} className="band-member-row band-role-row band-role-row-stack">
                        <div className="band-role-row-top">
                          <span className="band-member-name">{member.name}</span>
                          <span className="band-member-role">{bandRoleLabel(member.memberRole)}</span>
                        </div>
                        <div className="band-role-actions">
                          <button
                            type="button"
                            className={member.memberRole === "lead" ? "is-active" : ""}
                            disabled={busy || member.memberRole === "lead" || !leadCanTouch}
                            onClick={() => handleSetRole(member, "lead")}
                          >
                            lead
                          </button>
                          <button
                            type="button"
                            className={member.memberRole === "member" ? "is-active" : ""}
                            disabled={busy || member.memberRole === "member" || !canDemote}
                            onClick={() => handleSetRole(member, "member")}
                          >
                            član
                          </button>
                          <button
                            type="button"
                            className={member.canInvite ? "is-active" : ""}
                            disabled={busy || !canToggleInvite}
                            title="Dozvola za slanje pozivnica"
                            onClick={() => handleToggleInvite(member)}
                          >
                            poziv
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              {!members.some((member) => member.memberRole !== "owner") ? (
                <p className="band-home-note">Nema drugih članova.</p>
              ) : null}
            </div>
          ) : null}

          {ownerOpen && (canTransfer || canDelete) ? (
            <div className="band-role-panel" aria-label="Vlasništvo benda">
              {canTransfer ? (
                <>
                  <p className="band-add-hint">Prenesi vlasništvo na postojećeg člana. Ti postaješ lead.</p>
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
                            Prenesi
                          </button>
                        </li>
                      ))}
                  </ul>
                  {!members.some((member) => member.memberRole !== "owner") ? (
                    <p className="band-home-note">Nema člana za prenos — prvo pozovi nekoga.</p>
                  ) : null}
                </>
              ) : null}
              {canDelete ? (
                <div className="band-danger-zone">
                  <p className="band-add-hint">Brisanje je trajno (termini + članstva).</p>
                  <button type="button" className="band-delete-btn" disabled={busy} onClick={handleDeleteBand}>
                    Obriši bend
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAllBands ? <p className="band-home-note">Izaberi bend za članove i alate.</p> : null}
          {!isAllBands ? (
            <p className="band-home-swipe-hint" aria-hidden="true">
              ← prevuci za više
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
            <button type="button" className="band-home-back" onClick={closeSide} aria-label="Zatvori">
              <ChevronLeftIcon />
            </button>
            <div className="band-home-title-wrap">
              <h2 className="band-home-title">Više</h2>
              <p className="band-home-sub">prevuci desno da zatvoriš</p>
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
                title={`Članovi${members.length ? ` · ${members.length}` : ""}`}
                open={sideSection === "members"}
                onToggle={toggleSideSection}
              >
                {isAllBands ? (
                  <p className="band-home-note">Izaberi bend da vidiš članove.</p>
                ) : band?.kind === "personal" ? (
                  <p className="band-home-note">Lični prostor — nema liste članova.</p>
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
                        <span className="band-home-side-role">{bandRoleLabel(member.memberRole)}</span>
                      </li>
                    ))}
                    {invites.map((invite) => (
                      <li key={invite.id} className="is-pending">
                        <span className="band-home-avatar is-sm is-pending" aria-hidden="true">
                          ?
                        </span>
                        <span className="band-home-side-member-text">
                          <strong>{invite.email}</strong>
                          <small>čeka potvrdu</small>
                        </span>
                        <span className="band-home-side-role">pozivnica</span>
                      </li>
                    ))}
                    {!members.length && !invites.length ? (
                      <li className="band-home-side-empty">Nema učitanih članova.</li>
                    ) : null}
                  </ul>
                )}
              </BandAccordionSection>

              <BandAccordionSection
                id="media"
                title="Mediji"
                open={sideSection === "media"}
                onToggle={toggleSideSection}
              >
                <p className="band-home-note">Uskoro — foto, snimci i deljeni fajlovi benda.</p>
              </BandAccordionSection>

              <BandAccordionSection
                id="notifications"
                title="Obaveštenja"
                open={sideSection === "notifications"}
                onToggle={toggleSideSection}
              >
                <p className="band-home-note">Uskoro — kako bend šalje podsetnike i novosti.</p>
              </BandAccordionSection>

              <BandAccordionSection
                id="sharing"
                title="Deljenje"
                open={sideSection === "sharing"}
                onToggle={toggleSideSection}
              >
                {isAllBands ? (
                  <p className="band-home-note">Izaberi bend da deliš pozivnicu.</p>
                ) : band?.kind === "personal" ? (
                  <p className="band-home-note">Lični prostor — nema link za deljenje.</p>
                ) : !canInvite ? (
                  <p className="band-home-note">Nemaš dozvolu za deljenje pozivnice u ovom bendu.</p>
                ) : (
                  <div className="band-share">
                    <p className="band-home-note">
                      Ko otvori link (ili skenira QR) i prijavi se / napravi nalog, automatski ulazi u bend
                      kao član.
                    </p>
                    <label className="band-share-field">
                      <span>Pozivni link</span>
                      <input type="text" readOnly value={shareBusy && !shareUrl ? "Učitavam…" : shareUrl} />
                    </label>
                    <div className="band-share-actions">
                      <button type="button" className="band-home-side-action" disabled={!shareUrl || shareBusy} onClick={copyShareLink}>
                        Kopiraj link
                        <small>Viber, SMS, email…</small>
                      </button>
                      <button
                        type="button"
                        className="band-home-side-action"
                        disabled={!shareUrl || shareBusy}
                        onClick={() => setQrOpen((open) => !open)}
                      >
                        {qrOpen ? "Sakrij QR" : "Generiši QR kod"}
                        <small>isti link, za skeniranje</small>
                      </button>
                      <button
                        type="button"
                        className="band-home-side-action"
                        disabled={shareBusy}
                        onClick={rotateShareLink}
                      >
                        Novi link
                        <small>stari prestaje da važi</small>
                      </button>
                    </div>
                    {qrOpen && shareUrl ? (
                      <div className="band-share-qr">
                        <img src={qrImageUrlForJoin(shareUrl, 220)} alt="QR kod za pozivnicu u bend" width={220} height={220} />
                        <p className="band-home-note">Skeniraj telefonom — isti efekat kao link.</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </BandAccordionSection>

              <BandAccordionSection
                id="settings"
                title="Podešavanja benda"
                open={sideSection === "settings"}
                onToggle={toggleSideSection}
              >
                <p className="band-home-note">
                  Uskoro — ime, boja i pravila benda. Google kalendar sync biće u toku kreiranja i
                  izmene termina.
                </p>
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
          aria-label="Zatvori panel"
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RoleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3 4.5 6.5V12c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6.5L12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 16.5 6.5 8l3.5 4L12 6.5 14 12l3.5-4L20 16.5H4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
