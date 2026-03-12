#!/usr/bin/env node
// Purpose: Browser-level smoke to detect app-level ErrorBoundary crashes after boot.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 25000);
const bearerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const appUrl = `${baseUrl}/`;
const crashMessage = "UI crashed unexpectedly. Please reload and try again.";

async function assertNoCrash(page) {
  const crashLocator = page.getByText(crashMessage, { exact: true });
  const count = await crashLocator.count();
  if (count > 0 && (await crashLocator.first().isVisible())) {
    throw new Error(`error boundary message is visible: ${crashMessage}`);
  }
}

async function openSoundSettingsFlow(page) {
  const caretButton = page.locator(".split-caret-btn").first();
  if (await caretButton.count() === 0) {
    return false;
  }

  await caretButton.click({ timeout: timeoutMs });

  const voiceSettingsBtn = page.getByRole("button", { name: /voice settings|настройки голоса/i });
  await voiceSettingsBtn.waitFor({ state: "visible", timeout: timeoutMs });
  await voiceSettingsBtn.click({ timeout: timeoutMs });

  const settingsModal = page.locator(".user-settings-modal").first();
  await settingsModal.waitFor({ state: "visible", timeout: timeoutMs });

  // Toggle available sound switches to exercise runtime-side hooks.
  const switches = settingsModal.locator(".ui-switch");
  const switchCount = await switches.count();
  for (let i = 0; i < Math.min(switchCount, 4); i += 1) {
    await switches.nth(i).click({ timeout: timeoutMs });
    await page.waitForTimeout(150);
    await assertNoCrash(page);
  }

  // Exercise RNNoise level buttons when visible.
  const levelCandidates = [/none/i, /soft|мягкий/i, /medium|средний/i, /strong|сильный/i];
  for (const levelName of levelCandidates) {
    const levelBtn = settingsModal.getByRole("button", { name: levelName }).first();
    if (await levelBtn.count()) {
      await levelBtn.click({ timeout: timeoutMs });
      await page.waitForTimeout(150);
      await assertNoCrash(page);
    }
  }

  return true;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const runtimeErrors = [];

  page.on("pageerror", (error) => {
    runtimeErrors.push(String(error?.message || error));
  });

  try {
    await page.addInitScript((token) => {
      if (token) {
        localStorage.setItem("boltorezka_token", token);
      }
      localStorage.setItem("boltorezka_lang", "en");
    }, bearerToken);

    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });

    // Allow app effects to settle, then assert that the ErrorBoundary fallback never appears.
    await page.waitForTimeout(2000);
    await assertNoCrash(page);
    await openSoundSettingsFlow(page);
    await page.waitForTimeout(2000);
    await assertNoCrash(page);

    if (runtimeErrors.length > 0) {
      throw new Error(`runtime page errors detected: ${runtimeErrors.slice(0, 3).join(" | ")}`);
    }

    console.log("[smoke:web:crash-boundary:browser] ok");
    console.log("- app root visible");
    console.log("- error boundary fallback is not visible at boot and after sound-settings interactions");
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
