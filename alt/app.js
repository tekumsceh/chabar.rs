const MONTHS = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];

const WEEKDAYS = ["nedelja", "ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota"];
const DOW = ["p", "u", "s", "č", "p", "s", "n"];
const ROLE_LABEL = {
  owner: "Vlasnik",
  lead: "Lead",
  member: "Član",
  saradnik: "Saradnik",
};
const RATE = 116.5;
const ACTIVE_BAND_KEY = "ioorganize.activeBandId.v2";
const ALL_BANDS_ID = "__all__";

const TIME_LABELS = [
  ["gather", "Okupljanje"],
  ["depart", "Polazak"],
  ["sound", "Soundcheck"],
  ["show", "Početak showa"],
  ["end", "Kraj"],
];

const VIEWS = new Set(["kalendar", "list", "knjiga", "postava"]);

const now = new Date();
const TODAY = isoFromParts(now.getFullYear(), now.getMonth(), now.getDate());

let DATES = [];
let CAST = [];

const state = {
  view: hashView(),
  selected: "",
  year: now.getFullYear(),
  month: now.getMonth(),
  draft: null,
  pendingAction: null,
  token: "",
  phase: "loading",
  error: "",
  bandLabel: "svi bendovi",
  userName: "",
};

const shell = document.getElementById("shell");
const app = document.getElementById("app");
const proof = document.getElementById("proof");
const proofCopy = document.getElementById("proof-copy");
const barLeft = document.getElementById("bar-left");
const barRight = document.getElementById("bar-right");
const barTitle = document.getElementById("bar-title");
const barKicker = document.getElementById("bar-kicker");
const clockEl = document.getElementById("clock");
const runningEl = document.getElementById("running");

function hashView() {
  const raw = location.hash.replace("#", "").trim();
  return VIEWS.has(raw) ? raw : "kalendar";
}

