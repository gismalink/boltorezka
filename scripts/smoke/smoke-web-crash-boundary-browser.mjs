#!/usr/bin/env node
// Purpose: Browser-level smoke to detect app-level ErrorBoundary crashes after boot.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 25000);
const bearerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const appUrl = `${baseUrl}/`;
const crashMessage = "UI crashed unexpectedly. Please reload and try again.";

async function isVisible(locator) {
  const count = await locator.count();
  if (count === 0) {
    return false;
  }
  return locator.first().isVisible();
}

async function assertNoCrash(page, runtimeErrors) {
  const crashLocator = page.getByText(crashMessage, { exact: true });
  if (await isVisible(crashLocator)) {
    throw new Error(`error boundary message is visible: ${crashMessage}`);
  }

  const reloadUiButton = page.getByRole("button", { name: /reload ui/i });
  if (await isVisible(reloadUiButton)) {
    throw new Error("error boundary fallback button is visible: Reload UI");
  }

  const renderError = runtimeErrors.find((message) => /\[web\]\s+unhandled render error/i.test(message));
  if (renderError) {
    throw new Error(`render error logged to console: ${renderError}`);
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
    await assertNoCrash(page, []);
  }

  // Exercise RNNoise level buttons when visible.
  const levelCandidates = [/none/i, /soft|мягкий/i, /medium|средний/i, /strong|сильный/i];
  for (const levelName of levelCandidates) {
    const levelBtn = settingsModal.getByRole("button", { name: levelName }).first();
    if (await levelBtn.count()) {
      await levelBtn.click({ timeout: timeoutMs });
      await page.waitForTimeout(150);
      await assertNoCrash(page, []);
    }
  }

  return true;
}

async function bootCheck(page, runtimeErrors, label) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });

  // Check repeatedly during first render/effect window to catch startup crashes.
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(500);
    await assertNoCrash(page, runtimeErrors);
  }

  console.log(`- startup path ok (${label})`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  const renderErrors = [];

  const buildTrackedPage = async (token) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("pageerror", (error) => {
      pageErrors.push(String(error?.message || error));
    });

    page.on("console", (msg) => {
      if (msg.type() === "error" && /\[web\]\s+unhandled render error/i.test(msg.text())) {
        renderErrors.push(msg.text());
      }
    });

    await page.addInitScript((presetToken) => {
      localStorage.setItem("boltorezka_lang", "en");
      if (presetToken) {
        localStorage.setItem("boltorezka_token", presetToken);
      } else {
        localStorage.removeItem("boltorezka_token");
      }
    }, token);

    return { context, page };
  };

  try {
    const anonymous = await buildTrackedPage("");
    await bootCheck(anonymous.page, renderErrors, "anonymous");
    await anonymous.context.close();

    if (bearerToken) {
      const authenticated = await buildTrackedPage(bearerToken);
      await bootCheck(authenticated.page, renderErrors, "authenticated");
      await openSoundSettingsFlow(authenticated.page);
      await assertNoCrash(authenticated.page, renderErrors);
      await authenticated.context.close();
    }

    if (pageErrors.length > 0) {
      throw new Error(`pageerror events detected: ${pageErrors.slice(0, 3).join(" | ")}`);
    }

    if (renderErrors.length > 0) {
      throw new Error(`render errors detected: ${renderErrors.slice(0, 3).join(" | ")}`);
    }

    console.log("[smoke:web:crash-boundary:browser] ok");
    console.log("- error boundary fallback is not visible on startup");
    console.log("- runtime console/page errors were not observed");
    if (bearerToken) {
      console.log("- sound settings interaction path passed");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:crash-boundary:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
