import { useEffect, useId, useRef, useState } from "react";

/**
 * Icon button that opens a single-choice dropdown menu.
 * options: [{ id, label }]
 */
export default function MenuSelect({
  icon,
  label,
  value,
  options,
  onChange,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const selected = options.find((option) => option.id === value);

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
    <div className={`menu-select ${open ? "is-open" : ""} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`raspored-icon-btn ${open || (value && value !== options[0]?.id) ? "is-active-filter" : ""}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        title={`${label}: ${selected?.label || ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
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
                <span>{option.label}</span>
                {option.id === value ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5 10 17.5 19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
