import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import { bandRoleLabel } from "../shared/roles.js";
import { parseDate, sameMonth, startOfToday } from "./calculations.js";
import MenuSelect from "./MenuSelect.jsx";

const WEEKDAYS = ["P", "U", "S", "Č", "P", "S", "N"];
const CREATE_BAND_ID = "__new_band__";

/**
 * Simple band home — calendar first, then icon tools.
 * Only "Dodaj člana" is functional for now.
 */
export default function BandPage({
  bands = [],
  activeBandId,
  allBandsId,
  onBandChange,
  onBandsChanged,
  showToast,
  profile = null,
}) {
  const isAllBands = activeBandId === allBandsId || !activeBandId;
  const ownerLimit = profile?.ownerLimit ?? 5;
  const ownedGroupBands = profile?.ownedGroupBands ?? 0;
  const canCreateBand = ownedGroupBands < ownerLimit;

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

  const bandOptions = useMemo(
    () => [
      {
        id: allBandsId,
        label: "Svi bendovi",
        icon: <AllBandsIcon />,
      },
      ...bands.map((band) => {
        const color = resolveBandColor(band, band.id);
        return {
          id: band.id,
          label: band.kind === "personal" ? `${band.name} (lično)` : band.name,
          icon: (
            <span className="band-chip menu-band-chip" style={{ backgroundColor: color }} title={band.name}>
              {bandInitials(band.name)}
            </span>
          ),
        };
      }),
      {
        id: CREATE_BAND_ID,
        label: canCreateBand ? "Novi bend" : `Limit ${ownedGroupBands}/${ownerLimit}`,
        icon: <PlusIcon />,
      },
    ],
    [bands, allBandsId, canCreateBand, ownedGroupBands, ownerLimit],
  );

  const selectValue = isAllBands ? allBandsId : activeBandId;

  const [detail, setDetail] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const today = startOfToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [roleOpen, setRoleOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchSeq = useRef(0);

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
    setCreateOpen(false);
    setCreateName("");
    setRoleOpen(false);
    setKickOpen(false);
    setOwnerOpen(false);
    setQuery("");
    setSearchResults([]);
  }, [activeBandId]);

  function closeToolPanels() {
    setAddOpen(false);
    setCreateOpen(false);
    setRoleOpen(false);
    setKickOpen(false);
    setOwnerOpen(false);
    setQuery("");
    setSearchResults([]);
  }

  function handleBandSelect(nextId) {
    if (nextId === CREATE_BAND_ID) {
      closeToolPanels();
      setCreateOpen(true);
      return;
    }
    onBandChange?.(nextId);
  }

  async function handleCreateBand(event) {
    event.preventDefault();
    const name = createName.trim();
    if (!name || busy) return;
    if (!canCreateBand) {
      showToast?.(`Limit: najviše ${ownerLimit} grupnih bendova. Zatraži grant za više.`, "error");
      return;
    }
    setBusy(true);
    try {
      const created = await api("/api/bands", { method: "POST", body: { name } });
      showToast?.(`Bend kreiran: ${created.name}`);
      setCreateName("");
      setCreateOpen(false);
      await onBandsChanged?.();
      onBandChange?.(created.id);
    } catch (error) {
      showToast?.(error.message || "Kreiranje benda nije uspelo", "error");
    } finally {
      setBusy(false);
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

  /** day-of-month → unique band colors for strips */
  const stripsByDay = useMemo(() => {
    const map = new Map();
    for (const event of calendarEvents) {
      const parsed = parseDate(event.date);
      if (Number.isNaN(parsed.getTime())) continue;
      if (!sameMonth(parsed, cursor)) continue;
      const day = parsed.getDate();
      const color =
        event.color ||
        colorByBandId.get(event.bandId) ||
        resolveBandColor({ id: event.bandId, name: event.bandName }, event.bandId);
      const list = map.get(day) || [];
      if (!list.includes(color)) list.push(color);
      map.set(day, list);
    }
    return map;
  }, [calendarEvents, cursor, colorByBandId]);

  const monthLabel = useMemo(
    () =>
      cursor.toLocaleDateString("sr-RS", {
        month: "long",
        year: "numeric",
      }),
    [cursor],
  );

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const today = startOfToday();

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
    const ok = window.confirm(`Ukloniti ${member.name} iz benda?`);
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
    const ok = window.confirm(
      `Preneti vlasništvo na ${member.name}?\nTi postaješ lead. Ovo ne možeš poništiti sam/a.`,
    );
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
    const ok = window.confirm(`Trajno obrisati bend „${name}“?\nTermini i članstva nestaju. Nema povratka.`);
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/bands/${activeBandId}`, { method: "DELETE", bandId: activeBandId });
      showToast?.(`Obrisan bend: ${name}`);
      setOwnerOpen(false);
      await onBandsChanged?.();
      onBandChange?.(allBandsId);
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
    <section className="band-home">
      <header className="band-home-top">
        <MenuSelect
          className="band-home-band-select"
          label="Bend"
          value={selectValue}
          options={bandOptions}
          onChange={handleBandSelect}
          icon={<AllBandsIcon />}
        />
        <div className="band-home-title-wrap">
          <h2 className="band-home-title">{title}</h2>
          <p className="band-home-sub">{subtitle}</p>
        </div>
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
          {cells.map((cell, index) => {
            if (!cell) return <span key={`e-${index}`} className="band-cal-cell is-empty" />;
            const isToday =
              cell.getFullYear() === today.getFullYear() &&
              cell.getMonth() === today.getMonth() &&
              cell.getDate() === today.getDate();
            const strips = stripsByDay.get(cell.getDate()) || [];
            return (
              <span
                key={`${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`}
                className={["band-cal-cell", isToday ? "is-today" : "", strips.length ? "has-event" : ""]
                  .filter(Boolean)
                  .join(" ")}
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
              </span>
            );
          })}
        </div>
      </div>

      <div className="band-tools" role="toolbar" aria-label="Alati benda">
        <button
          type="button"
          className={`band-tool-btn ${createOpen ? "is-active" : ""}`}
          aria-label="Novi bend"
          title={canCreateBand ? "Kreiraj novi bend" : `Limit ${ownedGroupBands}/${ownerLimit}`}
          onClick={() => {
            if (createOpen) {
              closeToolPanels();
              return;
            }
            closeToolPanels();
            setCreateOpen(true);
          }}
        >
          <NewBandIcon />
        </button>
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

      {createOpen ? (
        <form className="band-add-form" onSubmit={handleCreateBand}>
          <label className="band-add-label" htmlFor="band-create-name">
            Ime novog benda
          </label>
          <div className="band-add-row">
            <input
              id="band-create-name"
              type="text"
              autoComplete="off"
              autoFocus
              maxLength={80}
              placeholder="npr. Chabar"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              required
            />
            <button type="submit" className="band-add-submit" disabled={busy || !createName.trim() || !canCreateBand}>
              {busy ? "…" : "Kreiraj"}
            </button>
          </div>
          <p className="band-add-hint">
            {canCreateBand
              ? `Grupni bend · ti si vlasnik · ${ownedGroupBands}/${ownerLimit} zauzeto`
              : `Dostignut limit (${ownerLimit}). Zatraži grant za više benda.`}
          </p>
        </form>
      ) : null}

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
                const canToggleInvite =
                  isOwner || (isLead && member.memberRole === "member");
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

      {isAllBands ? (
        <p className="band-home-note">Izaberi bend za članove i alate.</p>
      ) : band?.kind === "group" ? (
        <ul className="band-member-list" aria-label="Članovi">
          {members.map((member) => (
            <li key={member.id} className="band-member-row">
              <span className="band-member-name">{member.name}</span>
              <span className="band-member-role">{bandRoleLabel(member.memberRole)}</span>
            </li>
          ))}
          {(detail?.invites || []).map((invite) => (
            <li key={invite.id} className="band-member-row is-pending">
              <span className="band-member-name">{invite.email}</span>
              <span className="band-member-role">pozivnica</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="band-home-note">Izaberi grupni bend da upravljaš članovima.</p>
      )}
    </section>
  );
}

function buildMonthCells(monthStart) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function AllBandsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M14.8 19c.4-2.2 1.8-3.5 3.7-3.5 1.2 0 2.2.5 2.9 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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

function NewBandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 9v6M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
      <path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
