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

  let response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    const error = new Error("Veza sa serverom nije uspela. Sačekaj sekund i pokušaj ponovo.");
    error.status = 0;
    throw error;
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
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}
