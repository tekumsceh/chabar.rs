import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

/**
 * Minimal auth client — matches Supabase SPA docs.
 * detectSessionInUrl:true lets the library exchange ?code= (it passes the code string, not the URL).
 */
export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export function authRedirectTo() {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  const base = host === "chabar.rs" || host === "www.chabar.rs" ? "https://chabar.rs" : window.location.origin;
  try {
    const token = sessionStorage.getItem("chabar.pendingJoinToken");
    if (token) return `${base}/?join=${encodeURIComponent(token)}`;
  } catch {
    // ignore
  }
  return base;
}

export function friendlyAuthError(message) {
  const text = String(message || "");
  if (/invalid api key/i.test(text)) {
    return "Pogrešan Supabase API key u build-u. Proveri VITE_SUPABASE_ANON_KEY na VPS i ponovo pokreni npm run build.";
  }
  if (/PKCE code verifier|flow state/i.test(text)) {
    return "Google OAuth nije završen. Koristi samo https://chabar.rs, očisti keš sajta, i ne refreshuj stranicu posle Google-a.";
  }
  return text;
}

/** Strip OAuth tokens from the address bar after Supabase reads them. */
export function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const query = url.searchParams;
  const authKeys = [
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
    "expires_at",
    "expires_in",
    "token_type",
    "code",
    "state",
    "error",
    "error_description",
    "sb",
  ];
  let dirty = false;
  for (const key of authKeys) {
    if (hashParams.has(key)) {
      hashParams.delete(key);
      dirty = true;
    }
    if (query.has(key)) {
      query.delete(key);
      dirty = true;
    }
  }
  if (!dirty && !url.hash.includes("access_token") && !query.has("code")) return;
  const nextHash = hashParams.toString();
  const next = `${url.pathname}${query.toString() ? `?${query}` : ""}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState(window.history.state, "", next || "/");
}

/**
 * Wait until Supabase finishes reading the session (including ?code= exchange).
 * Do not call exchangeCodeForSession yourself — and never pass window.location.href.
 */
export async function waitForAuthSession() {
  const { error } = await supabase.auth.initialize();
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    clearAuthParamsFromUrl();
    return { session: data.session, error: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const desc = params.get("error_description") || params.get("error") || "";
  if (desc) {
    return { session: null, error: friendlyAuthError(decodeURIComponent(desc.replace(/\+/g, " "))) };
  }
  if (error) {
    return { session: null, error: friendlyAuthError(error.message) };
  }
  // Even without a session, never leave tokens sitting in the bar.
  clearAuthParamsFromUrl();
  return { session: null, error: "" };
}
