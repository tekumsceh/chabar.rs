import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { initFadeScrollbars } from "./fadeScrollbar.js";
import "../styles.css";

// www and apex are different origins — OAuth PKCE breaks across them.
if (typeof window !== "undefined" && window.location.hostname === "www.chabar.rs") {
  const next = new URL(window.location.href);
  next.hostname = "chabar.rs";
  window.location.replace(next.toString());
} else {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  initFadeScrollbars();
}
