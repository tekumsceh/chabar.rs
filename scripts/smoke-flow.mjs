/**
 * End-to-end API smoke test — creates a temp user, exercises core flows, cleans up.
 * Run: node scripts/smoke-flow.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const API = process.env.SMOKE_API_URL || "http://127.0.0.1:3001";
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
let failed = 0;

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  results.push({ ok: false, name, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, name, detail = "") {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

async function api(path, { token, bandId, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (bandId) headers["X-Band-Id"] = bandId;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 200) };
    }
  }
  return { status: res.status, data };
}

function futureDateText(daysAhead = 14) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}.`;
}

async function main() {
  console.log("\nChabar smoke flow\n");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    fail("env", "Missing SUPABASE_URL, ANON_KEY, or SERVICE_ROLE_KEY");
    summarize();
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pub = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tag = Date.now();
  const email = `smoke+${tag}@chabar.local`;
  const password = `Smoke!${tag}aA`;

  let userId = null;
  let token = null;
  let personalBandId = null;
  let groupBandId = null;
  let eventA = null;
  let eventB = null;

  try {
    // —— Public / auth guards ——
    {
      const health = await fetch(`${API}/api/health`);
      assert(health.ok, "GET /api/health", String(health.status));
      const unauth = await api("/api/me");
      assert(unauth.status === 401, "GET /api/me without token → 401");
      const badEvent = await api("/api/events", { method: "POST", body: {} });
      assert(badEvent.status === 401, "POST /api/events without token → 401");
    }

    // —— Temp user ——
    {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw new Error(`createUser: ${error.message}`);
      userId = data.user.id;
      pass("create temp user", email);

      const { data: signIn, error: signErr } = await pub.auth.signInWithPassword({ email, password });
      if (signErr) throw new Error(`signIn: ${signErr.message}`);
      token = signIn.session?.access_token;
      assert(Boolean(token), "sign in → access token");
    }

    // —— Bootstrap ——
    {
      const me = await api("/api/me", { token });
      assert(me.status === 200, "GET /api/me", `${me.data?.bands?.length ?? 0} bands`);
      personalBandId = me.data?.bands?.find((b) => b.kind === "personal")?.id;
      assert(Boolean(personalBandId), "personal band exists");
    }

    // —— Create group band ——
    {
      const bandName = `Smoke ${tag}`;
      const created = await api("/api/bands", {
        token,
        method: "POST",
        body: { name: bandName },
      });
      assert(created.status === 201, "POST /api/bands", bandName);
      groupBandId = created.data?.id;
      assert(Boolean(groupBandId), "group band id returned");

      const dupName = await api("/api/bands", { token, method: "POST", body: { name: "" } });
      assert(dupName.status === 400, "POST /api/bands empty name → 400");
    }

    // —— Create events (double booking same date) ——
    const dateText = futureDateText(21);
    {
      const payload = {
        bandId: groupBandId,
        date: dateText,
        city: "Smoke City",
        venue: "Test Venue",
        note: "smoke test",
        priceEur: 0,
        transportRsd: 0,
      };
      const a = await api("/api/events", { token, bandId: groupBandId, method: "POST", body: payload });
      assert(a.status === 201, "POST /api/events (A)", dateText);
      eventA = a.data?.id;

      const b = await api("/api/events", {
        token,
        bandId: groupBandId,
        method: "POST",
        body: { ...payload, city: "Smoke City 2", venue: "Other Venue" },
      });
      assert(b.status === 201, "POST /api/events same date (B) — double booking allowed", dateText);
      eventB = b.data?.id;

      const past = await api("/api/events", {
        token,
        bandId: groupBandId,
        method: "POST",
        body: { ...payload, date: "01.01.2020." },
      });
      assert(past.status === 400, "POST /api/events past date → 400");
    }

    // —— Update + day details + finance guard ——
    {
      const upd = await api(`/api/events/${eventA}`, {
        token,
        bandId: groupBandId,
        method: "PUT",
        body: {
          bandId: groupBandId,
          date: dateText,
          city: "Smoke Updated",
          venue: "Test Venue",
          note: "updated",
          priceEur: 100,
          transportRsd: 0,
        },
      });
      assert(upd.status === 200, "PUT /api/events — update city/fee");

      const day = await api(`/api/events/${eventA}/day-details`, {
        token,
        bandId: groupBandId,
        method: "PUT",
        body: { loadInTime: "14:00", showStartTime: "21:00" },
      });
      assert(day.status === 200, "PUT day-details");

      const schedule = await api("/api/my-schedule", { token });
      assert(schedule.status === 200, "GET /api/my-schedule");
      const found = (schedule.data?.events || []).filter((e) => e.id === eventA || e.id === eventB);
      assert(found.length >= 2, "schedule lists both events", `found ${found.length}`);
    }

    // —— Delete one event ——
    {
      const del = await api(`/api/events/${eventB}`, { token, bandId: groupBandId, method: "DELETE" });
      assert(del.status === 200 || del.status === 204, "DELETE /api/events B");

      const after = await api("/api/my-schedule", { token });
      const still = (after.data?.events || []).some((e) => e.id === eventB);
      assert(!still, "deleted event gone from schedule");
    }

    // —— Wrong band header ——
    {
      const wrong = await api(`/api/events/${eventA}`, {
        token,
        bandId: personalBandId,
        method: "DELETE",
      });
      assert(wrong.status === 404 || wrong.status === 403, "DELETE event with wrong X-Band-Id → blocked");
    }

    // —— Personal band delete blocked ——
    {
      const delPersonal = await api(`/api/bands/${personalBandId}`, {
        token,
        bandId: personalBandId,
        method: "DELETE",
      });
      assert(delPersonal.status === 400 || delPersonal.status === 403, "DELETE personal band → blocked");
    }

    // —— Malformed payloads ——
    {
      const huge = await api("/api/events", {
        token,
        bandId: groupBandId,
        method: "POST",
        body: { bandId: groupBandId, date: dateText, city: "x".repeat(5000) },
      });
      assert(
        huge.status === 201 || (huge.status >= 400 && huge.status < 500),
        "oversized city truncated or rejected safely",
        String(huge.status),
      );
    }
  } catch (error) {
    fail("unexpected", error.message);
  } finally {
    // Cleanup
    try {
      if (token && eventA && groupBandId) {
        await api(`/api/events/${eventA}`, { token, bandId: groupBandId, method: "DELETE" });
      }
      if (token && groupBandId) {
        await api(`/api/bands/${groupBandId}`, { token, bandId: groupBandId, method: "DELETE" });
      }
    } catch {
      /* best effort */
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) fail("cleanup user", error.message);
      else pass("cleanup temp user");
    }
  }

  summarize();
  process.exit(failed > 0 ? 1 : 0);
}

function summarize() {
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} checks passed${failed ? ` (${failed} failed)` : ""}\n`);
}

main();
