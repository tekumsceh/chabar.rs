import MenuSelect from "./MenuSelect.jsx";
import {
  CalendarFilterIcon,
  CardLayoutIcon,
  ListLayoutIcon,
  ManageBandIcon,
  SortArrowIcon,
} from "./appIcons.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

const scheduleFilters = [
  { id: "upcoming", label: "Buduće" },
  { id: "done", label: "Prošle" },
  { id: "month", label: "Ovaj mesec" },
  { id: "all", label: "Sve" },
];

export default function ScheduleToolbar({
  filter,
  onFilterChange,
  layoutView = "list",
  onLayoutViewChange,
  dateSort,
  onDateSortChange,
  canManageBand = false,
  onManageBand,
}) {
  const t = useT();
  const layoutOptions = [
    { id: "list", label: t("schedule.layoutList"), icon: <ListLayoutIcon /> },
    { id: "card", label: t("schedule.layoutCard"), icon: <CardLayoutIcon /> },
  ];

  return (
    <div className="schedule-home-chrome">
      <div className="schedule-home-bar schedule-home-bar-tools-only">
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
            label={t("schedule.layoutView")}
            icon={layoutView === "card" ? <CardLayoutIcon /> : <ListLayoutIcon />}
            value={layoutView}
            options={layoutOptions}
            onChange={onLayoutViewChange}
          />
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
    </div>
  );
}
