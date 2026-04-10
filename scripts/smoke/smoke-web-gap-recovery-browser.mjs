#!/usr/bin/env node
// Purpose: Browser smoke that simulates a dropped realtime frame and verifies client gap recovery without manual refresh.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const appUrl = `${baseUrl}/`;
const roomSlug = String(process.env.SMOKE_ROOM_SLUG || "general").trim();
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 30000);
const bootRetries = Number(process.env.SMOKE_WEB_BOOT_RETRIES || 3);
const bootRetryDelayMs = Number(process.env.SMOKE_WEB_BOOT_RETRY_DELAY_MS || 1000);
const bearerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const bearerTokenSecond = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();
const warmupMs = Number(process.env.SMOKE_WEB_GAP_WARMUP_MS || 4000);
const settleMs = Number(process.env.SMOKE_WEB_GAP_SETTLE_MS || 500);
const injectionMessages = Math.max(3, Number(process.env.SMOKE_WEB_GAP_INJECTION_MESSAGES || 4));

function normalizePath(url) {
  try {
    return new URL(url).pathname;
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

async function postRoomMessage(token, text) {
  const response = await fetch(`${baseUrl}/v1/rooms/${encodeURIComponent(roomSlug)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`[smoke:web:gap-recovery:browser] create message failed: status=${response.status} payload=${JSON.stringify(payload || {})}`);
  }
}

function parseTelemetryEventFromRequest(request) {
  try {
    const body = request.postDataJSON?.();
    const event = String(body?.event || "").trim();
    if (!event) {
      return null;
    }
    return {
      event,
      meta: body?.meta || null
    };
  } catch {
    return null;
  }
}

async function waitForGapTelemetry(events) {
  const started = Date.now();
  let detectedAt = 0;
  let recoveredAt = 0;

  while (Date.now() - started <= timeoutMs) {
    for (const item of events) {
      if (item.event === "ws.realtime.gap.detected") {
        detectedAt = detectedAt || 1;
      }
      if (item.event === "ws.realtime.gap.recovered") {
        recoveredAt = recoveredAt || 1;
      }
    }

    if (detectedAt && recoveredAt) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const seen = events.map((item) => item.event);
  throw new Error(`[smoke:web:gap-recovery:browser] timeout waiting gap telemetry, seen=${JSON.stringify(seen.slice(-12))}`);
}

async function main() {
  if (!bearerToken || !bearerTokenSecond) {
    console.log("[smoke:web:gap-recovery:browser] skipped (missing SMOKE_TEST_BEARER_TOKEN or SMOKE_TEST_BEARER_TOKEN_SECOND)");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const telemetryEvents = [];
  const roomMessagesRequests = [];
  let mainFrameNavigations = 0;

  page.on("request", (request) => {
    const path = normalizePath(request.url());
    if (path === "/v1/telemetry/web") {
      const parsed = parseTelemetryEventFromRequest(request);
      if (parsed) {
        telemetryEvents.push(parsed);
      }
      return;
    }

    if (path === `/v1/rooms/${roomSlug}/messages`) {
      roomMessagesRequests.push({
        ts: Date.now(),
        method: request.method(),
        url: request.url()
      });
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigations += 1;
    }
  });

  try {
    await page.addInitScript((token) => {
      localStorage.setItem("boltorezka_lang", "en");
      localStorage.setItem("boltorezka_token", token);
    }, bearerToken);

    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      let dropped = false;

      function shouldDrop(raw) {
        if (dropped) {
          return false;
        }

        try {
          const text = typeof raw === "string" ? raw : String(raw || "");
          const parsed = JSON.parse(text);
          const hasSeq = Number.isFinite(Number(parsed?.realtimeScopeSeq))
            || Number.isFinite(Number(parsed?.realtime_scope_seq))
            || Number.isFinite(Number(parsed?.realtimeSeq))
            || Number.isFinite(Number(parsed?.realtime_seq));
          const type = String(parsed?.type || "").trim().toLowerCase();
          const isChatPayload = type.startsWith("chat.") && type !== "chat.typing";

          if (hasSeq && isChatPayload) {
            dropped = true;
            return true;
          }
        } catch {
          return false;
        }

        return false;
      }

      class SmokeWebSocket extends NativeWebSocket {
        constructor(...args) {
          super(...args);
          this.__smokeOnMessage = null;
          this.__smokeWrappedListeners = new Map();
        }

        set onmessage(handler) {
          this.__smokeOnMessage = typeof handler === "function" ? handler : null;
        }

        get onmessage() {
          return this.__smokeOnMessage;
        }

        addEventListener(type, listener, options) {
          if (type !== "message" || typeof listener !== "function") {
            return super.addEventListener(type, listener, options);
          }

          const wrapped = (event) => {
            if (shouldDrop(event?.data)) {
              return;
            }
            listener.call(this, event);
          };
          this.__smokeWrappedListeners.set(listener, wrapped);
          return super.addEventListener(type, wrapped, options);
        }

        removeEventListener(type, listener, options) {
          if (type !== "message" || typeof listener !== "function") {
            return super.removeEventListener(type, listener, options);
          }

          const wrapped = this.__smokeWrappedListeners.get(listener);
          if (wrapped) {
            this.__smokeWrappedListeners.delete(listener);
            return super.removeEventListener(type, wrapped, options);
          }

          return super.removeEventListener(type, listener, options);
        }

        dispatchEvent(event) {
          if (event?.type === "message" && shouldDrop(event?.data)) {
            return true;
          }

          if (event?.type === "message" && this.__smokeOnMessage) {
            this.__smokeOnMessage.call(this, event);
          }

          return super.dispatchEvent(event);
        }
      }

      window.WebSocket = SmokeWebSocket;
    });

    await gotoWithRetries(page);
    await page.waitForTimeout(warmupMs);

    const beforeRequestCount = roomMessagesRequests.length;

    for (let index = 0; index < injectionMessages; index += 1) {
      await postRoomMessage(bearerTokenSecond, `gap-smoke-${Date.now()}-${index}`);
      await page.waitForTimeout(settleMs);
    }

    await waitForGapTelemetry(telemetryEvents);

    const recoveryRequests = roomMessagesRequests.slice(beforeRequestCount).filter((item) => item.method === "GET");
    if (recoveryRequests.length === 0) {
      throw new Error("[smoke:web:gap-recovery:browser] no room messages reload request observed after injected gap");
    }

    if (mainFrameNavigations > 1) {
      throw new Error(`[smoke:web:gap-recovery:browser] unexpected main-frame navigation count: ${mainFrameNavigations}`);
    }

    console.log("[smoke:web:gap-recovery:browser] ok");
    console.log(`- telemetry gap events observed: ${telemetryEvents.filter((item) => item.event.startsWith("ws.realtime.gap.")).map((item) => item.event).join(",")}`);
    console.log(`- recovery room messages requests observed: ${recoveryRequests.length}`);
    console.log(`- main frame navigations: ${mainFrameNavigations}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:gap-recovery:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
