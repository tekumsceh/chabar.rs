/** Mock-only data for the Studio visual lab. Not connected to API/DB. */

export const mockBands = [
  { id: "all", name: "Sve", color: "#276ef1" },
  { id: "personal", name: "Personal", kind: "personal", color: "#0b875b" },
  { id: "demo", name: "Plava Soba", kind: "group", color: "#2563eb" },
  { id: "marko", name: "Marko Louis", kind: "group", color: "#7c3aed" },
  { id: "saint", name: "Saint Louis", kind: "group", color: "#b45309" },
  { id: "nocni", name: "Noćni Voz", kind: "group", color: "#0e7490" },
  { id: "brass", name: "Balkan Brass", kind: "group", color: "#c2410c" },
  { id: "echo", name: "Echo Trio", kind: "group", color: "#4d7c0f" },
];

/** ~32 fake people for Band member-list stress testing (Studio only). */
const MOCK_USER_SEED = [
  "Ana Kovač",
  "Marko Jović",
  "Petar Ilić",
  "Jovan Stević",
  "Luka Matić",
  "Nemanja Popović",
  "Mila Đorđević",
  "Ivana Ristić",
  "Stefan Nikolić",
  "Tara Vasić",
  "Filip Živković",
  "Una Petrović",
  "Nikola Savić",
  "Teodora Minić",
  "Aleksa Todorović",
  "Sara Stanković",
  "Vuk Radovanović",
  "Hana Milošević",
  "Ognjen Pavlović",
  "Lara Janković",
  "Đorđe Simić",
  "Maša Lukić",
  "Andrej Kostić",
  "Nina Bogdanović",
  "Vladimir Antić",
  "Jelena Marković",
  "Miloš Đukić",
  "Kristina Vuković",
  "Bojan Tasić",
  "Elena Radosavljević",
  "Goran Mladenović",
  "Sofija Cvetković",
];

function mockEmail(name) {
  return `${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")}@mock.test`;
}

export const mockUsers = MOCK_USER_SEED.map((name, index) => ({
  id: `mock-u${index + 1}`,
  name,
  email: mockEmail(name),
}));

function assignMembers(indices, roles = {}) {
  return indices.map((index, order) => {
    const user = mockUsers[index];
    const memberRole = roles[index] || (order === 0 ? "owner" : "member");
    return { ...user, memberRole };
  });
}

export const mockBandMembers = {
  /** Small demo band for Bend chat / tools swipe testing */
  demo: assignMembers([0, 1, 2, 3, 4, 5], { 0: "owner", 1: "admin" }),
  marko: assignMembers(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    { 0: "owner", 1: "admin", 2: "admin" },
  ),
  saint: assignMembers([1, 4, 5, 18, 19, 20, 21, 22, 23, 24, 25], { 1: "owner", 4: "admin" }),
  nocni: assignMembers([6, 7, 8, 9, 26, 27, 28, 29, 30, 31, 10, 11], { 6: "owner", 7: "admin" }),
  brass: assignMembers([12, 13, 14, 15, 16, 17, 18, 19, 20], { 12: "owner" }),
  echo: assignMembers([21, 22, 23], { 21: "owner", 22: "admin" }),
  personal: [{ id: "p1", name: "Ti", email: "ti@mock.test", memberRole: "owner" }],
};

/** Legacy notices meta (unused by chat UI; kept for older studio refs). */
export const mockBandPages = {
  demo: { tagline: "Studio mock bend", notices: [] },
  marko: { tagline: "Groove & soul", notices: [] },
  saint: { tagline: "Funk collective", notices: [] },
  nocni: { tagline: "Indie / rock", notices: [] },
  brass: { tagline: "Truba & perkusije", notices: [] },
  echo: { tagline: "Acoustic trio", notices: [] },
  personal: { tagline: "", notices: [] },
};