function isoFromParts(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDay(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return new Date(Number.NaN);
  return new Date(y, m - 1, d);
}

function parseSrDate(text) {
  const parts = String(text || "")
    .trim()
    .replaceAll(",", ".")
    .split(".")
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  const [day, month, year] = parts;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function selectedGig() {
  return DATES.find((item) => item.id === state.selected) || DATES[0] || null;
}

function selectedIndex() {
  return DATES.findIndex((item) => item.id === state.selected);
}

function roundEur(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function money(n) {
  const value = roundEur(n);
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const shown = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${sign}${shown} €`;
}

function claim(item) {
  return roundEur((item.fee || 0) + (item.travel || 0) - (item.paid || 0));
}

function byDate() {
  const map = new Map();
  for (const item of DATES) {
    const list = map.get(item.date) || [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function tap() {
  navigator.vibrate?.(12);
}

function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString("sr-RS", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readAccessToken() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith("sb-") || !key.includes("auth-token")) continue;
    try {
      let data = JSON.parse(localStorage.getItem(key) || "null");
      if (typeof data === "string") data = JSON.parse(data);
      const token =
        data?.access_token || data?.currentSession?.access_token || data?.session?.access_token || "";
      if (token) return token;
    } catch {
      // skip bad keys
    }
  }
  return "";
}

async function api(path, { bandId } = {}) {
  const headers = { Authorization: `Bearer ${state.token}` };
  if (bandId) headers["X-Band-Id"] = bandId;
  const response = await fetch(path, { headers });
  if (response.status === 401) {
    const error = new Error("Sesija je istekla.");
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `Zahtev nije uspeo (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function paymentEur(payment) {
  const amount = Number(payment?.amount) || 0;
  if (amount <= 0) return 0;
  const rate = Number(payment?.exchangeRate) > 0 ? Number(payment.exchangeRate) : RATE;
  return String(payment?.currency || "EUR").toUpperCase() === "RSD" ? amount / rate : amount;
}

function expenseEur(item) {
  const amount = Number(item?.amount) || 0;
  if (amount <= 0) return 0;
  return String(item?.currency || "EUR").toUpperCase() === "RSD" ? amount / RATE : amount;
}

function emptyTimes() {
  return { gather: "", depart: "", sound: "", show: "", end: "" };
}

function mapEvent(row, extras = {}) {
  const parsed = parseSrDate(row.date);
  if (!parsed) return null;
  const transport = Number(row.transportRsd) || 0;
  const expenses = extras.expenseItems || row.expenseItems || [];
  const myExpenses = expenses.filter((item) => String(item.payeeKind || "").toLowerCase() === "member");
  return {
    id: String(row.id),
    eventId: row.id,
    bandId: row.bandId,
    bandName: row.bandName || "",
    date: isoFromParts(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
    city: row.city || "",
    venue: row.venue || "",
    note: row.note || "",
    times: emptyTimes(),
    timesLoaded: false,
    fee: roundEur(row.priceEur),
    travel: roundEur(transport / RATE + myExpenses.reduce((sum, item) => sum + expenseEur(item), 0)),
    paid: 0,
  };
}

function settlePaid(items, payments) {
  let pool = roundEur((payments || []).reduce((sum, payment) => sum + paymentEur(payment), 0));
  const held = [...items].filter((item) => item.date <= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  for (const item of held) {
    const total = roundEur(item.fee + item.travel);
    if (total <= 0) continue;
    if (pool >= total) {
      item.paid = total;
      pool = roundEur(pool - total);
    } else if (pool > 0) {
      item.paid = pool;
      pool = 0;
    }
  }
}

function field(id, label, value) {
  return `
    <label class="field">
      <span>${label}</span>
      <input data-path="${id}" value="${escapeAttr(value)}" autocomplete="off" enterkeyhint="next" />
    </label>`;
}

function renderNotice(title, copy, href) {
  return `
    <div class="notice">
      <h2>${title}</h2>
      <p>${copy}</p>
      ${href ? `<a href="${href}">Otvori Chabar</a>` : ""}
    </div>`;
}

function renderMonth() {
  const gigs = byDate();
  const cells = monthCells(state.year, state.month)
    .map((day) => {
      if (!day) return `<span class="cal-empty"></span>`;
      const iso = isoFromParts(state.year, state.month, day);
      const items = gigs.get(iso) || [];
      const item = items[0];
      const weekday = parseDay(iso).getDay();
      const cls = [
        "cal-day",
        item ? "has-gig" : "",
        item && item.id === state.selected ? "is-on" : "",
        iso === TODAY ? "is-today" : "",
        item && claim(item) === 0 && item.date <= TODAY ? "is-settled" : "",
        weekday === 0 || weekday === 6 ? "is-weekend" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <button type="button" class="${cls}" data-open="${item ? item.id : ""}" ${item ? "" : "disabled"}>
          <span>${day}</span>
        </button>`;
    })
    .join("");

  const inMonth = DATES.filter((item) => {
    const dt = parseDay(item.date);
    return dt.getFullYear() === state.year && dt.getMonth() === state.month;
  });
  const upcoming =
    inMonth.find((item) => item.date >= TODAY) || DATES.find((item) => item.date >= TODAY) || inMonth[0];
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  return `
    <div class="cal-dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
    ${
      state.month !== todayMonth || state.year !== todayYear
        ? `<button type="button" class="chip" data-today>Danas</button>`
        : ""
    }
    ${
      upcoming
        ? `<button type="button" class="next-card" data-open="${upcoming.id}">
            <span class="kicker">${upcoming.date >= TODAY ? "Sledeći list" : "List ovog meseca"}</span>
            <strong>${upcoming.city || "Bez grada"}</strong>
            <span>${parseDay(upcoming.date).getDate()}. ${MONTHS[parseDay(upcoming.date).getMonth()]}${upcoming.venue ? ` · ${upcoming.venue}` : ""}${upcoming.bandName ? ` · ${upcoming.bandName}` : ""}</span>
          </button>`
        : `<p class="empty">${DATES.length ? "Nema listova ovog meseca." : "Nema termina u rasporedu."}</p>`
    }
    ${
      inMonth.length > 1
        ? `<div class="month-index">${inMonth
            .map((item) => {
              const dt = parseDay(item.date);
              return `<button type="button" class="month-row ${item.id === state.selected ? "is-on" : ""}" data-open="${item.id}">
                <span>${dt.getDate()}.</span>
                <strong>${item.city || "—"}</strong>
                <small>${item.venue || item.bandName || ""}</small>
              </button>`;
            })
            .join("")}</div>`
        : ""
    }`;
}

function renderSheet() {
  const item = selectedGig();
  if (!item) return `<p class="empty">Nema lista za otvoriti.</p>`;
  const dt = parseDay(item.date);
  const due = claim(item);
  return `
    <article class="sheet ${due === 0 && item.date <= TODAY ? "is-settled" : ""}">
      <div class="sheet-top">
        <p class="sheet-id">${item.bandName ? escapeAttr(item.bandName) : "List"} · ${item.id}</p>
        <h2 class="sheet-date">${dt.getDate()}.</h2>
        <p class="sheet-when">${WEEKDAYS[dt.getDay()]}</p>
      </div>
      <div class="fields">
        ${field("city", "Grad", item.city)}
        ${field("venue", "Sala", item.venue)}
        ${field("note", "Beleška", item.note)}
      </div>
      <div class="times">
        ${TIME_LABELS.map(
          ([key, label]) => `
          <label class="time-row">
            <span>${label}</span>
            <input type="time" data-time="${key}" value="${item.times[key] || ""}" />
          </label>`,
        ).join("")}
      </div>
      <div class="money">
        <h3>Tvoje</h3>
        <div class="fee-row"><span>Honorar</span><b>${money(item.fee)}</b></div>
        <div class="fee-row"><span>Put / isplate</span><b>${money(item.travel)}</b></div>
        <div class="exp-row"><span>Uplaćeno</span><b>${money(item.paid)}</b></div>
        <div class="total"><span>Ostaje</span><b>${money(due)}</b></div>
      </div>
    </article>`;
}

function renderLedger() {
  if (!DATES.length) return `<p class="empty">Nema stavki u knjizi.</p>`;
  let run = 0;
  const owed = DATES.reduce((sum, item) => sum + Math.max(0, claim(item)), 0);
  const rows = DATES.map((item) => {
    const due = claim(item);
    run += due;
    const dt = parseDay(item.date);
    return `
      <button type="button" class="ledger-row ${item.id === state.selected ? "is-on" : ""}" data-open="${item.id}">
        <span class="ledger-date">${dt.getDate()}. ${MONTHS[dt.getMonth()].slice(0, 3)}</span>
        <span class="ledger-main">
          <strong>${item.city || "—"}</strong>
          <small>${item.venue || item.bandName || ""}</small>
        </span>
        <span class="ledger-amt">
          <b>${due === 0 && item.date <= TODAY ? "plać." : money(due)}</b>
          <small>${money(run)}</small>
        </span>
      </button>`;
  }).join("");
  return `
    <div class="summary">
      <span class="kicker">Još potražuje</span>
      <strong>${money(owed)}</strong>
    </div>
    <div class="ledger-list">${rows}</div>`;
}

function renderCast() {
  if (!CAST.length) {
    return `<p class="empty">Nema postave za ovaj bend — ili si na „svi bendovi“ bez grupnog benda.</p>`;
  }
  return `
    <ul class="cast-list">
      ${CAST.map(
        (member) => `
        <li>
          <span class="role">${member.role}</span>
          <strong>${member.name}</strong>
          <b>${member.fee ? money(member.fee) : "—"}</b>
        </li>`,
      ).join("")}
    </ul>`;
}

function syncChrome() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    const on = btn.dataset.view === state.view;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-current", on ? "page" : "false");
  });

  const item = selectedGig();
  const dt = item ? parseDay(item.date) : now;
  const index = selectedIndex();
  const showPager = state.view === "kalendar" || (state.view === "list" && DATES.length);
  barLeft.disabled = !showPager || (state.view === "list" && index <= 0);
  barRight.disabled = !showPager || (state.view === "list" && index >= DATES.length - 1);

  if (state.view === "kalendar") {
    barKicker.textContent = String(state.year);
    barTitle.textContent = MONTHS[state.month];
    barLeft.setAttribute("aria-label", "Prethodni mesec");
    barRight.setAttribute("aria-label", "Sledeći mesec");
  } else if (state.view === "list" && item) {
    barKicker.textContent = `${dt.getDate()}. ${MONTHS[dt.getMonth()]}`;
    barTitle.textContent = item.city || "List";
    barLeft.setAttribute("aria-label", "Prethodni list");
    barRight.setAttribute("aria-label", "Sledeći list");
  } else if (state.view === "knjiga") {
    barKicker.textContent = state.bandLabel;
    barTitle.textContent = "Knjiga";
  } else {
    barKicker.textContent = "Ko ide";
    barTitle.textContent = "Postava";
  }

  const want = `#${state.view}`;
  if (location.hash !== want) history.replaceState(null, "", want);
}

function render() {
  syncChrome();
  app.classList.remove("is-in");
  if (state.phase === "loading") {
    app.innerHTML = `<p class="empty">Otvaram raspored…</p>`;
  } else if (state.phase === "auth") {
    app.innerHTML = renderNotice(
      "Treba prijava",
      "Listovi čita isti nalog kao Chabar na ovom originu. Uloguj se na glavnoj strani, pa se vrati ovde.",
      "/",
    );
  } else if (state.phase === "error") {
    app.innerHTML = renderNotice("Ne mogu da učitam", escapeAttr(state.error || "Greška"), "/");
  } else if (state.view === "kalendar") app.innerHTML = renderMonth();
  else if (state.view === "knjiga") app.innerHTML = renderLedger();
  else if (state.view === "postava") app.innerHTML = renderCast();
  else app.innerHTML = renderSheet();
  requestAnimationFrame(() => app.classList.add("is-in"));
  app.scrollTop = 0;

  if (state.phase === "ready" && state.view === "list") {
    const item = selectedGig();
    if (item && !item.timesLoaded) {
      ensureDetails(item).then(() => {
        if (state.selected === item.id && state.view === "list") render();
      });
    }
  }
}

function escapeAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function snapshotOf(item) {
  return {
    city: item.city,
    venue: item.venue,
    note: item.note,
    times: { ...item.times },
  };
}

function readDraft() {
  const next = snapshotOf(selectedGig());
  app.querySelectorAll("[data-path]").forEach((input) => {
    next[input.dataset.path] = input.value.trim();
  });
  app.querySelectorAll("[data-time]").forEach((input) => {
    next.times[input.dataset.time] = input.value;
  });
  return next;
}

function describeChange(before, after) {
  const bits = [];
  if (before.city !== after.city) bits.push(`grad ${before.city || "—"} → ${after.city || "—"}`);
  if (before.venue !== after.venue) bits.push(`sala ${before.venue || "—"} → ${after.venue || "—"}`);
  if (before.note !== after.note) bits.push("beleška");
  for (const [key, label] of TIME_LABELS) {
    if (before.times[key] !== after.times[key]) {
      bits.push(`${label.toLowerCase()} ${before.times[key] || "—"} → ${after.times[key] || "—"}`);
    }
  }
  return bits.join(" · ") || "Izmene na listu";
}

function isDirty() {
  if (state.view !== "list" || !selectedGig()) return false;
  if (!app.querySelector("[data-path]")) return false;
  return JSON.stringify(snapshotOf(selectedGig())) !== JSON.stringify(readDraft());
}

function showProof(copy) {
  proofCopy.textContent = copy;
  proof.hidden = false;
  shell.classList.add("is-sheet");
}

function hideProof() {
  proof.hidden = true;
  shell.classList.remove("is-sheet");
  state.draft = null;
  state.pendingAction = null;
}

function leaveGuard(action) {
  if (!isDirty()) {
    action();
    return;
  }
  const after = readDraft();
  const before = snapshotOf(selectedGig());
  state.draft = after;
  state.pendingAction = action;
  showProof(describeChange(before, after));
}

function applyDraft() {
  if (!state.draft || !selectedGig()) return;
  Object.assign(selectedGig(), {
    city: state.draft.city,
    venue: state.draft.venue,
    note: state.draft.note,
    times: { ...state.draft.times },
  });
  const next = state.pendingAction;
  hideProof();
  next?.();
}

function revertDraft() {
  const next = state.pendingAction;
  hideProof();
  next?.();
}

function stayOnSheet() {
  state.pendingAction = null;
  state.draft = null;
  proof.hidden = true;
  shell.classList.remove("is-sheet");
}

function go(view) {
  if (view === state.view) {
    app.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  leaveGuard(() => {
    state.view = view;
    const item = selectedGig();
    if (view === "kalendar" && item) {
      const dt = parseDay(item.date);
      state.year = dt.getFullYear();
      state.month = dt.getMonth();
    }
    tap();
    render();
  });
}

function shiftMonth(delta) {
  const next = new Date(state.year, state.month + delta, 1);
  state.year = next.getFullYear();
  state.month = next.getMonth();
  tap();
  render();
}

function shiftGig(delta) {
  const index = selectedIndex() + delta;
  if (index < 0 || index >= DATES.length) return;
  leaveGuard(() => {
    selectGig(DATES[index].id, "list");
  });
}

function selectGig(id, view = "list") {
  const item = DATES.find((row) => row.id === id);
  if (!item) return;
  state.selected = item.id;
  const dt = parseDay(item.date);
  state.year = dt.getFullYear();
  state.month = dt.getMonth();
  state.view = view;
  tap();
  render();
}

function openGig(id) {
  leaveGuard(() => selectGig(id, "list"));
}

async function ensureDetails(item) {
  if (!item || item.timesLoaded || !item.bandId) return;
  item.timesLoaded = true;
  try {
    const data = await api(`/api/events/${item.eventId}/day-details`, { bandId: item.bandId });
    item.times = {
      gather: data.gatheringTime || "",
      depart: data.departureTime || "",
      sound: data.soundcheckTime || "",
      show: data.showStartTime || "",
      end: data.showEndTime || "",
    };
  } catch {
    item.timesLoaded = false;
  }
}

async function boot() {
  state.token = readAccessToken();
  if (!state.token) {
    state.phase = "auth";
    render();
    return;
  }

  try {
    const storedBand = localStorage.getItem(ACTIVE_BAND_KEY) || ALL_BANDS_ID;
    const me = await api("/api/me");
    state.userName = me.profile?.displayName || me.profile?.email || "";
    const bands = me.bands || [];
    const active = storedBand !== ALL_BANDS_ID ? bands.find((band) => band.id === storedBand) : null;
    const useBandId = active?.id || "";
    state.bandLabel = active?.name || "svi bendovi";
    if (runningEl) {
      runningEl.textContent = `${state.bandLabel} · uživo`;
    }

    const schedule = useBandId
      ? await api("/api/bootstrap?light=1", { bandId: useBandId })
      : await api("/api/my-schedule?light=1");

    let finance = { events: [], payments: [] };
    try {
      finance = await api("/api/my-finance");
    } catch {
      finance = { events: [], payments: [] };
    }

    const extras = new Map((finance.events || []).map((row) => [String(row.id), row]));
    DATES = (schedule.events || [])
      .map((row) => mapEvent(row, extras.get(String(row.id)) || {}))
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date) || Number(a.eventId) - Number(b.eventId));
    settlePaid(DATES, finance.payments || []);

    const upcoming = DATES.find((item) => item.date >= TODAY) || DATES[DATES.length - 1];
    if (upcoming) {
      state.selected = upcoming.id;
      const dt = parseDay(upcoming.date);
      state.year = dt.getFullYear();
      state.month = dt.getMonth();
    } else {
      state.year = now.getFullYear();
      state.month = now.getMonth();
    }

    const groups = bands.filter((band) => band.kind === "group");
    const counts = new Map();
    for (const item of DATES) {
      counts.set(item.bandId, (counts.get(item.bandId) || 0) + 1);
    }
    const castBand =
      (useBandId && groups.find((band) => band.id === useBandId)) ||
      [...groups].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))[0];
    if (castBand) {
      try {
        const home = await api(`/api/bands/${castBand.id}`, { bandId: castBand.id });
        CAST = (home.members || []).map((member) => ({
          role: ROLE_LABEL[member.memberRole] || member.memberRole || "Član",
          name: member.name,
          fee: member.defaultPriceEur || 0,
        }));
      } catch {
        CAST = [];
      }
    }

    state.phase = "ready";
    render();
  } catch (error) {
    state.phase = error.status === 401 ? "auth" : "error";
    state.error = error.message || "Greška";
    render();
  }
}

document.querySelector(".tabs").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-view]");
  if (!btn) return;
  go(btn.dataset.view);
});

barLeft.addEventListener("click", () => {
  if (state.view === "kalendar") shiftMonth(-1);
  else shiftGig(-1);
});

barRight.addEventListener("click", () => {
  if (state.view === "kalendar") shiftMonth(1);
  else shiftGig(1);
});

app.addEventListener("click", (event) => {
  if (event.target.closest("[data-today]")) {
    state.year = now.getFullYear();
    state.month = now.getMonth();
    const todayGig = DATES.find((item) => item.date === TODAY);
    if (todayGig) state.selected = todayGig.id;
    tap();
    render();
    return;
  }
  const open = event.target.closest("[data-open]");
  if (!open || !open.dataset.open) return;
  openGig(open.dataset.open);
});

document.getElementById("proof-ok").addEventListener("click", applyDraft);
document.getElementById("proof-undo").addEventListener("click", revertDraft);
document.getElementById("proof-stay").addEventListener("click", stayOnSheet);
document.getElementById("proof-stay-2").addEventListener("click", stayOnSheet);

let touch = null;

app.addEventListener(
  "touchstart",
  (event) => {
    if (event.target.closest("input, textarea, button, a")) return;
    const t = event.changedTouches[0];
    touch = { x: t.clientX, y: t.clientY, t: Date.now() };
  },
  { passive: true },
);

app.addEventListener(
  "touchend",
  (event) => {
    if (!touch) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    const dt = Date.now() - touch.t;
    touch = null;
    if (dt > 600 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    if (state.view === "kalendar") shiftMonth(dx < 0 ? 1 : -1);
    else if (state.view === "list") shiftGig(dx < 0 ? 1 : -1);
  },
  { passive: true },
);

window.addEventListener("hashchange", () => {
  const view = hashView();
  if (view !== state.view) go(view);
});

if (window.visualViewport) {
  const viewport = window.visualViewport;
  const onViewport = () => {
    const keyboard = window.innerHeight - viewport.height > 80;
    shell.classList.toggle("is-keyboard", keyboard);
    if (keyboard && document.activeElement) {
      document.activeElement.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };
  viewport.addEventListener("resize", onViewport);
  viewport.addEventListener("scroll", onViewport);
}

tickClock();
setInterval(tickClock, 30_000);
render();
boot();
