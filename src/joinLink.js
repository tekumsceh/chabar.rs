/** Helpers for reusable band join links (?join=token). */

export const PENDING_JOIN_KEY = "chabar.pendingJoinToken";

export function joinUrlForToken(token) {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  const base =
    host === "chabar.rs" || host === "www.chabar.rs"
      ? "https://chabar.rs"
      : window.location.origin;
  return `${base}/?join=${encodeURIComponent(token)}`;
}

export function rememberJoinToken(token) {
  const value = String(token || "").trim();
  if (!value) return;
  try {
    sessionStorage.setItem(PENDING_JOIN_KEY, value);
  } catch {
    // ignore
  }
}

export function takePendingJoinToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = String(params.get("join") || "").trim();
    if (fromUrl) {
      rememberJoinToken(fromUrl);
      params.delete("join");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", next || "/");
      return fromUrl;
    }
    const stored = String(sessionStorage.getItem(PENDING_JOIN_KEY) || "").trim();
    if (stored) {
      sessionStorage.removeItem(PENDING_JOIN_KEY);
      return stored;
    }
  } catch {
    // ignore
  }
  return "";
}

export function peekPendingJoinToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = String(params.get("join") || "").trim();
    if (fromUrl) return fromUrl;
    return String(sessionStorage.getItem(PENDING_JOIN_KEY) || "").trim();
  } catch {
    return "";
  }
}

/** QR image URL for a join link (no extra npm dependency). */
export function qrImageUrlForJoin(url, size = 240) {
  const dim = Math.max(120, Math.min(480, Number(size) || 240));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${dim}x${dim}&margin=8&data=${encodeURIComponent(url)}`;
}
