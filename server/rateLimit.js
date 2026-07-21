/**
 * Tiny in-memory rate limiter (per-process). Enough for a single API instance.
 * key → { count, resetAt }
 */
const buckets = new Map();
const MAX_KEYS = 5_000;

function pruneIfNeeded() {
  if (buckets.size < MAX_KEYS) return;
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
    if (buckets.size < MAX_KEYS * 0.8) break;
  }
  while (buckets.size >= MAX_KEYS) {
    const first = buckets.keys().next().value;
    if (first == null) break;
    buckets.delete(first);
  }
}

/**
 * @param {{ windowMs?: number, max?: number, keyFn?: (req) => string }} options
 */
export function rateLimit({ windowMs = 60_000, max = 60, keyFn } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : `${req.ip || req.socket?.remoteAddress || "unknown"}:${req.path}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      pruneIfNeeded();
      buckets.set(key, entry);
    }
    entry.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Too many requests",
        detail: "Sačekaj malo pa pokušaj ponovo.",
      });
    }
    next();
  };
}
