import { formatScheduleDateParts, numberValue } from "./calculations.js";
import {
  LogisticsIcon,
  MoneyIcon,
  RiderIcon,
  SetlistIcon,
} from "./appIcons.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

export default function ScheduleEventCard({
  row,
  bandColor,
  feeMarked = false,
  isNext = false,
  canSeeFinance = false,
  actions = null,
  onOpen,
}) {
  const t = useT();
  const dateParts = formatScheduleDateParts(row.date);
  const hasNote = Boolean(String(row.note || "").trim());

  function openSection(focus) {
    onOpen?.(row.id, focus);
  }

  return (
    <article
      className={`schedule-event-card ${row.done ? "is-past" : ""} ${isNext ? "is-next" : ""}`}
      style={bandColor ? { "--band-accent": bandColor } : undefined}
    >
      <div className="schedule-event-card-top">
        <button
          type="button"
          className="schedule-event-card-main"
          onClick={() => openSection()}
          aria-label={t("schedule.openEvent", {
            label: `${row.date || ""} ${row.city || ""}`.trim(),
          })}
        >
          <time className="schedule-event-card-date" dateTime={dateParts.dateTime || undefined}>
            <span className="schedule-event-card-date-day">{dateParts.day}</span>
            <span className="schedule-event-card-date-month">{dateParts.month}</span>
          </time>
          <div className="schedule-event-card-body">
            <div className="schedule-event-card-headline">
              <strong className="schedule-event-card-city">{row.city || "—"}</strong>
              {row.venue ? (
                <span className="schedule-event-card-venue">{row.venue}</span>
              ) : (
                <span className="schedule-event-card-venue is-empty" aria-hidden="true" />
              )}
            </div>
            {row.bandName ? (
              <span className="schedule-event-card-band">{row.bandName}</span>
            ) : null}
            {hasNote ? <p className="schedule-event-card-note">{row.note}</p> : null}
          </div>
        </button>
        {actions}
      </div>

      <div className="schedule-event-card-links" role="group" aria-label={t("schedule.cardSections")}>
        <button
          type="button"
          className="schedule-event-card-link"
          aria-label={t("schedule.card.logistics")}
          title={t("schedule.card.logistics")}
          onClick={(event) => {
            event.stopPropagation();
            openSection({ tab: "osnovno", detailsOpen: true });
          }}
        >
          <LogisticsIcon />
          <span>{t("schedule.card.logisticsShort")}</span>
        </button>
        <button
          type="button"
          className="schedule-event-card-link"
          aria-label={t("schedule.card.rider")}
          title={t("schedule.card.rider")}
          onClick={(event) => {
            event.stopPropagation();
            openSection({ tab: "tehnicki", techSubTab: "technical-rider" });
          }}
        >
          <RiderIcon />
          <span>{t("schedule.card.riderShort")}</span>
        </button>
        <button
          type="button"
          className="schedule-event-card-link"
          aria-label={t("schedule.card.setlist")}
          title={t("schedule.card.setlist")}
          onClick={(event) => {
            event.stopPropagation();
            openSection({ tab: "show", showSubTab: "set-lists" });
          }}
        >
          <SetlistIcon />
          <span>{t("schedule.card.setlistShort")}</span>
        </button>
        <button
          type="button"
          className={`schedule-event-card-link ${feeMarked ? "is-filled" : ""}`}
          aria-label={feeMarked ? t("schedule.feeSet") : t("schedule.feeUnset")}
          title={feeMarked ? t("schedule.feeSet") : t("schedule.feeUnset")}
          onClick={(event) => {
            event.stopPropagation();
            openSection(
              canSeeFinance
                ? { tab: "finansije" }
                : { tab: "osnovno" },
            );
          }}
        >
          <MoneyIcon />
          <span>{t("schedule.card.financeShort")}</span>
        </button>
      </div>
    </article>
  );
}

export function scheduleFeeMarked(row) {
  return numberValue(row.priceEur) > 0 || numberValue(row.defaultPriceEur) > 0;
}

export function scheduleCanSeeFinance(band) {
  return band?.memberRole === "owner" || band?.memberRole === "lead";
}