function chatMsg({ id, authorIndex, body, time, mine = false, kind = "text", pinned = false }) {
  const author = authorIndex == null ? null : mockUsers[authorIndex];
  return {
    id,
    authorId: mine ? "me" : author?.id || "system",
    authorName: mine ? "Ti" : author?.name || "",
    body,
    time,
    mine,
    kind,
    pinned,
  };
}

/** Viber-style group threads for Studio Bend preview. */
export const mockBandChats = {
  demo: [
    chatMsg({ id: "d0", kind: "day", body: "Danas" }),
    chatMsg({ id: "d1", kind: "system", body: "Plava Soba grupa je kreirana" }),
    chatMsg({
      id: "d2",
      authorIndex: 0,
      body: "Ćao ekipa — ovo je mock bend za test alata.",
      time: "14:02",
      pinned: true,
    }),
    chatMsg({ id: "d3", authorIndex: 1, body: "Swipe levo za članove / alate.", time: "14:03" }),
    chatMsg({ id: "d4", authorIndex: 2, body: "Ja sam član, samo čitam.", time: "14:05" }),
    chatMsg({ id: "d5", authorIndex: 3, body: "Ima li probe ove nedelje?", time: "14:08" }),
    chatMsg({ id: "d6", mine: true, body: "Da — čet + tools panel rade lokalno.", time: "14:10" }),
    chatMsg({ id: "d7", authorIndex: 4, body: "Super, javite setlistu.", time: "14:12" }),
  ],
  marko: [
    chatMsg({ id: "d1", kind: "day", body: "Danas" }),
    chatMsg({
      id: "m1",
      authorIndex: 0,
      body: "Ekipe, proba u utorak 19:00 — Dom omladine sala 2.",
      time: "09:12",
      pinned: true,
    }),
    chatMsg({ id: "m2", authorIndex: 1, body: "Ok, stižem malo ranije.", time: "09:14" }),
    chatMsg({ id: "m3", authorIndex: 3, body: "Doneti note za novi set?", time: "09:16" }),
    chatMsg({ id: "m4", authorIndex: 0, body: "Da — i kablove, PA je naša.", time: "09:17" }),
    chatMsg({
      id: "m5",
      kind: "system",
      body: "Petar Ilić je promenio naziv grupe u Marko Louis",
    }),
    chatMsg({ id: "m6", authorIndex: 6, body: "SPENS rider poslat ✅", time: "10:02" }),
    chatMsg({
      id: "m7",
      mine: true,
      body: "Super. Ja vodim transport.",
      time: "10:05",
    }),
    chatMsg({ id: "m8", authorIndex: 2, body: "Ko vozi u subotu?", time: "11:40" }),
    chatMsg({ id: "m9", authorIndex: 4, body: "Ja mogu, imam kombija.", time: "11:42" }),
    chatMsg({ id: "m10", authorIndex: 8, body: "Brao 🔥", time: "11:43" }),
  ],
  saint: [
    chatMsg({ id: "d1", kind: "day", body: "Juče" }),
    chatMsg({
      id: "s1",
      authorIndex: 1,
      body: "Nova odeća za nastupe: crno / belo, bez logoa.",
      time: "18:20",
      pinned: true,
    }),
    chatMsg({ id: "s2", authorIndex: 4, body: "Do kada dogovor?", time: "18:22" }),
    chatMsg({ id: "s3", authorIndex: 1, body: "Do kraja meseca.", time: "18:23" }),
    chatMsg({ id: "d2", kind: "day", body: "Danas" }),
    chatMsg({ id: "s4", authorIndex: 18, body: "Imamo probe sutra?", time: "08:01" }),
    chatMsg({ id: "s5", mine: true, body: "Da, 17:30.", time: "08:10" }),
  ],
  nocni: [
    chatMsg({ id: "d1", kind: "day", body: "Danas" }),
    chatMsg({
      id: "n1",
      authorIndex: 6,
      body: "Vanredna proba subota 11:00 — samo ritam sekcija.",
      time: "12:00",
    }),
    chatMsg({ id: "n2", authorIndex: 7, body: "Ja sam in.", time: "12:05" }),
    chatMsg({ id: "n3", authorIndex: 9, body: "Kasnim 15min.", time: "12:08" }),
    chatMsg({ id: "n4", mine: true, body: "Ok, javite kad krenete.", time: "12:10" }),
  ],
  brass: [
    chatMsg({ id: "d1", kind: "day", body: "Danas" }),
    chatMsg({ id: "b1", kind: "system", body: "Balkan Brass grupa je kreirana" }),
    chatMsg({ id: "b2", authorIndex: 12, body: "Ćao ekipa — prvi nastup krajem avgusta.", time: "15:00" }),
    chatMsg({ id: "b3", authorIndex: 14, body: "Javljam se za trubu 2.", time: "15:12" }),
  ],
  echo: [
    chatMsg({ id: "d1", kind: "day", body: "Danas" }),
    chatMsg({
      id: "e1",
      authorIndex: 21,
      body: "Setlista v3 — dodata 2 nova komada, proveriti tonove.",
      time: "16:40",
      pinned: true,
    }),
    chatMsg({ id: "e2", authorIndex: 22, body: "Slušam uveče.", time: "16:55" }),
    chatMsg({ id: "e3", mine: true, body: "Šaljem snimak probe.", time: "17:02" }),
  ],
  personal: [
    chatMsg({ id: "d1", kind: "day", body: "Danas" }),
    chatMsg({ id: "p1", kind: "system", body: "Lični prostor — beleške i podsetnici" }),
    chatMsg({ id: "p2", mine: true, body: "Pozvati venue zbog parkinga.", time: "09:30" }),
  ],
};

