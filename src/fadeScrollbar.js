/** Persistent page hosts (stay mounted via app-page[hidden]). Modals/login use <FadeScroll>. */
const SCROLL_HOSTS =
  ".raspored-panel, .settings-page, .band-home-main, .band-home-side-body";
const FADE_OUT_MS = 1000;
const INIT_ATTR = "data-fade-init";

/**
 * Custom 2px scrollbar:
 * - Desktop: fade in while scrolling, fade out 1s after stop
 * - Touch: stay visible while finger is held (and list can scroll), fade out 1s after release
 *
 * Important: never leave a React-managed node reparented under a detached wrap.
 * Cleanup always restores the host to its original parent before removing the wrap.
 * Never touch React <FadeScroll> wraps (those have .fade-scroll-viewport, no data-fade-init).
 */
export function initFadeScrollbars() {
  const hideTimers = new WeakMap();
  const touching = new WeakSet();

  function isInitWrap(wrap) {
    return wrap instanceof HTMLElement && wrap.getAttribute(INIT_ATTR) === "1";
  }

  function getInitHost(wrap) {
    return [...wrap.children].find((child) => child.matches?.(SCROLL_HOSTS)) || null;
  }

  function isScrollable(viewport) {
    return viewport.scrollHeight > viewport.clientHeight + 1;
  }

  function clearHideTimer(wrap) {
    const prev = hideTimers.get(wrap);
    if (prev) window.clearTimeout(prev);
    hideTimers.delete(wrap);
  }

  function scheduleHide(wrap) {
    clearHideTimer(wrap);
    hideTimers.set(
      wrap,
      window.setTimeout(() => {
        if (touching.has(wrap)) return;
        wrap.classList.remove("is-scrolling");
      }, FADE_OUT_MS),
    );
  }

  function show(wrap, viewport) {
    if (!isScrollable(viewport)) {
      wrap.classList.remove("is-scrolling");
      return;
    }
    wrap.classList.add("is-scrolling");
    if (!touching.has(wrap)) {
      scheduleHide(wrap);
    } else {
      clearHideTimer(wrap);
    }
  }

  function updateThumb(wrap, viewport, thumb) {
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    if (!isScrollable(viewport)) {
      thumb.style.height = "0px";
      thumb.style.transform = "translateY(0)";
      wrap.classList.remove("is-scrolling", "can-scroll");
      clearHideTimer(wrap);
      return false;
    }

    wrap.classList.add("can-scroll");

    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(18, Math.round(clientHeight * ratio));
    const maxTop = clientHeight - thumbHeight;
    const top =
      maxTop <= 0 ? 0 : Math.round((scrollTop / (scrollHeight - clientHeight)) * maxTop);

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
    return true;
  }

  function unwrap(wrap, viewport) {
    const parent = wrap.parentNode;
    if (viewport && parent && viewport.parentNode === wrap) {
      parent.insertBefore(viewport, wrap);
    }
    if (wrap.parentNode) wrap.remove();
  }

  function destroyWrap(wrap) {
    if (!isInitWrap(wrap)) return;
    const viewport = getInitHost(wrap);
    try {
      wrap._fadeScrollCleanup?.();
    } catch {
      /* ignore */
    }
    clearHideTimer(wrap);
    unwrap(wrap, viewport);
  }

  function enhance(viewport) {
    if (!(viewport instanceof HTMLElement)) return;
    if (viewport.closest(".fade-scroll-wrap")) return;
    // Nested event panels remount often — use <FadeScroll> there instead of reparenting.
    if (viewport.classList.contains("event-page-panel")) return;

    const parent = viewport.parentElement;
    if (!parent) return;

    const wrap = document.createElement("div");
    wrap.className = "fade-scroll-wrap";
    wrap.setAttribute(INIT_ATTR, "1");
    parent.insertBefore(wrap, viewport);
    wrap.appendChild(viewport);

    const thumb = document.createElement("div");
    thumb.className = "fade-scroll-thumb";
    thumb.setAttribute("aria-hidden", "true");
    wrap.appendChild(thumb);

    const sync = () => updateThumb(wrap, viewport, thumb);

    const onScroll = () => {
      if (!sync()) return;
      show(wrap, viewport);
    };

    const onWheel = () => {
      show(wrap, viewport);
    };

    const onTouchStart = () => {
      if (!isScrollable(viewport)) return;
      touching.add(wrap);
      clearHideTimer(wrap);
    };

    const onTouchMove = () => {
      if (!sync()) return;
      touching.add(wrap);
      clearHideTimer(wrap);
      wrap.classList.add("is-scrolling");
    };

    const onTouchEnd = () => {
      touching.delete(wrap);
      if (isScrollable(viewport)) {
        scheduleHide(wrap);
      } else {
        wrap.classList.remove("is-scrolling");
      }
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });

    const ro = new ResizeObserver(sync);
    ro.observe(viewport);
    wrap._fadeScrollCleanup = () => {
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      ro.disconnect();
    };

    sync();
  }

  function scan() {
    document.querySelectorAll(`.fade-scroll-wrap[${INIT_ATTR}="1"]`).forEach((wrap) => {
      const host = getInitHost(wrap);
      if (!host || !document.contains(host)) {
        destroyWrap(wrap);
      }
    });
    document.querySelectorAll(SCROLL_HOSTS).forEach(enhance);
  }

  scan();

  const root = document.getElementById("root") || document.body;
  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      // Restore hosts that React still owns before it tries to remove them mid-tree.
      document.querySelectorAll(`.fade-scroll-wrap[${INIT_ATTR}="1"]`).forEach((wrap) => {
        const host = getInitHost(wrap);
        if (host && !document.contains(wrap)) {
          destroyWrap(wrap);
        }
      });
      scan();
    });
  });
  mo.observe(root, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    document.querySelectorAll(`.fade-scroll-wrap[${INIT_ATTR}="1"]`).forEach(destroyWrap);
  };
}
