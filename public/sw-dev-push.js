/* Minimal service worker for push in Vite dev (production uses VitePWA + sw-push.js). */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

importScripts("/sw-push.js");
