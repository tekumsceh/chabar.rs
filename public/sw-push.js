/* Push handlers imported by the generated service worker (VitePWA). */

self.addEventListener("push", (event) => {
  let data = { title: "Chabar", body: "", payload: {} };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    try {
      data.body = event.data?.text() || "";
    } catch {
      // ignore
    }
  }

  const title = data.title || "Chabar";
  const options = {
    body: data.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: data.payload || {},
    tag: data.payload?.eventId
      ? `event-${data.payload.eventId}`
      : data.payload?.bandId
        ? `band-${data.payload.bandId}`
        : "chabar",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const params = new URLSearchParams();
  if (payload.page) params.set("n", payload.page);
  if (payload.eventId) params.set("event", String(payload.eventId));
  if (payload.bandId) params.set("band", String(payload.bandId));
  const url = params.toString() ? `/?${params.toString()}` : "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // ignore navigate errors
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
