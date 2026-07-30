/** Build a Google Maps search URL from venue (+ optional city). No API key. */
export function googleMapsSearchUrl(venue, city = "") {
  const query = [venue, city]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Prefer stored Maps link; otherwise search by venue + city. */
export function resolveMapsUrl({ mapsUrl = "", venue = "", city = "" } = {}) {
  const stored = String(mapsUrl || "").trim();
  if (stored) return stored;
  return googleMapsSearchUrl(venue, city);
}

/**
 * Detect a Google Maps URL. Name extraction is intentionally unused —
 * Lokal name is always typed separately by the user.
 */
export function parseMapsVenueInput(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { isMapsLink: false, mapsUrl: "" };
  }

  if (!isGoogleMapsUrl(text)) {
    return { isMapsLink: false, mapsUrl: "" };
  }

  try {
    const url = new URL(text);
    return { isMapsLink: true, mapsUrl: url.toString().slice(0, 2000) };
  } catch {
    return { isMapsLink: false, mapsUrl: "" };
  }
}

function isGoogleMapsUrl(text) {
  try {
    const url = new URL(text.trim());
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "maps.app.goo.gl" || host === "goo.gl") return true;
    if (host === "maps.google.com") return true;
    if (host === "google.com" || host.endsWith(".google.com")) {
      return /\/maps(\/|$)/i.test(url.pathname) || url.searchParams.has("q");
    }
    return false;
  } catch {
    return false;
  }
}
