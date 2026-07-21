import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ConfirmProvider } from "./confirmDialog.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { initFadeScrollbars } from "./fadeScrollbar.js";
import "../styles.css";

// www and apex are different origins — OAuth PKCE breaks across them.
if (typeof window !== "undefined" && window.location.hostname === "www.chabar.rs") {
  const next = new URL(window.location.href);
  next.hostname = "chabar.rs";
  window.location.replace(next.toString());
} else {
  if (import.meta.env.DEV && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister();
    });
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => {
        for (const key of keys) caches.delete(key);
      });
    }
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
  initFadeScrollbars();
}