export const mockSummary = {
  nextShow: {
    id: 1,
    date: "25.07.2026.",
    city: "Novi Sad",
    venue: "SPENS",
    band: "Marko Louis",
    feeEur: 450,
    daysAway: 8,
  },
  claimEur: 1280.5,
  paidEur: 3420,
  upcoming: 6,
  done: 12,
};

/**
 * Schedule events shaped like live API rows (SchedulePage / TerminDetailPage).
 * Past vs upcoming is derived from mockFinanceSettings.asOfDate in the real pages.
 */
export const mockScheduleEvents = [
  {
    id: 1,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "25.07.2026.",
    city: "Novi Sad",
    venue: "SPENS",
    note: "Open air",
    priceEur: 450,
    transportRsd: 4200,
  },
  {
    id: 2,
    bandId: "saint",
    bandName: "Saint Louis",
    date: "02.08.2026.",
    city: "Beograd",
    venue: "Dom omladine",
    note: "",
    priceEur: 380,
    transportRsd: 0,
  },
  {
    id: 3,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "09.08.2026.",
    city: "Bač",
    venue: "Letnja pozornica",
    note: "",
    priceEur: 0,
    transportRsd: 8500,
  },
  {
    id: 4,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "15.06.2026.",
    city: "Valjevo",
    venue: "Centar",
    note: "",
    priceEur: 400,
    transportRsd: 3100,
  },
  {
    id: 5,
    bandId: "saint",
    bandName: "Saint Louis",
    date: "08.06.2026.",
    city: "Podgorica",
    venue: "City Hall",
    note: "Delimično plaćeno",
    priceEur: 500,
    transportRsd: 12000,
  },
  {
    id: 6,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "21.05.2026.",
    city: "Bijelo Polje",
    venue: "Dom kulture",
    note: "",
    priceEur: 280,
    transportRsd: 9000,
  },
  {
    id: 7,
    bandId: "personal",
    bandName: "Personal",
    date: "03.05.2026.",
    city: "Beograd",
    venue: "Studio",
    note: "Solo",
    priceEur: 150,
    transportRsd: 0,
  },
];

/** @deprecated Prefer mockScheduleEvents — kept only if something still imports mockDates. */
export const mockDates = mockScheduleEvents.map((row) => ({
  id: row.id,
  date: row.date,
  city: row.city,
  venue: row.venue,
  note: row.note,
  band: row.bandName,
  when: "upcoming",
  payStatus: "open",
  feeEur: row.priceEur,
  transportRsd: row.transportRsd,
}));

