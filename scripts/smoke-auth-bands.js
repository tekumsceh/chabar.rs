/**
 * Scenario checks for auth + band isolation.
 * Run: node scripts/smoke-auth-bands.js
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const API = process.env.API_BASE || "http://127.0.0.1:3001";
const ownerEmail = (process.env.OWNER_EMAIL || "tekumsceh@gmail.com").toLowerCase();
const friendEmail = "friend-smoke-test@example.com";
const testPassword = "SmokeTest-Temp-9341!";

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error("Missing SUPABASE_URL / ANON / SERVICE_ROLE in .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { token, bandId, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (bandId) headers["X-Band-Id"] = bandId;
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

async function ensureUser(email, password, roleHint) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) throw listed.error;
  let user = listed.data.users.find((u) => (u.email || "").toLowerCase() === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: roleHint || email },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;
  }
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user, token: data.session.access_token };
}

console.log("=== IO Organize smoke checks ===\n");

// 1) Health
{
  const { status, data } = await api("/api/health");
  status === 200 && data?.ok ? ok("GET /api/health") : fail("GET /api/health", `${status} ${JSON.stringify(data)}`);
}

// 2) No token → unauthorized
{
  const { status } = await api("/api/bootstrap");
  status === 401 ? ok("bootstrap without token → 401") : fail("bootstrap without token → 401", `got ${status}`);
}

// 3) Owner login + me
const owner = await ensureUser(ownerEmail, testPassword, "owner");
let ownerBands = [];
{
  const { status, data } = await api("/api/me", { token: owner.token });
  if (status === 200 && data?.profile?.email?.toLowerCase() === ownerEmail) {
    ok("owner /api/me", `role=${data.profile.role}, bands=${data.bands.length}`);
    ownerBands = data.bands;
  } else {
    fail("owner /api/me", `${status} ${JSON.stringify(data)}`);
  }
}

const personal = ownerBands.find((b) => b.kind === "personal");
const marko = ownerBands.find((b) => b.name === "Marko Louis");
const saint = ownerBands.find((b) => b.name === "Saint Louis");

personal ? ok("owner has Personal band") : fail("owner has Personal band");
marko ? ok("owner has Marko Louis") : fail("owner has Marko Louis");
saint ? ok("owner has Saint Louis") : fail("owner has Saint Louis");
ownerBands.every((b) => b.memberRole === "owner")
  ? ok("owner is manager/owner on all their bands")
  : fail("owner is manager/owner on all their bands", JSON.stringify(ownerBands));

// 4) Personal band has migrated finance data
let personalBootstrap = null;
if (personal) {
  const { status, data } = await api("/api/bootstrap", { token: owner.token, bandId: personal.id });
  personalBootstrap = data;
  if (status === 200 && Array.isArray(data.events) && data.events.length >= 40) {
    ok("Personal bootstrap has events", `${data.events.length} events, ${data.payments.length} payments`);
  } else {
    fail("Personal bootstrap has events", `${status} events=${data?.events?.length}`);
  }
}

// 5) Group bands are empty (or at least not the personal dump)
for (const band of [marko, saint].filter(Boolean)) {
  const { status, data } = await api("/api/bootstrap", { token: owner.token, bandId: band.id });
  if (status === 200 && data.events.length === 0 && data.payments.length === 0) {
    ok(`${band.name} is empty`, "no events/payments");
  } else if (status === 200 && data.events.length < (personalBootstrap?.events?.length || 999)) {
    ok(`${band.name} isolated from Personal`, `${data.events.length} events (not Personal dump)`);
  } else {
    fail(`${band.name} empty/isolated`, `${status} events=${data?.events?.length}`);
  }
}

// 6) Friend cannot read owner's personal band
const friend = await ensureUser(friendEmail, testPassword, "friend");
{
  const { status, data } = await api("/api/me", { token: friend.token });
  if (status === 200) {
    ok("friend /api/me works", `bands=${data.bands.length}`);
    const friendPersonal = data.bands.find((b) => b.kind === "personal");
    if (friendPersonal && personal && friendPersonal.id !== personal.id) {
      ok("friend Personal band != owner Personal band");
    } else {
      fail("friend Personal band != owner Personal band");
    }
  } else {
    fail("friend /api/me works", `${status}`);
  }
}

if (personal) {
  const { status } = await api("/api/bootstrap", { token: friend.token, bandId: personal.id });
  status === 403
    ? ok("friend blocked from owner Personal band → 403")
    : fail("friend blocked from owner Personal band → 403", `got ${status}`);
}

// 7) CRUD only on own band: create event on Marko, ensure not in Personal
if (marko && personal) {
  const created = await api("/api/events", {
    token: owner.token,
    bandId: marko.id,
    method: "POST",
    body: { date: "01.01.2099.", city: "Smoke", venue: "Test", note: "smoke", priceEur: 1, transportRsd: 0 },
  });
  if (created.status === 201 && created.data?.id) {
    ok("create event on Marko Louis");
    const markoData = await api("/api/bootstrap", { token: owner.token, bandId: marko.id });
    const personalData = await api("/api/bootstrap", { token: owner.token, bandId: personal.id });
    const inMarko = markoData.data.events.some((e) => e.id === created.data.id);
    const inPersonal = personalData.data.events.some((e) => e.id === created.data.id);
    inMarko && !inPersonal
      ? ok("new event only visible in Marko Louis")
      : fail("new event only visible in Marko Louis", `marko=${inMarko} personal=${inPersonal}`);

    const deleted = await api(`/api/events/${created.data.id}`, {
      token: owner.token,
      bandId: marko.id,
      method: "DELETE",
    });
    deleted.status === 204 ? ok("cleanup delete Marko smoke event") : fail("cleanup delete", `${deleted.status}`);
  } else {
    fail("create event on Marko Louis", `${created.status} ${JSON.stringify(created.data)}`);
  }
}

// 8) Missing band header
{
  const { status } = await api("/api/bootstrap", { token: owner.token });
  status === 400 ? ok("bootstrap without X-Band-Id → 400") : fail("bootstrap without X-Band-Id → 400", `got ${status}`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
