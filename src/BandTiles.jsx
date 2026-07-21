import { bandInitials, resolveBandColor } from "./bandDisplay.js";

/**
 * Bottom band launcher — opens / switches the band page.
 * Not the toolbar band filter.
 */
export default function BandTiles({ bands = [], activeBandId = "", onOpenBand }) {
  if (!bands.length) return null;

  return (
    <section className="raspored-bands app-band-tiles" aria-label="Moji bendovi">
      <div className="raspored-bands-scroll">
        {bands.map((band) => {
          const color = resolveBandColor(band, band.id);
          const label = band.kind === "personal" ? `${band.name} (lično)` : band.name;
          const isActive = Boolean(activeBandId && activeBandId === band.id);
          return (
            <button
              key={band.id}
              type="button"
              className={`raspored-band-tile ${isActive ? "is-active" : ""}`}
              style={{ "--band-tile-bg": color }}
              title={label}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onOpenBand?.(band.id)}
            >
              <span className="raspored-band-tile-text">{bandInitials(band.name)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