/**
 * Finance events shaped like API rows, plus band-mode breakdown fields.
 * Naming note: "honorar/honorari", "troskovi", "uplate" may get clearer labels later.
 */
export const mockFinanceEvents = [
  {
    id: 1,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "25.07.2026.",
    city: "Novi Sad",
    venue: "SPENS",
    note: "Open air",
    priceEur: 450,
    transportRsd: 4200,
    memberWages: [
      { id: "m1", name: "Marko", priceEur: 200 },
      { id: "m2", name: "Petar", priceEur: 150 },
      { id: "m3", name: "Jovan", priceEur: 100 },
    ],
    expenseItems: [
      { id: "e1", label: "Smestaj", amount: 80, currency: "EUR" },
      { id: "e2", label: "Gorivo", amount: 6500, currency: "RSD" },
    ],
  },
  {
    id: 2,
    bandId: "saint",
    bandName: "Saint Louis",
    date: "02.08.2026.",
    city: "Beograd",
    venue: "Dom omladine",
    note: "",
    priceEur: 380,
    transportRsd: 0,
    memberWages: [
      { id: "s1", name: "Luka", priceEur: 200 },
      { id: "s2", name: "Nemanja", priceEur: 180 },
    ],
    expenseItems: [{ id: "e3", label: "Rider", amount: 40, currency: "EUR" }],
  },
  {
    id: 4,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "15.06.2026.",
    city: "Valjevo",
    venue: "Centar",
    note: "",
    priceEur: 400,
    transportRsd: 3100,
    memberWages: [
      { id: "m1", name: "Marko", priceEur: 180 },
      { id: "m2", name: "Petar", priceEur: 120 },
      { id: "m3", name: "Jovan", priceEur: 100 },
    ],
    expenseItems: [],
  },
  {
    id: 5,
    bandId: "saint",
    bandName: "Saint Louis",
    date: "08.06.2026.",
    city: "Podgorica",
    venue: "City Hall",
    note: "Delimično plaćeno",
    priceEur: 500,
    transportRsd: 12000,
    memberWages: [
      { id: "s1", name: "Luka", priceEur: 260 },
      { id: "s2", name: "Nemanja", priceEur: 240 },
    ],
    expenseItems: [{ id: "e4", label: "Parking", amount: 15, currency: "EUR" }],
  },
  {
    id: 6,
    bandId: "marko",
    bandName: "Marko Louis",
    date: "21.05.2026.",
    city: "Bijelo Polje",
    venue: "Dom kulture",
    note: "",
    priceEur: 280,
    transportRsd: 9000,
    memberWages: [
      { id: "m1", name: "Marko", priceEur: 120 },
      { id: "m2", name: "Petar", priceEur: 90 },
      { id: "m3", name: "Jovan", priceEur: 70 },
    ],
    expenseItems: [],
  },
  {
    id: 7,
    bandId: "personal",
    bandName: "Personal",
    date: "03.05.2026.",
    city: "Beograd",
    venue: "Studio",
    note: "Solo",
    priceEur: 150,
    transportRsd: 0,
    memberWages: [{ id: "p1", name: "Ti", priceEur: 150 }],
    expenseItems: [],
  },
];

export const mockPayments = [
  { id: 1, date: "10.06.2026.", amount: 800, currency: "EUR" },
  { id: 2, date: "01.06.2026.", amount: 45000, currency: "RSD" },
  { id: 3, date: "20.05.2026.", amount: 600, currency: "EUR" },
  { id: 4, date: "12.07.2026.", amount: 200, currency: "EUR" },
];

export const mockFinanceSettings = {
  exchangeRate: 116.5,
  asOfDate: "18.07.2026.",
};

export const mockFinanceBands = mockBands
  .filter((band) => band.id !== "all")
  .map((band) => ({ ...band, memberRole: "owner" }));
