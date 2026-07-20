/**
 * Client logger — forwards errors/warnings to the API log file (logs/app.log).
 * Use for diagnostic noise instead of UI banners.
 */
function toPayload(level, message, detail) {
  return {
    level,
    message: String(message || ""),
    detail:
      detail instanceof Error
        ? { name: detail.name, message: detail.message, stack: detail.stack }
        : detail ?? null,
    href: typeof window !== "undefined" ? window.location.href : "",
  };
}

async function send(level, message, detail) {
  const payload = toPayload(level, message, detail);
  if (import.meta.env.DEV) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[ioorganize] ${message}`, detail ?? "");
  }
  try {
    await fetch("/api/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Swallow — logging must never break the UI.
  }
}

export const log = {
  info(message, detail) {
    return send("info", message, detail);
  },
  warn(message, detail) {
    return send("warn", message, detail);
  },
  error(message, detail) {
    return send("error", message, detail);
  },
};
