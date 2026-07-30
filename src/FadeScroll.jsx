import { useEffect, useRef, useState } from "react";

const FADE_OUT_MS = 1000;

/**
 * React-owned fade scrollbar (same look as initFadeScrollbars).
 * Safe for mount/unmount — does not reparent DOM under React.
 */
export default function FadeScroll({
  children,
  className = "",
  viewportClassName = "",
  viewportAriaLabel = "",
}) {
  const viewportRef = useRef(null);
  const thumbRef = useRef(null);
  const wrapRef = useRef(null);
  const hideTimerRef = useRef(0);
  const touchingRef = useRef(false);
  const canScrollRef = useRef(false);
  const scrollingRef = useRef(false);
  const rafRef = useRef(0);
  const [canScroll, setCanScroll] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const thumb = thumbRef.current;
    const wrap = wrapRef.current;
    if (!viewport || !thumb || !wrap) return undefined;

    function clearHideTimer() {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = 0;
    }

    function scheduleHide() {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        if (touchingRef.current) return;
        if (scrollingRef.current) {
          scrollingRef.current = false;
          setScrolling(false);
        }
      }, FADE_OUT_MS);
    }

    function isScrollable() {
      return viewport.scrollHeight > viewport.clientHeight + 1;
    }

    function setCanScrollSafe(next) {
      if (canScrollRef.current === next) return;
      canScrollRef.current = next;
      setCanScroll(next);
    }

    function setScrollingSafe(next) {
      if (scrollingRef.current === next) return;
      scrollingRef.current = next;
      setScrolling(next);
    }

    function sync() {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      if (!isScrollable()) {
        thumb.style.height = "0px";
        thumb.style.transform = "translateY(0)";
        setCanScrollSafe(false);
        setScrollingSafe(false);
        clearHideTimer();
        return false;
      }

      setCanScrollSafe(true);
      const ratio = clientHeight / scrollHeight;
      const thumbHeight = Math.max(18, Math.round(clientHeight * ratio));
      const maxTop = clientHeight - thumbHeight;
      const top =
        maxTop <= 0 ? 0 : Math.round((scrollTop / (scrollHeight - clientHeight)) * maxTop);
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${top}px)`;
      return true;
    }

    function scheduleSync() {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        sync();
      });
    }

    function show() {
      if (!isScrollable()) {
        setScrollingSafe(false);
        return;
      }
      setScrollingSafe(true);
      if (!touchingRef.current) scheduleHide();
      else clearHideTimer();
    }

    const onScroll = () => {
      if (!sync()) return;
      show();
    };
    const onWheel = () => show();
    const onTouchStart = () => {
      if (!isScrollable()) return;
      touchingRef.current = true;
      clearHideTimer();
    };
    const onTouchMove = () => {
      if (!sync()) return;
      touchingRef.current = true;
      clearHideTimer();
      setScrollingSafe(true);
    };
    const onTouchEnd = () => {
      touchingRef.current = false;
      if (isScrollable()) scheduleHide();
      else setScrollingSafe(false);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });

    const ro = new ResizeObserver(scheduleSync);
    ro.observe(viewport);
    // childList-only (no characterData/subtree attribute spam) + rAF coalesce
    const mo = new MutationObserver(scheduleSync);
    mo.observe(viewport, { childList: true, subtree: true });
    sync();

    return () => {
      clearHideTimer();
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`fade-scroll-wrap ${canScroll ? "can-scroll" : ""} ${scrolling ? "is-scrolling" : ""} ${className}`.trim()}
    >
      <div
        ref={viewportRef}
        className={`fade-scroll-viewport ${viewportClassName}`.trim()}
        {...(viewportAriaLabel ? { role: "region", "aria-label": viewportAriaLabel } : {})}
      >
        {children}
      </div>
      <div ref={thumbRef} className="fade-scroll-thumb" aria-hidden="true" />
    </div>
  );
}
