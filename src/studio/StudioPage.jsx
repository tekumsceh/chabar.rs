import { useEffect, useMemo, useState } from "react";
import { numberValue, todayText } from "../calculations.js";
import MenuSelect from "../MenuSelect.jsx";
import ReportPage from "../ReportPage.jsx";
import SchedulePage from "../SchedulePage.jsx";
import TerminDetailPage from "../TerminDetailPage.jsx";
import BandPage from "./BandPage.jsx";
import {
  mockFinanceBands,
  mockFinanceEvents,
  mockFinanceSettings,
  mockPayments,
  mockScheduleEvents,
} from "./mockData.js";
import "./studio.css";

const STUDIO_THEME_KEY = "ioorganize.studio.theme";
const ALL_BANDS_ID = "__all__";

const viewOptions = [
  { id: "schedule", label: "Raspored" },
  { id: "finance", label: "Finansije" },
  { id: "band", label: "Bend" },
];

const bandPageOptions = mockFinanceBands
  .filter((band) => band.kind === "group" || band.id === "personal")
  .map((band) => ({
    id: band.id,
    label: band.kind === "personal" ? `${band.name} (lično)` : band.name,
  }));

const viewerRoleOptions = [
  { id: "member", label: "Kao član" },
  { id: "admin", label: "Kao admin" },
  { id: "owner", label: "Kao vlasnik" },
];

/**
 * Local-only lab: mounts the same Schedule / Detail / Finansije pages as production,
 * fed by mock data (no API). Iterate UI here, then ship.
 */
