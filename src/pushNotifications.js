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
  const v = localStorage.getItem(PUSH_PREF_KEY);
  if (v === null) return true;
  return v === "1";
}

export function setPushPrefEnabled(on) {
  localStorage.setItem(PUSH_PREF_KEY, on ? "1" : "0");
}

/** Register or reuse a service worker so push works in dev and prod. */
export async function ensurePushServiceWorker() {
  if (!isPushSupported()) {
    throw new Error("Ovaj pregledač ne podržava push obaveštenja.");
  }

  let registration = await navigator.serviceWorker.getRegistration();
  if (registration?.active || registration?.installing || registration?.waiting) {
    await navigator.serviceWorker.ready;
    return registration;
  }

  if (import.meta.env.DEV) {
    registration = await navigator.serviceWorker.register("/sw-dev-push.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  }

  await new Promise((resolve) => setTimeout(resolve, 400));
  registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    await navigator.serviceWorker.ready;
    return registration;
  }

  registration = await navigator.serviceWorker.register("/sw-dev-push.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getPushStatus() {
  if (!isPushSupported()) {
    return {
      supported: false,
      prefEnabled: false,
      permission: "unsupported",
      subscribed: false,
      ready: false,
    };
  }

  const prefEnabled = getPushPrefEnabled();
  const permission = Notification.permission;
  let subscribed = false;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      subscribed = Boolean(subscription);
    }
  } catch {
    subscribed = false;
  }

  return {
    supported: true,
    prefEnabled,
    permission,
    subscribed,
    ready: prefEnabled && permission === "granted" && subscribed,
  };
}

/** If user wants notifications and browser already granted permission, subscribe silently. */
export async function syncPushSubscription(api) {
  if (!isPushSupported() || !getPushPrefEnabled()) return getPushStatus();
  if (Notification.permission === "denied") return getPushStatus();

  try {
    await ensurePushServiceWorker();
    if (Notification.permission === "granted") {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        await enablePush(api);
      }
    }
  } catch {
    // User can retry via toggle; VAPID may be missing locally.
  }

  return getPushStatus();
}

export async function enablePush(api) {
  if (!isPushSupported()) {
    throw new Error("Ovaj pregledač ne podržava push obaveštenja.");
  }

  await ensurePushServiceWorker();

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setPushPrefEnabled(false);
    throw new Error("Dozvola za obaveštenja nije data.");
  }

  const { publicKey } = await api("/api/me/push/vapid-public-key");
  if (!publicKey) {
    setPushPrefEnabled(false);
    throw new Error("Push nije podešen na serveru (VAPID ključevi).");
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
  setPushPrefEnabled(false);
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api("/api/me/push/subscribe", {
        method: "DELETE",
        body: { endpoint: subscription.endpoint },
      });
      await subscription.unsubscribe();
    }
  } catch {
    // Preference already off.
  }
}
