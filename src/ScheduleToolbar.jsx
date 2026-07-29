import BandFilterSelect from "./BandFilterSelect.jsx";
import MenuSelect from "./MenuSelect.jsx";
import { CalendarFilterIcon, ManageBandIcon, SortArrowIcon } from "./appIcons.jsx";
import { formatEur } from "./calculations.js";

const scheduleFilters = [
  { id: "upcoming", label: "Buduće" },
  { id: "done", label: "Prošle" },
  { id: "month", label: "Ovaj mesec" },
  { id: "all", label: "Sve" },
];

export default function ScheduleToolbar({
  bands = [],
  activeBandId,
  allBandsId,
  onBandChange,
  filter,
  onFilterChange,
  dateSort,
  onDateSortChange,
  claimEur = 0,
  onOpenMoney,
  canManageBand = false,
  onManageBand,
}) {
  const showMoney = claimEur > 0.005;

  return (
    <div className="schedule-home-chrome">
      <div className="schedule-home-bar">
        <BandFilterSelect
          bands={bands}
          activeBandId={activeBandId}
          allBandsId={allBandsId}
          onSelectBand={onBandChange}
          layout="bar"
        />
        <div className="schedule-home-tools">
          {canManageBand ? (
            <button
              type="button"
              className="raspored-icon-btn"
              aria-label="Upravljaj bendom"
              title="Upravljaj bendom"
              onClick={onManageBand}
            >
              <ManageBandIcon />
            </button>
          ) : null}
          <MenuSelect
            label="Prikaz"
            icon={<CalendarFilterIcon />}
            value={filter}
            options={scheduleFilters}
            onChange={onFilterChange}
          />
          <button
            type="button"
            className={`raspored-icon-btn raspored-sort-btn ${dateSort === "asc" ? "is-asc" : "is-desc"}`}
            aria-label={dateSort === "desc" ? "Novo → staro" : "Staro → novo"}
            title={dateSort === "desc" ? "Novo → staro" : "Staro → novo"}
            onClick={() => onDateSortChange(dateSort === "desc" ? "asc" : "desc")}
          >
            <SortArrowIcon className="raspored-sort-arrow" />
          </button>
        </div>
      </div>

      {showMoney ? (
        <button type="button" className="finance-summary-chip" onClick={onOpenMoney} aria-label={`Novac, potražuje ${formatEur(claimEur)}`}>
          <span className="finance-summary-chip-icon" aria-hidden="true">
            €
          </span>
          <span className="finance-summary-chip-value">{formatEur(claimEur)}</span>
          <span className="finance-summary-chip-hint">potražuje</span>
        </button>
      ) : null}
    </div>
  );
}
