import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FadeScroll from "./FadeScroll.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

/**
 * Labeled / form-style single-choice dropdown (replaces a native select).
 * options: [{ id, label, icon?, disabled?, variant? }]
 */
export default function FieldSelect({
  id,
  label,
  value,
  options,
  onChange,
  className = "",
  placeholder,
  disabled = false,
  required = false,
  autoFocus = false,
  portal = false,
  portalAlign = "start",
  listClassName = "",
  searchable = false,
}) {
  const t = useT();
  const resolvedPlaceholder = placeholder ?? t("field.choose");
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [query, setQuery] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const portalAlignRef = useRef(portalAlign);
  portalAlignRef.current = portalAlign;
  const listId = useId();
  const selected = options.find((option) => option.id === value || String(option.id) === String(value));
  const visibleOptions = useMemo(() => {
    if (!searchable || !filtering) return options;
    const needle = fold(query);
    if (!needle) return options;
    return options.filter((option) => fold(option.search || option.label).includes(needle));
  }, [filtering, options, query, searchable]);

  function closeMenu() {
    setOpen(false);
    setFiltering(false);
    setQuery("");
    setActiveIndex(0);
  }

  function choose(option) {
    if (!option || option.disabled) return;
    onChange(option.id);
    closeMenu();
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setFiltering(false);
    setQuery("");
    setActiveIndex(0);
  }

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);

  useLayoutEffect(() => {
    if (!open || !portal) {
      setMenuPos(null);
      return undefined;
    }

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 8.5 * 16);
      const align = portalAlignRef.current;
      const preferredLeft = align === "end" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(8, preferredLeft), window.innerWidth - width - 8);
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < 12 * 16 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(8 * 16, Math.min(14 * 16, openUp ? spaceAbove : spaceBelow));
      const top = openUp ? rect.top - gap - maxHeight : rect.bottom + gap;
      setMenuPos({
        top,
        left,
        width,
        maxHeight,
        openUp,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, portal]);

  useEffect(() => {
    if (!open) return undefined;

    function menuEl() {
      return document.querySelector(`[data-field-select-menu="${listId}"]`);
    }

    function isInsideSelect(target) {
      if (!(target instanceof Node)) return false;
      if (rootRef.current?.contains(target)) return true;
      return Boolean(menuEl()?.contains(target));
    }

    function close() {
      setOpen(false);
      setFiltering(false);
      setQuery("");
      setActiveIndex(0);
    }

    function onPointerDown(event) {
      if (!isInsideSelect(event.target)) close();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    function onExternalScrollOrWheel(event) {
      if (isInsideSelect(event.target)) return;
      close();
    }

    const resetScroll = () => {
      const viewport = menuEl()?.querySelector(".fade-scroll-viewport");
      if (viewport) viewport.scrollTop = 0;
    };
    resetScroll();
    const raf = window.requestAnimationFrame(resetScroll);

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onExternalScrollOrWheel, true);
    document.addEventListener("wheel", onExternalScrollOrWheel, { capture: true, passive: true });
    document.addEventListener("touchmove", onExternalScrollOrWheel, { capture: true, passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onExternalScrollOrWheel, true);
      document.removeEventListener("wheel", onExternalScrollOrWheel, true);
      document.removeEventListener("touchmove", onExternalScrollOrWheel, true);
    };
  }, [open, listId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, visibleOptions.length]);

  useEffect(() => {
    if (!open || !searchable || filtering) return;
    inputRef.current?.select();
  }, [open, searchable, filtering]);

  function onSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openMenu();
      setActiveIndex((index) => Math.min(visibleOptions.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(visibleOptions[activeIndex] || visibleOptions.find((option) => !option.disabled));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  const list = open ? (
    <div
      className={`field-select-list ${portal ? "is-portaled" : ""} ${menuPos?.openUp ? "is-up" : ""} ${listClassName}`.trim()}
      id={listId}
      data-field-select-menu={listId}
      style={
        portal && menuPos
          ? {
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              width: `${menuPos.width}px`,
              maxHeight: `${menuPos.maxHeight}px`,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
    >
      <FadeScroll className="fade-scroll-inset" viewportClassName="field-select-list-viewport">
        <ul role="listbox" aria-label={label}>
          {visibleOptions.length === 0 ? (
            <li className="field-select-empty">{t("field.noMatch")}</li>
          ) : null}
          {visibleOptions.map((option, index) => (
            <li key={String(option.id)} role="option" aria-selected={String(option.id) === String(value)}>
              <button
                type="button"
                className={[
                  "field-select-item",
                  String(option.id) === String(value) ? "is-selected" : "",
                  index === activeIndex && searchable ? "is-active" : "",
                  option.variant === "clear" ? "is-clear" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={option.disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="field-select-item-main">
                  {option.icon ? <span className="field-select-item-icon">{option.icon}</span> : null}
                  <span>{option.label}</span>
                </span>
                {String(option.id) === String(value) && option.variant !== "clear" ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      </FadeScroll>
    </div>
  ) : null;

  return (
    <div
      className={`field-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      {searchable ? (
        <div
          className="field-select-trigger field-select-combo"
          ref={triggerRef}
          onMouseDown={(event) => {
            if (disabled || event.target === inputRef.current) return;
            event.preventDefault();
            if (open) closeMenu();
            else inputRef.current?.focus();
          }}
        >
          <input
            id={id}
            ref={inputRef}
            role="combobox"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-required={required || undefined}
            disabled={disabled}
            placeholder={resolvedPlaceholder}
            value={open && filtering ? query : selected?.label || ""}
            autoComplete="off"
            onFocus={() => {
              openMenu();
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setFiltering(true);
              setOpen(true);
            }}
            onKeyDown={onSearchKeyDown}
          />
          <span className="field-select-chevron-btn" aria-hidden="true">
            <ChevronIcon />
          </span>
        </div>
      ) : (
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
            <span>{selected?.label || resolvedPlaceholder}</span>
          </span>
          <ChevronIcon />
        </button>
      )}

      {portal && typeof document !== "undefined" && list
        ? createPortal(list, document.body)
        : list}
    </div>
  );
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
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
