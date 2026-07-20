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

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.detail || data.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}
