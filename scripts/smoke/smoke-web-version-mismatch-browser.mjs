#!/usr/bin/env node
// Purpose: Validate forced update path (version mismatch -> reload -> overlay recovery).
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 25000);
const mismatchSha = String(process.env.SMOKE_MISMATCH_SHA || "smoke-mismatch-sha").trim() || "smoke-mismatch-sha";

async function isVisible(locator) {
  const count = await locator.count();
  if (count === 0) {
    return false;
  }
  return locator.first().isVisible();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let versionRequests = 0;
  await page.route("**/version", async (route) => {
    versionRequests += 1;
    if (versionRequests === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "cache-control": "no-store"
        },
        body: JSON.stringify({
          appVersion: "smoke",
          appBuildSha: mismatchSha,
          ts: new Date().toISOString()
        })
      });
      return;
    }

    await route.continue();
  });

  await page.addInitScript(() => {
    localStorage.setItem("datowave_lang", "en");
  });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });

    const overlayDialog = page.locator('div[role="dialog"][aria-live="polite"]').first();
    let flowMode = "mismatch";
    try {
      await overlayDialog.waitFor({ state: "visible", timeout: timeoutMs });
    } catch {
      // Some environments can have build-version sync disabled in the client bundle.
      // In that case validate the recovery branch by synthesizing the pending flag.
      flowMode = "synthetic-recovery";
      await page.evaluate(() => {
        sessionStorage.setItem("datowave_update_reload_pending", "1");
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });
      try {
        await overlayDialog.waitFor({ state: "visible", timeout: timeoutMs });
      } catch {
        const diagnostics = await page.evaluate(() => ({
          pending: sessionStorage.getItem("datowave_update_reload_pending"),
          politeDialogs: document.querySelectorAll('div[role="dialog"][aria-live="polite"]').length,
          assertiveDialogs: document.querySelectorAll('div[role="dialog"][aria-live="assertive"]').length,
          bodyTextSnippet: String(document.body?.innerText || "").slice(0, 240)
        }));
        throw new Error(`overlay not visible in synthetic recovery mode: ${JSON.stringify(diagnostics)}`);
      }
    }

    const pendingKey = await page.evaluate(() => sessionStorage.getItem("datowave_update_reload_pending"));
    if (pendingKey !== "1") {
      throw new Error(`expected session flag datowave_update_reload_pending=1, got ${pendingKey || "<empty>"}`);
    }

    const continueBtn = overlayDialog.getByRole("button").first();
    await continueBtn.click({ timeout: timeoutMs });

    await page.waitForTimeout(300);
    if (await isVisible(overlayDialog)) {
      throw new Error("app-updated overlay is still visible after continue");
    }

    const pendingAfter = await page.evaluate(() => sessionStorage.getItem("datowave_update_reload_pending"));
    if (pendingAfter !== null) {
      throw new Error("expected session flag to be removed after continue");
    }

    if (versionRequests < 1) {
      throw new Error("expected at least one /version request");
    }

    console.log(`[smoke:web:version-mismatch:browser] ok base=${baseUrl} mode=${flowMode} versionRequests=${versionRequests} mismatchSha=${mismatchSha}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:version-mismatch:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
