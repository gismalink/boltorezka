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

async function waitForGapRecoverySignal({ telemetryEvents, getRecoveryRequestCount, readGapMutationState }) {
  const started = Date.now();
  let detectedAt = 0;
  let recoveredAt = 0;
  let lastMutationState = null;

  const safeReadGapMutationState = async () => {
    try {
      const state = await readGapMutationState();
      if (state && typeof state === "object") {
        lastMutationState = state;
      }
      return state;
    } catch (error) {
      const message = String(error?.message || error || "");
      if (message.includes("Execution context was destroyed") || message.includes("Cannot find context with specified id")) {
        return lastMutationState;
      }
      throw error;
    }
  };

  while (Date.now() - started <= timeoutMs) {
    for (const item of telemetryEvents) {
      if (item.event === "ws.realtime.gap.detected") {
        detectedAt = detectedAt || 1;
      }
      if (item.event === "ws.realtime.gap.recovered") {
        recoveredAt = recoveredAt || 1;
      }
    }

    const mutationState = await safeReadGapMutationState();
    const mutationApplied = Boolean(mutationState?.mutated);
    const recoveryRequests = getRecoveryRequestCount();

    if ((detectedAt && recoveredAt) || (mutationApplied && recoveryRequests > 0)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const seen = telemetryEvents.map((item) => item.event);
  const mutationState = await safeReadGapMutationState();
  throw new Error(
    `[smoke:web:gap-recovery:browser] timeout waiting gap recovery signal, seenTelemetry=${JSON.stringify(seen.slice(-12))} mutation=${JSON.stringify(mutationState || {})} recoveryRequests=${getRecoveryRequestCount()}`
  );
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
  const roomMessagesPath = `/v1/rooms/${encodeURIComponent(roomSlug)}/messages`;

  page.on("request", (request) => {
    const path = normalizePath(request.url());
    if (path === "/v1/telemetry/web") {
      const parsed = parseTelemetryEventFromRequest(request);
      if (parsed) {
        telemetryEvents.push(parsed);
      }
      return;
    }

    if (path === roomMessagesPath) {
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
    await installAuthHeaderRoute(page);

    await page.addInitScript((token) => {
      localStorage.setItem("boltorezka_lang", "en");
      localStorage.setItem("boltorezka_token", token);
    }, bearerToken);

    try {
      await bootstrapSessionCookie(page);
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? error.message : error;
      console.warn(`[smoke:web:gap-recovery:browser] refresh bootstrap skipped: ${String(message || "unknown")}`);
    }

    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.__smokeGapPatchState = {
        mutated: false,
        mutatedMessageType: "",
        originalSeq: 0,
        injectedSeq: 0
      };

      function maybeMutateMessageEvent(event) {
        try {
          const text = typeof event?.data === "string" ? event.data : String(event?.data || "");
          const parsed = JSON.parse(text);
          const type = String(parsed?.type || "").trim().toLowerCase();
          const isChatPayload = type.startsWith("chat.") && type !== "chat.typing";

          if (!isChatPayload || window.__smokeGapPatchState.mutated) {
            return event;
          }

          const seqKey = Number.isFinite(Number(parsed?.realtimeScopeSeq))
            ? "realtimeScopeSeq"
            : Number.isFinite(Number(parsed?.realtime_scope_seq))
              ? "realtime_scope_seq"
              : Number.isFinite(Number(parsed?.realtimeSeq))
                ? "realtimeSeq"
                : Number.isFinite(Number(parsed?.realtime_seq))
                  ? "realtime_seq"
                  : "";

          if (!seqKey) {
            return event;
          }

          const originalSeq = Number(parsed[seqKey]);
          const injectedSeq = originalSeq + 2;
          parsed[seqKey] = injectedSeq;
          window.__smokeGapPatchState = {
            mutated: true,
            mutatedMessageType: type,
            originalSeq,
            injectedSeq
          };

          return new MessageEvent("message", {
            data: JSON.stringify(parsed)
          });
        } catch {
          return event;
        }
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
            const nextEvent = maybeMutateMessageEvent(event);
            listener.call(this, nextEvent);
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
          if (event?.type === "message" && this.__smokeOnMessage) {
            const nextEvent = maybeMutateMessageEvent(event);
            this.__smokeOnMessage.call(this, nextEvent);
          }

          return super.dispatchEvent(event);
        }
      }

      window.WebSocket = SmokeWebSocket;
    });

    await gotoWithRetries(page);
    await page.locator('[data-agent-id="chat.timeline"]').first().waitFor({ state: "visible", timeout: timeoutMs });
    await page.waitForTimeout(warmupMs);

    const beforeRequestCount = roomMessagesRequests.length;

    for (let index = 0; index < injectionMessages; index += 1) {
      await postRoomMessage(bearerTokenSecond, `gap-smoke-${Date.now()}-${index}`);
      await page.waitForTimeout(settleMs);
    }

    await waitForGapRecoverySignal({
      telemetryEvents,
      getRecoveryRequestCount: () => roomMessagesRequests.slice(beforeRequestCount).filter((item) => item.method === "GET").length,
      readGapMutationState: async () => page.evaluate(() => window.__smokeGapPatchState || null)
    });

    const recoveryRequests = roomMessagesRequests.slice(beforeRequestCount).filter((item) => item.method === "GET");
    if (recoveryRequests.length === 0) {
      throw new Error("[smoke:web:gap-recovery:browser] no room messages reload request observed after injected gap");
    }

    if (mainFrameNavigations > 1) {
      throw new Error(`[smoke:web:gap-recovery:browser] unexpected main-frame navigation count: ${mainFrameNavigations}`);
    }

    const mutationState = await page.evaluate(() => window.__smokeGapPatchState || null);
    if (!mutationState?.mutated) {
      throw new Error("[smoke:web:gap-recovery:browser] websocket gap mutation was not applied");
    }

    console.log("[smoke:web:gap-recovery:browser] ok");
    console.log(`- telemetry gap events observed: ${telemetryEvents.filter((item) => item.event.startsWith("ws.realtime.gap.")).map((item) => item.event).join(",")}`);
    console.log(`- recovery room messages requests observed: ${recoveryRequests.length}`);
    console.log(`- mutated seq: ${mutationState.originalSeq} -> ${mutationState.injectedSeq} (${mutationState.mutatedMessageType})`);
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
