import { useEffect, useMemo, useState } from "react";
import { pad, parseDate, startOfToday } from "./calculations.js";

const WEEKDAYS = ["P", "U", "S", "Č", "P", "S", "N"];

function buildMonthCells(monthStart) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startPad);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

function dateTextFromDate(date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}.`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DateMonthPicker({ value, onChange, minDate = startOfToday() }) {
  const selected = useMemo(() => parseDate(value), [value]);
  const [cursor, setCursor] = useState(() => {
    if (!Number.isNaN(selected.getTime())) {
      return new Date(selected.getFullYear(), selected.getMonth(), 1);
    }
    const today = startOfToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    if (Number.isNaN(selected.getTime())) return;
    setCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [value]);

  const monthLabel = useMemo(
    () =>
      cursor.toLocaleDateString("sr-Latn-RS", {
        month: "short",
        year: "numeric",
      }),
    [cursor],
  );

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const today = startOfToday();

  function shiftMonth(delta) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="date-month-picker" aria-label="Izaberi datum">
      <div className="date-month-picker-nav">
        <button
          type="button"
          className="date-month-picker-nav-btn"
          aria-label="Prethodni mesec"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <p className="date-month-picker-month">{monthLabel}</p>
        <button
          type="button"
          className="date-month-picker-nav-btn"
          aria-label="Sledeći mesec"
          onClick={() => shiftMonth(1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>
      <div className="date-month-picker-weekdays" aria-hidden="true">
        {WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="date-month-picker-grid" role="grid">
        {cells.map((cell) => {
          const inMonth = cell.getMonth() === cursor.getMonth();
          const isPast = cell.getTime() < minDate.getTime();
          const isSelected = !Number.isNaN(selected.getTime()) && sameDay(cell, selected);
          const isToday = sameDay(cell, today);
          return (
            <button
              key={cell.toISOString()}
              type="button"
              role="gridcell"
              className={[
                "date-month-picker-day",
                !inMonth ? "is-outside" : "",
                isPast ? "is-disabled" : "",
                isSelected ? "is-selected" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isPast}
              aria-label={dateTextFromDate(cell)}
              aria-pressed={isSelected}
              onClick={() => onChange?.(dateTextFromDate(cell))}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon({ direction = "left" }) {
  const path = direction === "left" ? "M15 6 9 12l6 6" : "M9 6l6 6-6 6";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
