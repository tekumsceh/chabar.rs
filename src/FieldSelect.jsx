import { useEffect, useId, useRef, useState } from "react";

/**
 * Labeled / form-style single-choice dropdown (replaces native <select>).
 * options: [{ id, label, icon?, disabled? }]
 */
export default function FieldSelect({
  id,
  label,
  value,
  options,
  onChange,
  className = "",
  placeholder = "— Izaberi —",
  disabled = false,
  required = false,
  autoFocus = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const selected = options.find((option) => option.id === value || String(option.id) === String(value));

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);

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
    <div
      className={`field-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="field-select-trigger"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-required={required || undefined}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        <span className={`field-select-value ${selected ? "" : "is-placeholder"}`.trim()}>
          {selected?.icon ? <span className="field-select-value-icon">{selected.icon}</span> : null}
          <span>{selected?.label || placeholder}</span>
        </span>
        <ChevronIcon />
      </button>

      {open ? (
        <ul className="field-select-list" id={listId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={String(option.id)} role="option" aria-selected={String(option.id) === String(value)}>
              <button
                type="button"
                className={`field-select-item ${String(option.id) === String(value) ? "is-selected" : ""}`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="field-select-item-main">
                  {option.icon ? <span className="field-select-item-icon">{option.icon}</span> : null}
                  <span>{option.label}</span>
                </span>
                {String(option.id) === String(value) ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="field-select-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
      <path
        d="M1 1.5L6 6.5L11 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
      <path
        d="M5 12.5 10 17.5 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
