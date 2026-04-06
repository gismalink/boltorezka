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

async function main() {
  if (!bearerToken) {
    throw new Error("SMOKE_TEST_BEARER_TOKEN is required for smoke:web:agent-semantics:browser");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.addInitScript((token) => {
      localStorage.setItem("boltorezka_lang", "en");
      localStorage.setItem("boltorezka_token", token);
    }, bearerToken);

    await gotoWithRetries(page);

    const checks = [];
    checks.push(await requireVisible(page, '[data-agent-id="chat.panel"]', "chat.panel"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.screen-context.status"]', "chat.screen-context.status"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.topic-navigation"]', "chat.topic-navigation"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.topic-navigation.search-toggle"]', "chat.topic-navigation.search-toggle"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.timeline"]', "chat.timeline"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.composer"]', "chat.composer"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.composer.input"]', "chat.composer.input"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.composer.submit"]', "chat.composer.submit"));

    await page.locator('[data-agent-id="chat.topic-navigation.search-toggle"]').first().click();
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.panel"]', "chat.search.panel"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.query"]', "chat.search.query"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.scope"]', "chat.search.scope"));
    checks.push(await requireVisible(page, '[data-agent-id="chat.search.filters"]', "chat.search.filters"));

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
