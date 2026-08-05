let authToken = "";
let activeBandId = "";

export function setApiAuth({ token = "", bandId = "" } = {}) {
  authToken = token || "";
  activeBandId = bandId || "";
}

export async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const bandId = options.bandId || activeBandId;
  if (bandId) {
    headers["X-Band-Id"] = bandId;
  }

  const method = options.method || "GET";
  const retriable =
    !options.noRetry &&
    method !== "POST" &&
    (options.retry !== false);
  const attempts = retriable ? 2 : 1;

  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastError = new Error("Veza sa serverom nije uspela. Sačekaj sekund i pokušaj ponovo.");
      lastError.status = 0;
      if (attempt + 1 < attempts) continue;
      throw lastError;
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
      }
      const fallback =
        response.status === 404
          ? "Endpoint nije pronađen (možda treba deploy novog API-ja)."
          : `Zahtev nije uspeo (${response.status})`;
      const error = new Error(data.detail || data.error || fallback);
      error.status = response.status;
      lastError = error;
      const retryStatus = response.status === 502 || response.status === 503 || response.status === 504;
      if (retryStatus && attempt + 1 < attempts) continue;
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  throw lastError || new Error("Zahtev nije uspeo");
}
