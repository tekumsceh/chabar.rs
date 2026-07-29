import { useEffect, useId, useRef, useState } from "react";

/**
 * Icon button that opens a single-choice dropdown menu.
 * options: [{ id, label, icon? }]
 */
export default function MenuSelect({
  icon,
  label,
  value,
  options,
  onChange,
  className = "",
  variant = "icon",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const selected = options.find((option) => option.id === value);
  const isBar = variant === "bar";
  const isFiltered = Boolean(value && value !== options[0]?.id);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`menu-select ${open ? "is-open" : ""} ${isBar ? "menu-select-bar" : ""} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={
          isBar
            ? `menu-select-bar-trigger ${open || isFiltered ? "is-active" : ""}`.trim()
            : `raspored-icon-btn ${open || isFiltered ? "is-active-filter" : ""}`.trim()
        }
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        title={isBar ? undefined : `${label}: ${selected?.label || ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        {isBar ? (
          <>
            <span className="menu-select-bar-leading">{icon}</span>
            <span className="menu-select-bar-body">
              <span className="menu-select-bar-kicker">{label}</span>
              <span className="menu-select-bar-value">{selected?.label || "—"}</span>
            </span>
            <ChevronDownIcon />
          </>
        ) : (
          icon
        )}
      </button>

      {open ? (
        <ul className="menu-select-list" id={menuId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                className={`menu-select-item ${option.id === value ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="menu-select-item-main">
                  {option.icon ? <span className="menu-select-item-icon">{option.icon}</span> : null}
                  <span className="menu-select-item-label">{option.label}</span>
                </span>
                {option.id === value ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="menu-select-bar-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5 10 17.5 19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
