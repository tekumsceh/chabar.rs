import { useEffect, useState } from "react";
import { authRedirectTo, friendlyAuthError, supabase } from "./supabase.js";
import { peekPendingJoinToken, rememberJoinToken } from "./joinLink.js";

export default function LoginPage({ onSignedIn, initialError = "", onOpenLegal }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(friendlyAuthError(initialError));
  const [joinHint, setJoinHint] = useState("");

  useEffect(() => {
    if (initialError) setError(friendlyAuthError(initialError));
  }, [initialError]);

  useEffect(() => {
    if (window.location.hostname === "www.chabar.rs") {
      window.location.replace("https://chabar.rs/");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = String(params.get("join") || "").trim();
    if (join) rememberJoinToken(join);
    const token = peekPendingJoinToken();
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/join/${encodeURIComponent(token)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.bandName) {
          setJoinHint(`Posle prijave ulaziš u bend „${data.bandName}” kao član.`);
        }
      } catch {
        // ignore preview failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEmailAuth(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        onSignedIn?.();
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage("Proveri email za potvrdu naloga, zatim se prijavi.");
        setMode("signin");
      }
    } catch (authError) {
      setError(friendlyAuthError(authError.message) || "Prijava nije uspela");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError("");
    try {
      if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        if (window.location.hostname !== "chabar.rs") {
          window.location.replace("https://chabar.rs/");
          return;
        }
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authRedirectTo(),
        },
      });
      if (oauthError) throw oauthError;
    } catch (authError) {
      setError(friendlyAuthError(authError.message) || "Google prijava nije uspela");
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <article className="login-card panel">
        <div className="panel-heading compact">
          <div>
            <h2>{mode === "signin" ? "Prijava" : "Registracija"}</h2>
            <p>Pristup rasporedu i finansijama je vezan za tvoj nalog i bendove.</p>
            {joinHint ? <p className="login-join-hint">{joinHint}</p> : null}
          </div>
        </div>

        <form className="login-form" onSubmit={handleEmailAuth}>
          <label>
            Email
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Lozinka
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          {error ? <div className="app-alert">{error}</div> : null}
          {message ? <div className="app-alert app-alert-ok">{message}</div> : null}

          <button type="submit" disabled={busy}>
            {busy ? "Sačekaj..." : mode === "signin" ? "Prijavi se" : "Kreiraj nalog"}
          </button>
        </form>

        <div className="login-divider">ili</div>

        <button type="button" className="login-google" onClick={handleGoogle} disabled={busy}>
          <GoogleIcon />
          <span>Nastavi sa Google</span>
        </button>

        <button
          type="button"
          className="login-switch"
          onClick={() => {
            setMode((current) => (current === "signin" ? "signup" : "signin"));
            setError("");
            setMessage("");
          }}
        >
          {mode === "signin" ? "Nemam nalog — registruj se" : "Imam nalog — prijavi se"}
        </button>

        <nav className="login-legal" aria-label="Pravne stranice">
          <button type="button" onClick={() => onOpenLegal?.("terms")}>
            Uslovi
          </button>
          <button type="button" onClick={() => onOpenLegal?.("privacy")}>
            Privatnost
          </button>
          <button type="button" onClick={() => onOpenLegal?.("cookies")}>
            Kolačići
          </button>
          <button type="button" onClick={() => onOpenLegal?.("imprint")}>
            Pravno
          </button>
        </nav>
      </article>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="login-google-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}
