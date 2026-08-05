/**
 * Browser smoke — login shell, viewports, basic resilience.
 * Run: node scripts/smoke-browser.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.SMOKE_WEB_URL || "http://127.0.0.1:5175";
const viewports = [
  { name: "iPhone 13", ...devices["iPhone 13"] },
  { name: "iPad Mini", ...devices["iPad Mini"] },
  { name: "Desktop 1280", viewport: { width: 1280, height: 800 } },
];

let failed = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function bad(msg) {
  failed += 1;
  console.error(`  ✗ ${msg}`);
}

async function checkViewport(browser, cfg) {
  const context = await browser.newContext({
    viewport: cfg.viewport,
    userAgent: cfg.userAgent,
    isMobile: cfg.isMobile,
    hasTouch: cfg.hasTouch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  try {
    const res = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!res?.ok()) {
      bad(`${cfg.name}: HTTP ${res?.status()}`);
      return;
    }

    // Login or app shell
    const hasLogin = await page.locator('input[type="email"], input[type="password"]').count();
    const hasApp = await page.locator(".app-shell, .login-page").count();
    if (hasLogin > 0 || hasApp > 0) {
      ok(`${cfg.name}: shell renders (${hasLogin ? "login" : "app"})`);
    } else {
      bad(`${cfg.name}: no login or app shell found`);
    }

    // No fatal JS errors on load
    if (errors.length) {
      bad(`${cfg.name}: JS errors — ${errors.slice(0, 2).join("; ")}`);
    } else {
      ok(`${cfg.name}: no page errors on load`);
    }

    // Rapid hash / reload stress
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      history.pushState({}, "", "#stress");
      history.back();
    });
    ok(`${cfg.name}: reload + history OK`);
  } catch (e) {
    bad(`${cfg.name}: ${e.message}`);
  } finally {
    await context.close();
  }
}

async function checkMalformedNavigation(browser) {
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE}/this-route-does-not-exist-xyz`, { waitUntil: "domcontentloaded" });
    const okShell = (await page.locator(".app-shell, .login-page, #root").count()) > 0;
    if (okShell) ok("unknown route: SPA still loads");
    else bad("unknown route: blank or broken");
  } catch (e) {
    bad(`unknown route: ${e.message}`);
  } finally {
    await page.close();
  }
}

async function main() {
  console.log("\nChabar browser smoke\n");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of viewports) {
      await checkViewport(browser, vp);
    }
    await checkMalformedNavigation(browser);
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} browser check(s) failed\n` : "\nAll browser checks passed\n");
  process.exit(failed > 0 ? 1 : 0);
}

main();
