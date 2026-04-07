#!/usr/bin/env node
// Purpose: Browser smoke that verifies core chat data-agent-id contract stays present in runtime DOM.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const appUrl = `${baseUrl}/`;
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 30000);
const bootRetries = Number(process.env.SMOKE_WEB_BOOT_RETRIES || 3);
const bootRetryDelayMs = Number(process.env.SMOKE_WEB_BOOT_RETRY_DELAY_MS || 1000);
const bearerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();

async function gotoWithRetries(page) {
  let lastError = null;
  for (let attempt = 1; attempt <= bootRetries; attempt += 1) {
    try {
      await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < bootRetries) {
        await page.waitForTimeout(bootRetryDelayMs * attempt);
      }
    }
  }

  throw lastError || new Error("Unable to open app");
}

async function requireVisible(page, selector, label) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  return { label, selector };
}

async function maybeVisible(page, selector) {
  const locator = page.locator(selector).first();
  const count = await locator.count();
  if (count === 0) {
    return false;
  }
  return locator.isVisible();
}

async function dismissBlockingOverlays(page) {
  const voiceOverlay = page.locator(".voice-preferences-overlay").first();
  const hasVoiceOverlay = (await voiceOverlay.count()) > 0;
  if (!hasVoiceOverlay) {
    return;
  }

  if (!(await voiceOverlay.isVisible().catch(() => false))) {
    return;
  }

  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(120);

  if (!(await voiceOverlay.isVisible().catch(() => false))) {
    return;
  }

  const dismissButton = voiceOverlay.locator("button").first();
  if ((await dismissButton.count()) > 0) {
    await dismissButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(120);
  }
}

async function bootstrapSessionCookie(page) {
  const response = await page.request.post(`${baseUrl}/v1/auth/refresh`, {
    headers: {
      Authorization: `Bearer ${bearerToken}`
    },
    timeout: timeoutMs
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`auth refresh failed: status=${response.status()} body=${String(body || "n/a").slice(0, 240)}`);
  }
}

async function installAuthHeaderRoute(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes("/v1/auth/sso/session")) {
      const origin = new URL(url).origin;
      const meResponse = await page.request.get(`${origin}/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${bearerToken}`
        },
        timeout: timeoutMs
      });

      if (!meResponse.ok()) {
        await route.continue();
        return;
      }

      const mePayload = await meResponse.json().catch(() => ({}));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          token: bearerToken,
          user: mePayload?.user || null
        })
      });
      return;
    }

    const isApiRequest = url.includes("/v1/") || /\/version(?:\?|$)/.test(url);
    if (!isApiRequest) {
      await route.continue();
      return;
    }

    const headers = {
      ...request.headers(),
      authorization: `Bearer ${bearerToken}`
    };
    await route.continue({ headers });
  });
}

async function main() {
  if (!bearerToken) {
    throw new Error("SMOKE_TEST_BEARER_TOKEN is required for smoke:web:agent-semantics:browser");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await installAuthHeaderRoute(page);

    await page.addInitScript((token) => {
      localStorage.setItem("boltorezka_lang", "en");
      localStorage.setItem("boltorezka_token", token);
    }, bearerToken);

    // Cookie-first mode may ignore localStorage token persistence. Try to
    // bootstrap a cookie session, but continue with explicit auth header
    // fallback if refresh endpoint rejects current token type.
    try {
      await bootstrapSessionCookie(page);
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? error.message
        : error;
      console.warn(`[smoke:web:agent-semantics:browser] refresh bootstrap skipped: ${String(message || "unknown")}`);
    }

    await gotoWithRetries(page);
    await dismissBlockingOverlays(page);

    const checks = [];
    checks.push(await requireVisible(page, '[data-agent-id="chat.panel"]', "chat.panel"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.screen-context.status"]', "chat.screen-context.status"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.topic-navigation"]', "chat.topic-navigation"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.topic-navigation.search-toggle"]', "chat.topic-navigation.search-toggle"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.timeline"]', "chat.timeline"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.composer"]', "chat.composer"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.composer.input"]', "chat.composer.input"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.composer.submit"]', "chat.composer.submit"));

    if (await maybeVisible(page, '[data-agent-id="chat.topic-navigation.palette"]')) {
      await page.locator('[data-agent-id="chat.topic-navigation.palette"]').first().click();
      checks.push(await requireVisible(page, '[data-agent-id="chat.overlay.topic-palette"]', "chat.overlay.topic-palette"));
      checks.push(await requireVisible(page, '[data-agent-id="chat.overlay.topic-palette.search"]', "chat.overlay.topic-palette.search"));
      checks.push(await requireVisible(page, '[data-agent-id="chat.overlay.topic-palette.list"]', "chat.overlay.topic-palette.list"));
      checks.push(await requireVisible(page, '[data-agent-id="chat.overlay.topic-palette.close"]', "chat.overlay.topic-palette.close"));
      await page.locator('[data-agent-id="chat.overlay.topic-palette.close"]').first().click();
    }

    if (await maybeVisible(page, '[data-agent-id="chat.topic-navigation.tab"]')) {
      await page.locator('[data-agent-id="chat.topic-navigation.tab"]').first().click({ button: "right" });
      checks.push(await requireVisible(page, '[data-agent-id="chat.topic-context-menu"]', "chat.topic-context-menu"));
      checks.push(await requireVisible(page, '[data-agent-id="chat.topic-context-menu.action.read"]', "chat.topic-context-menu.action.read"));
      checks.push(await requireVisible(page, '[data-agent-id="chat.topic-context-menu.action.archive"]', "chat.topic-context-menu.action.archive"));
      checks.push(await requireVisible(page, '[data-agent-id="chat.topic-context-menu.action.delete"]', "chat.topic-context-menu.action.delete"));
      await page.keyboard.press("Escape");
    }

    await dismissBlockingOverlays(page);
    await page.locator('[data-agent-id="chat.topic-navigation.search-toggle"]').first().click();
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.panel"]', "chat.search.panel"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.query"]', "chat.search.query"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.scope"]', "chat.search.scope"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.filters"]', "chat.search.filters"));

    if (await maybeVisible(page, '[data-agent-id="userdock.voice-settings.toggle"]')) {
      await page.locator('[data-agent-id="userdock.voice-settings.toggle"]').first().click();
      if (await maybeVisible(page, '[data-agent-id="settings.user-modal.open"]')) {
        await page.locator('[data-agent-id="settings.user-modal.open"]').first().click();
        checks.push(await requireVisible(page, '[data-agent-id="settings.user-modal"]', "settings.user-modal"));
        checks.push(await requireVisible(page, '[data-agent-id="settings.user-modal.close"]', "settings.user-modal.close"));
        await page.locator('[data-agent-id="settings.user-modal.close"]').first().click();
      }
    }

    console.log("[smoke:web:agent-semantics:browser] ok");
    console.log(`- app url: ${appUrl}`);
    console.log(`- verified selectors: ${checks.length}`);
    checks.forEach((item) => {
      console.log(`  - ${item.label}`);
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:agent-semantics:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
