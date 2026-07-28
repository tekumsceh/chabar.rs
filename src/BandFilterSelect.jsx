import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import MenuSelect from "./MenuSelect.jsx";

/**
 * Compact band filter for toolbar (Svi + bands) — replaces bottom BandTiles strip.
 */
export default function BandFilterSelect({
  bands = [],
  activeBandId = "",
  allBandsId = "__all__",
  onSelectBand,
}) {
  if (!bands.length) return null;

  const value = activeBandId || allBandsId;
  const options = [
    { id: allBandsId, label: "Svi bendovi", icon: <AllBandsIcon /> },
    ...bands.map((band) => {
      const color = resolveBandColor(band, band.id);
      const label = band.kind === "personal" ? `${band.name} (lično)` : band.name;
      return {
        id: band.id,
        label,
        icon: (
          <span className="band-chip menu-band-chip" style={{ backgroundColor: color }} title={band.name}>
            {bandInitials(band.name)}
          </span>
        ),
      };
    }),
  ];

  return (
    <MenuSelect
      className="band-filter-select"
      label="Bend"
      icon={<BandFilterIcon bands={bands} activeBandId={value} allBandsId={allBandsId} />}
      value={value}
      options={options}
      onChange={(id) => onSelectBand?.(id)}
    />
  );
}

function BandFilterIcon({ bands, activeBandId, allBandsId }) {
  if (!activeBandId || activeBandId === allBandsId) {
    return <AllBandsIcon />;
  }
  const band = bands.find((row) => row.id === activeBandId);
  if (!band) return <AllBandsIcon />;
  const color = resolveBandColor(band, band.id);
  return (
    <span className="band-chip menu-band-chip" style={{ backgroundColor: color }} aria-hidden="true">
      {bandInitials(band.name)}
    </span>
  );
}

function AllBandsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="8" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 18.5c.5-2.6 2.3-4 4.5-4s4 1.4 4.5 4M11.5 18.5c.5-2.6 2.3-4 4.5-4s4 1.4 4.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
