import { useEffect, useId, useRef, useState } from "react";
import { api } from "./api.js";

/**
 * Top-bar search with DB autocomplete (termin, grad, lokal, bend, korisnik).
 */
export default function GlobalSearch({ value, onChange, onSelectResult, authReady = true }) {
  const listId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetchError, setFetchError] = useState("");
  const seqRef = useRef(0);

  useEffect(() => {
    if (!authReady) {
      setResults([]);
      setFetchError("");
      return undefined;
    }

    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
      setFetchError("");
      return undefined;
    }

    const seq = ++seqRef.current;
    setLoading(true);
    setFetchError("");
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/api/search?${new URLSearchParams({ q: trimmed })}`);
        if (seq !== seqRef.current) return;
        setResults(Array.isArray(data.results) ? data.results : []);
        setActiveIndex(-1);
      } catch (error) {
        if (seq !== seqRef.current) return;
        setResults([]);
        setFetchError(error?.message || "Pretraga nije uspela.");
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [value, authReady]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pickResult(result) {
    onSelectResult?.(result);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
      setOpen(true);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      pickResult(results[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = open && value.trim().length > 0 && (loading || fetchError || results.length > 0);

  return (
    <div className={`global-search ${showList ? "is-open" : ""}`} ref={rootRef}>
      <label className="app-topbar-search">
        <span className="sr-only">Pretraga</span>
        <span className="app-topbar-search-icon" aria-hidden="true">
          <TopSearchIcon />
        </span>
        <input
          type="search"
          name="globalSearch"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Pretraga…"
          className="app-topbar-search-field"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (value.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </label>

      {showList ? (
        <ul className="global-search-list" id={listId} role="listbox" aria-label="Predlozi pretrage">
          {loading && results.length === 0 ? (
            <li className="global-search-empty" role="presentation">
              Učitavam…
            </li>
          ) : null}
          {!loading && fetchError ? (
            <li className="global-search-empty global-search-error" role="presentation">
              {fetchError}
            </li>
          ) : null}
          {!loading && !fetchError && results.length === 0 ? (
            <li className="global-search-empty" role="presentation">
              Nema pogodaka
            </li>
          ) : null}
          {results.map((result, index) => (
            <li key={`${result.kind}-${result.id || result.label}-${index}`} role="presentation">
              <button
                type="button"
                className={`global-search-option ${index === activeIndex ? "is-active" : ""}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickResult(result)}
              >
                <span className="global-search-option-text">
                  <strong>{result.label}</strong>
                  {result.hint ? <small>{result.hint}</small> : null}
                </span>
                <span className="global-search-kind">{result.category}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TopSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
