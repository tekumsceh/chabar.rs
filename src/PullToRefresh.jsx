import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n/I18nProvider.jsx";

const THRESHOLD = 72;
const MAX_PULL = 112;
const MOBILE_MQ = "(max-width: 900px)";

function isOverlayOpen() {
  return Boolean(
    document.querySelector(".modal-backdrop") ||
      document.querySelector(".confirm-backdrop") ||
      document.querySelector(".profile-hub-backdrop") ||
      document.querySelector(".app-tabbar-add-wrap.is-open"),
  );
}

function isVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  return el.getClientRects().length > 0;
}

function getActiveScrollEl(root) {
  const active = root?.querySelector(".app-page.is-active");
  if (!active) return null;

  const eventScrolls = active.querySelectorAll(".event-page .event-page-panel-scroll");
  for (const eventScroll of eventScrolls) {
    if (isVisible(eventScroll)) return eventScroll;
  }

  const fadeViewport = active.querySelector(".fade-scroll-viewport");
  if (fadeViewport && isVisible(fadeViewport)) return fadeViewport;

  const panels = active.querySelectorAll(".fade-scroll-wrap > .raspored-panel");
  for (const panel of panels) {
    if (isVisible(panel)) return panel;
  }

  const settings = active.querySelector(".settings-page");
  if (settings && isVisible(settings)) return settings;

  const bandMain = active.querySelector(".band-home-main");
  if (bandMain && isVisible(bandMain)) return bandMain;

  const bandSide = active.querySelector(".band-home-side-body");
  if (bandSide && isVisible(bandSide)) return bandSide;

  return null;
}

function RefreshIcon({ spinning = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={spinning ? "ptr-spinner" : ""}>
      <path
        d="M12 4a8 8 0 1 0 7.75 6.02M12 4V1m0 3 2.5-2.5M12 4 9.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PullToRefresh({ onRefresh, disabled = false, children }) {
  const t = useT();
  const shellRef = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);

  refreshRef.current = onRefresh;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setEnabled(mq.matches && "ontouchstart" in window);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    if (!enabled || disabled) return undefined;

    const root = shellRef.current;
    if (!root) return undefined;

    function resetPull() {
      pullingRef.current = false;
      setPull(0);
    }

    async function triggerRefresh() {
      if (refreshing) return;
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await refreshRef.current?.();
      } finally {
        setRefreshing(false);
        resetPull();
      }
    }

    function onTouchStart(event) {
      if (refreshing || disabled || isOverlayOpen()) return;
      const touch = event.touches[0];
      if (!touch) return;

      const scrollEl = getActiveScrollEl(root);
      if (!scrollEl || scrollEl.scrollTop > 0) return;

      startYRef.current = touch.clientY;
      pullingRef.current = true;
    }

    function onTouchMove(event) {
      if (!pullingRef.current || refreshing || disabled) return;

      const scrollEl = getActiveScrollEl(root);
      if (!scrollEl || scrollEl.scrollTop > 0) {
        resetPull();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      const delta = touch.clientY - startYRef.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }

      event.preventDefault();
      setPull(Math.min(delta * 0.45, MAX_PULL));
    }

    function onTouchEnd() {
      if (!pullingRef.current) return;
      const shouldRefresh = pullRef.current >= THRESHOLD;
      pullingRef.current = false;
      if (shouldRefresh) {
        triggerRefresh();
        return;
      }
      resetPull();
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled, enabled, refreshing]);

  const active = enabled && (pull > 0 || refreshing);
  const progress = Math.min(1, pull / THRESHOLD);
  const label = refreshing ? t("app.refreshing") : t("app.pullRefresh");

  return (
    <div
      ref={shellRef}
      className={`app-shell-inner ${active ? "is-ptr-active" : ""} ${refreshing ? "is-ptr-refreshing" : ""}`}
    >
      {enabled ? (
        <div
          className="ptr-indicator"
          aria-hidden={!active}
          style={{
            "--ptr-pull": `${pull}px`,
            "--ptr-progress": String(progress),
          }}
        >
          <span className="ptr-indicator-icon">
            <RefreshIcon spinning={refreshing} />
          </span>
          <span className="ptr-indicator-label">{label}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
