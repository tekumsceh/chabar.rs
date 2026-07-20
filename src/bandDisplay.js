/** Shared band color palette — assigned on create, reused as fallback for older rows. */
export const BAND_COLORS = [
  "#276ef1",
  "#0b875b",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0e7490",
  "#c2410c",
  "#4338ca",
  "#15803d",
  "#a21caf",
];

export function pickBandColor(seed = "") {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return BAND_COLORS[hash % BAND_COLORS.length];
}

/** Initials from band name — letters/digits only, max 3 chars. */
export function bandInitials(name = "") {
  const cleaned = String(name || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");

  if (!cleaned) return "?";

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  return cleaned.slice(0, 3).toUpperCase();
}

export function resolveBandColor(band, fallbackSeed = "") {
  if (band?.color && /^#[0-9a-fA-F]{6}$/.test(band.color)) return band.color;
  return pickBandColor(band?.id || band?.name || fallbackSeed);
}
