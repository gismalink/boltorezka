#!/usr/bin/env node
// Purpose: Browser smoke that enforces a sane request budget for notification polling endpoints.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const appUrl = `${baseUrl}/`;
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 30000);
const bootRetries = Number(process.env.SMOKE_WEB_BOOT_RETRIES || 3);
const bootRetryDelayMs = Number(process.env.SMOKE_WEB_BOOT_RETRY_DELAY_MS || 1000);
const observeWindowMs = Number(process.env.SMOKE_WEB_NETWORK_WINDOW_MS || 30000);
const maxInboxRequests = Number(process.env.SMOKE_WEB_NET_MAX_INBOX_REQUESTS || 6);
const maxPublicKeyRequests = Number(process.env.SMOKE_WEB_NET_MAX_PUBLIC_KEY_REQUESTS || 3);
const burstWindowMs = Number(process.env.SMOKE_WEB_NET_BURST_WINDOW_MS || 3000);
const maxBurstPerEndpoint = Number(process.env.SMOKE_WEB_NET_MAX_BURST_PER_ENDPOINT || 3);
const bearerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();

function nowMs() {
  return Date.now();
}

function normalizePath(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return "";
  }
}

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

function countBurst(timestamps, windowMs) {
  if (timestamps.length === 0) {
    return 0;
  }

  let maxInWindow = 1;
  let left = 0;
  for (let right = 0; right < timestamps.length; right += 1) {
    while (timestamps[right] - timestamps[left] > windowMs) {
      left += 1;
    }
    const current = right - left + 1;
    if (current > maxInWindow) {
      maxInWindow = current;
    }
  }

  return maxInWindow;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const tracked = {
    inbox: [],
    publicKey: []
  };

  page.on("request", (request) => {
    const type = request.resourceType();
    if (type !== "fetch" && type !== "xhr") {
      return;
    }

    const path = normalizePath(request.url());
    if (path === "/v1/notifications/inbox") {
      tracked.inbox.push(nowMs());
      return;
    }

    if (path === "/v1/notifications/push/public-key") {
      tracked.publicKey.push(nowMs());
    }
  });

  try {
    await page.addInitScript((token) => {
      localStorage.setItem("boltorezka_lang", "en");
      if (token) {
        localStorage.setItem("boltorezka_token", token);
      }
    }, bearerToken);

    await gotoWithRetries(page);
    await page.waitForTimeout(observeWindowMs);

    const inboxCount = tracked.inbox.length;
    const publicKeyCount = tracked.publicKey.length;
    const inboxBurst = countBurst(tracked.inbox, burstWindowMs);
    const publicKeyBurst = countBurst(tracked.publicKey, burstWindowMs);

    if (inboxCount > maxInboxRequests) {
      throw new Error(`notification inbox request budget exceeded: ${inboxCount} > ${maxInboxRequests}`);
    }

    if (publicKeyCount > maxPublicKeyRequests) {
      throw new Error(`notification public-key request budget exceeded: ${publicKeyCount} > ${maxPublicKeyRequests}`);
    }

    if (inboxBurst > maxBurstPerEndpoint) {
      throw new Error(`notification inbox burst exceeded: ${inboxBurst} requests within ${burstWindowMs}ms`);
    }

    if (publicKeyBurst > maxBurstPerEndpoint) {
      throw new Error(`notification public-key burst exceeded: ${publicKeyBurst} requests within ${burstWindowMs}ms`);
    }

    console.log("[smoke:web:network-requests:browser] ok");
    console.log(`- observed window ms: ${observeWindowMs}`);
    console.log(`- inbox requests: ${inboxCount} (max ${maxInboxRequests}), burst ${inboxBurst}/${maxBurstPerEndpoint}`);
    console.log(`- public-key requests: ${publicKeyCount} (max ${maxPublicKeyRequests}), burst ${publicKeyBurst}/${maxBurstPerEndpoint}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:network-requests:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
