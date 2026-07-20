import { useEffect, useState } from "react";
import { authRedirectTo, friendlyAuthError, supabase } from "./supabase.js";

export default function LoginPage({ onSignedIn, initialError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(friendlyAuthError(initialError));

  useEffect(() => {
    if (initialError) setError(friendlyAuthError(initialError));
  }, [initialError]);

  useEffect(() => {
    if (window.location.hostname === "www.chabar.rs") {
      window.location.replace("https://chabar.rs/");
    }
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
          Nastavi sa Google
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
      </article>
    </main>
  );
}
