import { bandInitials, resolveBandColor } from "./bandDisplay.js";

/**
 * Bottom band switcher — selects which band filters lists.
 * Open Band page via the explicit info control (not primary tile tap).
 */
export default function BandTiles({
  bands = [],
  activeBandId = "",
  allBandsId = "__all__",
  onSelectBand,
  onOpenBand,
}) {
  if (!bands.length) return null;

  const selectedSpecific = Boolean(activeBandId && activeBandId !== allBandsId);
  const allActive = !activeBandId || activeBandId === allBandsId;

  return (
    <section className="raspored-bands app-band-tiles" aria-label="Izbor benda">
      <div className="raspored-bands-scroll">
        <button
          type="button"
          className={`raspored-band-tile is-all ${allActive ? "is-active" : ""}`}
          title="Svi bendovi"
          aria-label="Svi bendovi"
          aria-pressed={allActive}
          onClick={() => onSelectBand?.(allBandsId)}
        >
          <span className="raspored-band-tile-text">Svi</span>
        </button>

        {bands.map((band) => {
          const color = resolveBandColor(band, band.id);
          const label = band.kind === "personal" ? `${band.name} (lično)` : band.name;
          const isActive = activeBandId === band.id;
          return (
            <button
              key={band.id}
              type="button"
              className={`raspored-band-tile ${isActive ? "is-active" : ""}`}
              style={{ "--band-tile-bg": color }}
              title={`Izaberi: ${label}`}
              aria-label={`Izaberi bend ${label}`}
              aria-pressed={isActive}
              onClick={() => onSelectBand?.(band.id)}
            >
              <span className="raspored-band-tile-text">{bandInitials(band.name)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="app-band-tiles-open"
        disabled={!selectedSpecific}
        title={selectedSpecific ? "Otvori stranicu benda" : "Izaberi bend da otvoriš stranicu"}
        aria-label={selectedSpecific ? "Otvori stranicu benda" : "Izaberi bend da otvoriš stranicu"}
        onClick={() => {
          if (!selectedSpecific) return;
          onOpenBand?.(activeBandId);
        }}
      >
        <OpenBandIcon />
      </button>
    </section>
  );
}

function OpenBandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" />
    </svg>
  );
}
