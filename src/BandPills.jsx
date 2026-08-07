import { useEffect, useRef } from "react";
import { resolveBandColor } from "./bandDisplay.js";
import { useT } from "./i18n/I18nProvider.jsx";

/**
 * Horizontal band filter pills (top app bar) — replaces search + band dropdowns.
 */
export default function BandPills({
  bands = [],
  activeBandId,
  allBandsId = "__all__",
  onSelectBand,
}) {
  const t = useT();
  const scrollRef = useRef(null);
  const active = activeBandId || allBandsId;

  useEffect(() => {
    const el = scrollRef.current?.querySelector(".band-pill.is-active");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  if (!bands.length) return null;

  function bandLabel(band) {
    if (band.kind === "personal") {
      return `${band.name} ${t("event.personalSuffix")}`.trim();
    }
    return band.name;
  }

  return (
    <nav className="band-pills" aria-label={t("nav.bandPills")}>
      <div className="band-pills-scroll" ref={scrollRef}>
        <button
          type="button"
          className={`band-pill band-pill-all ${active === allBandsId ? "is-active is-all" : ""}`}
          aria-pressed={active === allBandsId}
          onClick={() => onSelectBand?.(allBandsId)}
        >
          {t("common.allShort")}
        </button>
        {bands.map((band) => {
          const isActive = active === band.id;
          const color = resolveBandColor(band, band.id);
          return (
            <button
              key={band.id}
              type="button"
              className={`band-pill ${color ? "has-accent" : ""} ${isActive ? "is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => onSelectBand?.(band.id)}
              style={color ? { "--band-pill-accent": color } : undefined}
              title={bandLabel(band)}
            >
              {color ? <span className="band-pill-dot" aria-hidden="true" /> : null}
              <span className="band-pill-label">{bandLabel(band)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