export default function StudioPage() {
  const [view, setView] = useState("band");
  const [theme, setTheme] = useState(() => localStorage.getItem(STUDIO_THEME_KEY) || "light");
  const [phonePreview, setPhonePreview] = useState(false);
  const [activeBandId, setActiveBandId] = useState(ALL_BANDS_ID);
  const [financeBandId, setFinanceBandId] = useState(ALL_BANDS_ID);
  const [financeMode, setFinanceMode] = useState("member");
  const [events, setEvents] = useState(() => mockScheduleEvents.map((row) => ({ ...row })));
  const [detailEventId, setDetailEventId] = useState(null);
  const [detailStartEdit, setDetailStartEdit] = useState(false);
  const [bandPageId, setBandPageId] = useState("demo");
  const [viewerRole, setViewerRole] = useState("admin");
  const [nextId, setNextId] = useState(
    () => Math.max(0, ...mockScheduleEvents.map((row) => Number(row.id) || 0)) + 1,
  );

  useEffect(() => {
    localStorage.setItem(STUDIO_THEME_KEY, theme);
  }, [theme]);

  // Reuse live dark-theme tokens scoped to `.app-shell[data-theme=…]`
  useEffect(() => {
    const shell = document.querySelector(".app-shell-studio");
    if (!shell) return undefined;
    shell.setAttribute("data-theme", theme);
    return () => shell.removeAttribute("data-theme");
  }, [theme]);

  const bands = mockFinanceBands;
  const settings = mockFinanceSettings;

  const visibleEvents = useMemo(() => {
    if (activeBandId === ALL_BANDS_ID) return events;
    return events.filter((row) => row.bandId === activeBandId);
  }, [events, activeBandId]);

  const financeBand = bands.find((band) => band.id === financeBandId) || null;
  const canUseBandMode = Boolean(financeBand && financeBand.kind === "group");
  const effectiveFinanceMode = canUseBandMode && financeMode === "band" ? "band" : "member";

  const financeEvents = useMemo(() => {
    let rows =
      financeBandId === ALL_BANDS_ID
        ? mockFinanceEvents
        : mockFinanceEvents.filter((row) => row.bandId === financeBandId);

    if (effectiveFinanceMode === "member") {
      rows = rows.map((row) => {
        const mine = row.memberWages?.[0];
        if (!mine) return { ...row, memberWages: [], expenseItems: [] };
        return {
          ...row,
          priceEur: mine.priceEur,
          transportRsd: row.transportRsd,
          memberWages: [mine],
          expenseItems: [],
        };
      });
    }
    return rows;
  }, [financeBandId, effectiveFinanceMode]);

  useEffect(() => {
    if (financeMode === "band" && !canUseBandMode) setFinanceMode("member");
  }, [financeMode, canUseBandMode]);

  const detailEvent = events.find((item) => item.id === detailEventId) || null;

  function closeEventDetail() {
    setDetailEventId(null);
    setDetailStartEdit(false);
  }

  function openEventDetail(id, { edit = false } = {}) {
    setDetailEventId(id);
    setDetailStartEdit(Boolean(edit));
  }

  function handleViewChange(nextView) {
    closeEventDetail();
    setView(nextView);
  }

  async function addEvent(payload = {}) {
    const bandId = String(payload.bandId || "").trim();
    if (!bandId || bandId === ALL_BANDS_ID) {
      throw new Error("Moraš izabrati bend ili Personal.");
    }
    const band = bands.find((item) => item.id === bandId);
    const created = {
      id: nextId,
      bandId,
      bandName: band?.name || "",
      date: payload.date || todayText(),
      city: payload.city || "",
      venue: payload.venue || "",
      note: payload.note || "",
      priceEur: numberValue(payload.priceEur),
      transportRsd: numberValue(payload.transportRsd),
    };
    setNextId((value) => value + 1);
    setEvents((prev) => [...prev, created]);
    return created;
  }

  async function updateEvent(id, fields) {
    setEvents((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              date: fields.date ?? row.date,
              city: fields.city ?? row.city,
              venue: fields.venue ?? row.venue,
              note: fields.note ?? row.note,
              priceEur: fields.priceEur !== undefined ? numberValue(fields.priceEur) : row.priceEur,
              transportRsd:
                fields.transportRsd !== undefined ? numberValue(fields.transportRsd) : row.transportRsd,
            }
          : row,
      ),
    );
  }

  async function removeEvent(id) {
    setEvents((prev) => prev.filter((row) => row.id !== id));
    if (detailEventId === id) closeEventDetail();
  }

  const showDetail = view === "schedule" && Boolean(detailEventId);
  const bandPageBand = bands.find((band) => band.id === bandPageId) || bands[0] || null;

  return (
    <div className={`studio-lab ${phonePreview ? "studio-lab-phone" : ""}`} data-theme={theme}>
      <header className="studio-lab-bar" aria-label="Studio alatke">
        <MenuSelect
          label="Prikaz"
          icon={<ViewIcon />}
          value={view}
          options={viewOptions}
          onChange={handleViewChange}
        />
        {view === "band" ? (
          <>
            <MenuSelect
              label="Bend"
              icon={<BandIcon />}
              value={bandPageId}
              options={bandPageOptions}
              onChange={setBandPageId}
            />
            <MenuSelect
              label="Uloga"
              icon={<RoleIcon />}
              value={viewerRole}
              options={viewerRoleOptions}
              onChange={setViewerRole}
            />
          </>
        ) : null}
        <div className="studio-lab-bar-spacer" />
        <button
          type="button"
          className="raspored-icon-btn"
          onClick={() => setPhonePreview((value) => !value)}
          aria-label="Phone preview"
          title="Phone preview"
        >
          <PhoneIcon />
        </button>
        <button
          type="button"
          className="raspored-icon-btn"
          onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          aria-label={theme === "light" ? "Dark mode" : "Light mode"}
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
      </header>

      <div className={`studio-lab-stage ${showDetail ? "is-detail" : ""}`}>
        {showDetail ? (
          <TerminDetailPage
            event={detailEvent}
            bands={bands}
            settings={settings}
            startEditing={detailStartEdit}
            onStartEditConsumed={() => setDetailStartEdit(false)}
            onBack={closeEventDetail}
            onUpdate={updateEvent}
            onRemove={removeEvent}
          />
        ) : null}

        <div className="studio-lab-page" hidden={view !== "schedule" || showDetail}>
          <SchedulePage
            events={visibleEvents}
            bands={bands}
            settings={settings}
            activeBandId={activeBandId}
            allBandsId={ALL_BANDS_ID}
            onBandChange={setActiveBandId}
            onAdd={addEvent}
            onUpdate={updateEvent}
            onRemove={removeEvent}
            onOpenDetail={openEventDetail}
          />
        </div>

        <div className="studio-lab-page" hidden={view !== "finance"}>
          <ReportPage
            events={financeEvents}
            payments={mockPayments}
            bands={bands}
            activeBandId={financeBandId}
            allBandsId={ALL_BANDS_ID}
            onBandChange={setFinanceBandId}
            financeMode={effectiveFinanceMode}
            canUseBandMode={canUseBandMode}
            onFinanceModeChange={setFinanceMode}
            settings={settings}
          />
        </div>

        <div className="studio-lab-page" hidden={view !== "band"}>
          <BandPage band={bandPageBand} viewerRole={viewerRole} />
        </div>
      </div>
    </div>
  );
}

function BandIcon() {
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
    </svg>
  );
}

function RoleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3 14.5 8.5 20.5 9.2 16 13.4 17.2 19.5 12 16.6 6.8 19.5 8 13.4 3.5 9.2 9.5 8.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="7" y="2" width="10" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 18h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
