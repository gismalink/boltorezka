#!/usr/bin/env node
// Purpose: Browser-level smoke for RNNoise on/off flow in Voice Settings.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 25000);
const bearerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const appUrl = `${baseUrl}/`;
const crashMessage = "UI crashed unexpectedly. Please reload and try again.";

if (!bearerToken) {
  console.error("[smoke:web:rnnoise:browser] FAILED");
  console.error("SMOKE_TEST_BEARER_TOKEN is required for authenticated RNNoise smoke");
  process.exit(1);
}

async function isVisible(locator) {
  const count = await locator.count();
  if (count === 0) {
    return false;
  }
  return locator.first().isVisible();
}

async function assertNoCrash(page, runtimeErrors) {
  const fallback = page.locator('[data-testid="error-boundary-fallback"]').first();
  if (await isVisible(fallback)) {
    const errorText = (await fallback.innerText()).trim();
    throw new Error(`error boundary fallback is visible: ${errorText}`);
  }

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

async function openSoundSettings(page, runtimeErrors) {
  const voiceSettingsBtn = page.getByRole("button", { name: /voice settings|настройки голоса/i }).first();

  // Path A: open split menu and click "Voice Settings".
  if (await voiceSettingsBtn.count() === 0 || !(await voiceSettingsBtn.isVisible().catch(() => false))) {
    const caretButtons = page.locator(".split-caret-btn");
    const caretCount = await caretButtons.count();
    let opened = false;
    for (let i = 0; i < caretCount; i += 1) {
      const candidate = caretButtons.nth(i);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }
      await candidate.click({ timeout: timeoutMs });
      if (await voiceSettingsBtn.isVisible().catch(() => false)) {
        opened = true;
        break;
      }
    }

    // Path B: open generic user settings and switch to Sound tab.
    if (!opened && !(await voiceSettingsBtn.isVisible().catch(() => false))) {
      const userSettingsBtn = page.getByRole("button", { name: /user settings|настройки пользователя/i }).first();
      if (await userSettingsBtn.count() > 0 && await userSettingsBtn.isVisible().catch(() => false)) {
        await userSettingsBtn.click({ timeout: timeoutMs });
      }

      // Path C: open profile menu in the header and launch user settings.
      if (!(await page.locator(".user-settings-modal:visible").first().isVisible().catch(() => false))) {
        const profileIcon = page.locator(".profile-icon").first();
        if (await profileIcon.count() > 0 && await profileIcon.isVisible().catch(() => false)) {
          await profileIcon.click({ timeout: timeoutMs });
          const profileSettingsBtn = page.getByRole("button", { name: /user settings|настройки пользователя/i }).first();
          if (await profileSettingsBtn.count() > 0 && await profileSettingsBtn.isVisible().catch(() => false)) {
            await profileSettingsBtn.click({ timeout: timeoutMs });
          }
        }
      }
    }
  }

  if (await voiceSettingsBtn.count() > 0 && await voiceSettingsBtn.isVisible().catch(() => false)) {
    await voiceSettingsBtn.click({ timeout: timeoutMs });
  }

  const settingsModal = page.locator(".user-settings-modal:visible").first();
  await settingsModal.waitFor({ state: "visible", timeout: timeoutMs });

  const soundTab = settingsModal.getByRole("button", { name: /sound|звук/i }).first();
  if (await soundTab.count() > 0 && await soundTab.isVisible().catch(() => false)) {
    await soundTab.click({ timeout: timeoutMs });
  }

  await assertNoCrash(page, runtimeErrors);
  return settingsModal;
}

async function setRnnSwitch(settingsModal, enabled) {
  const switchRow = settingsModal.locator(".voice-sound-checkbox", {
    hasText: /voice filtering|фильтрация голоса/i
  }).first();

  await switchRow.waitFor({ state: "visible", timeout: timeoutMs });

  const toggle = switchRow.getByRole("switch").first();
  await toggle.waitFor({ state: "visible", timeout: timeoutMs });

  const current = await toggle.getAttribute("aria-checked");
  const currentEnabled = current === "true";
  if (currentEnabled !== enabled) {
    await toggle.click({ timeout: timeoutMs });
  }

  await toggle.waitFor({ state: "visible", timeout: timeoutMs });
  const next = await toggle.getAttribute("aria-checked");
  const nextEnabled = next === "true";
  if (nextEnabled !== enabled) {
    throw new Error(`RNNoise switch did not reach expected state: expected=${enabled} actual=${next}`);
  }
}

async function setRnnLevel(settingsModal, levelNameRegex) {
  const levelButton = settingsModal.getByRole("button", { name: levelNameRegex }).first();
  await levelButton.waitFor({ state: "visible", timeout: timeoutMs });
  await levelButton.click({ timeout: timeoutMs });
  const pressed = await levelButton.getAttribute("aria-pressed");
  if (pressed !== "true") {
    throw new Error(`RNNoise level button is not active after click: ${String(levelNameRegex)}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const runtimeErrors = [];
  const pageErrors = [];

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error));
  });

  page.on("console", (msg) => {
    if (msg.type() === "error" && /\[web\]\s+unhandled render error/i.test(msg.text())) {
      runtimeErrors.push(msg.text());
    }
  });

  try {
    await page.addInitScript((presetToken) => {
      localStorage.setItem("boltorezka_lang", "en");
      localStorage.setItem("boltorezka_token", presetToken);
    }, bearerToken);

    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });

    const settingsModal = await openSoundSettings(page, runtimeErrors);

    await setRnnSwitch(settingsModal, true);
    await assertNoCrash(page, runtimeErrors);

    await setRnnLevel(settingsModal, /strong|сильный/i);
    await page.waitForTimeout(250);
    await assertNoCrash(page, runtimeErrors);

    await setRnnLevel(settingsModal, /^none$/i);
    await page.waitForTimeout(250);
    await assertNoCrash(page, runtimeErrors);

    await setRnnSwitch(settingsModal, false);
    await page.waitForTimeout(250);
    await assertNoCrash(page, runtimeErrors);

    if (pageErrors.length > 0) {
      throw new Error(`pageerror events detected: ${pageErrors.slice(0, 3).join(" | ")}`);
    }

    if (runtimeErrors.length > 0) {
      throw new Error(`render errors detected: ${runtimeErrors.slice(0, 3).join(" | ")}`);
    }

    console.log("[smoke:web:rnnoise:browser] ok");
    console.log("- voice settings opened in authenticated session");
    console.log("- RNNoise toggled on and off without crash");
    console.log("- RNNoise level switched strong -> none without crash");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:rnnoise:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
