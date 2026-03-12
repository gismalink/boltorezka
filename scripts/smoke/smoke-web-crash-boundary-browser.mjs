#!/usr/bin/env node
// Purpose: Browser-level smoke to detect app-level ErrorBoundary crashes after boot.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 25000);
const appUrl = `${baseUrl}/`;
const crashMessage = "UI crashed unexpectedly. Please reload and try again.";

async function assertNoCrash(page) {
  const crashLocator = page.getByText(crashMessage, { exact: true });
  const count = await crashLocator.count();
  if (count > 0 && (await crashLocator.first().isVisible())) {
    throw new Error(`error boundary message is visible: ${crashMessage}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });

    // Allow app effects to settle, then assert that the ErrorBoundary fallback never appears.
    await page.waitForTimeout(1500);
    await assertNoCrash(page);
    await page.waitForTimeout(1500);
    await assertNoCrash(page);

    console.log("[smoke:web:crash-boundary:browser] ok");
    console.log("- app root visible");
    console.log("- error boundary fallback is not visible");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:crash-boundary:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
