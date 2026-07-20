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
  if (host === "chabar.rs" || host === "www.chabar.rs") {
    return "https://chabar.rs";
  }
  return window.location.origin;
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

/**
 * Wait until Supabase finishes reading the session (including ?code= exchange).
 * Do not call exchangeCodeForSession yourself — and never pass window.location.href.
 */
export async function waitForAuthSession() {
  const { error } = await supabase.auth.initialize();
  const { data } = await supabase.auth.getSession();

  if (data.session) {
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
  return { session: null, error: "" };
}
