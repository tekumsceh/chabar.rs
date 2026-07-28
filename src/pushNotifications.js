/** Web Push helpers for Chabar (opt-in from Settings). */

const PUSH_PREF_KEY = "ioorganize.pushEnabled";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPrefEnabled() {
  return localStorage.getItem(PUSH_PREF_KEY) === "1";
}

export function setPushPrefEnabled(on) {
  localStorage.setItem(PUSH_PREF_KEY, on ? "1" : "0");
}

export async function enablePush(api) {
  if (!isPushSupported()) {
    throw new Error("Ovaj pregledač ne podržava push obaveštenja.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Dozvola za obaveštenja nije data.");
  }

  const { publicKey } = await api("/api/me/push/vapid-public-key");
  if (!publicKey) {
    throw new Error("Push nije podešen na serveru.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api("/api/me/push/subscribe", {
    method: "POST",
    body: { subscription: subscription.toJSON() },
  });
  setPushPrefEnabled(true);
  return subscription;
}

export async function disablePush(api) {
  if (!isPushSupported()) {
    setPushPrefEnabled(false);
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api("/api/me/push/subscribe", {
        method: "DELETE",
        body: { endpoint: subscription.endpoint },
      });
      await subscription.unsubscribe();
    }
  } finally {
    setPushPrefEnabled(false);
  }
}
