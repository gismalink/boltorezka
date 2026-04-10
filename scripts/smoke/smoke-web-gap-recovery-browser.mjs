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
const smokeUserEmail = String(process.env.SMOKE_USER_EMAIL || "smoke-rtc-1@example.test").trim().toLowerCase();
const sessionCookieName = String(process.env.SMOKE_SESSION_COOKIE_NAME || "boltorezka_session_test").trim() || "boltorezka_session_test";
const preseedSessionCookieValue = String(process.env.SMOKE_WEB_SESSION_COOKIE_VALUE || "").trim();
const warmupMs = Number(process.env.SMOKE_WEB_GAP_WARMUP_MS || 4000);
const settleMs = Number(process.env.SMOKE_WEB_GAP_SETTLE_MS || 500);
const injectionMessages = Math.max(3, Number(process.env.SMOKE_WEB_GAP_INJECTION_MESSAGES || 4));

function decodeJwtPayload(token) {
  try {
    const encodedPayload = String(token || "").split(".")[1] || "";
    if (!encodedPayload) {
      return null;
    }
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(normalized + padding, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function acquireSessionCookieValue(token) {
  try {
    const response = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return null;
    }

    const setCookieHeader = response.headers.get("set-cookie");
    if (!setCookieHeader) {
      return null;
    }

    const cookieMatch = setCookieHeader.match(new RegExp(`(?:^|[;,]\\s*)${sessionCookieName}=([^;,]+)`));
    if (!cookieMatch || !cookieMatch[1]) {
      return null;
    }
    return decodeURIComponent(cookieMatch[1].trim());
  } catch {
    return null;
  }
}

async function acquireSmokeBootstrapSession(email) {
  try {
    const response = await fetch(`${baseUrl}/v1/auth/smoke/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        body: String(body || "").slice(0, 220)
      };
    }

    const payload = await response.json().catch(() => null);
    const token = String(payload?.token || "").trim();
    if (!token) {
      return {
        ok: false,
        status: 200,
        body: "missing token in payload"
      };
    }

    const setCookieHeader = response.headers.get("set-cookie") || "";
    const cookieMatch = String(setCookieHeader || "").match(new RegExp(`(?:^|[;,]\\s*)${sessionCookieName}=([^;,]+)`));
    const cookieValue = cookieMatch?.[1] ? decodeURIComponent(String(cookieMatch[1]).trim()) : "";

    return {
      ok: true,
      token,
      cookieValue: cookieValue || null,
      user: payload?.user || null
    };
  } catch {
    return {
      ok: false,
      status: 0,
      body: "network error"
    };
  }
}

async function bootstrapBrowserSessionCookie(page, context, token) {
  if (preseedSessionCookieValue) {
    return { ok: true, reason: "preseed" };
  }

  const response = await page.request.post(`${baseUrl}/v1/auth/refresh`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    timeout: timeoutMs
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status(),
      body: String(body || "").slice(0, 220)
    };
  }

  const setCookieHeader = response.headers()["set-cookie"] || "";
  const cookieMatch = String(setCookieHeader || "").match(new RegExp(`(?:^|[;,]\\s*)${sessionCookieName}=([^;,]+)`));
  if (cookieMatch && cookieMatch[1]) {
    const parsedBase = new URL(baseUrl);
    await context.addCookies([{
      name: sessionCookieName,
      value: decodeURIComponent(String(cookieMatch[1]).trim()),
      domain: parsedBase.hostname,
      path: "/",
      httpOnly: true,
      secure: parsedBase.protocol === "https:",
      sameSite: "Lax"
    }]);
  }

  return { ok: true, reason: "refreshed" };
}

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

async function postRoomMessage(token, roomSlugValue, text) {
  const response = await fetch(`${baseUrl}/v1/rooms/${encodeURIComponent(roomSlugValue)}/messages`, {
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

async function ensureServerPresence(token, sessionCookieValue = "") {
  const authHeaders = {
    Authorization: `Bearer ${token}`
  };
  if (sessionCookieValue) {
    authHeaders.Cookie = `${sessionCookieName}=${encodeURIComponent(sessionCookieValue)}`;
  }

  try {
    const listResponse = await fetch(`${baseUrl}/v1/servers`, {
      method: "GET",
      headers: authHeaders
    });
    if (!listResponse.ok) {
      return;
    }

    const listPayload = await listResponse.json().catch(() => ({}));
    const servers = Array.isArray(listPayload?.servers) ? listPayload.servers : [];
    if (servers.length > 0) {
      return;
    }

    const createResponse = await fetch(`${baseUrl}/v1/servers`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: `smoke-${Date.now()}` })
    });

    if (!createResponse.ok) {
      return;
    }
  } catch {
    // Best effort only; onboarding fallback remains in place.
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

async function completeFirstRunIntroIfVisible(page) {
  const introOverlay = page.locator(".voice-preferences-overlay").first();
  if ((await introOverlay.count()) === 0) {
    return;
  }
  if (!(await introOverlay.isVisible().catch(() => false))) {
    return;
  }

  const introTitle = page.getByText(/welcome to dato|добро пожаловать/i).first();
  if ((await introTitle.count()) === 0 || !(await introTitle.isVisible().catch(() => false))) {
    return;
  }

  const checkboxes = introOverlay.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let index = 0; index < checkboxCount; index += 1) {
    const checkbox = checkboxes.nth(index);
    if (!(await checkbox.isChecked().catch(() => false))) {
      await checkbox.check({ force: true }).catch(() => undefined);
    }
  }

  const continueButton = introOverlay.getByRole("button", { name: /continue|продолжить/i }).first();
  if ((await continueButton.count()) > 0 && await continueButton.isEnabled().catch(() => false)) {
    await continueButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(600);
  }
}

async function completeEmptyServerOnboardingIfVisible(page) {
  const onboardingTitle = page.getByText(/welcome and choose|создай или присоединись/i).first();
  if ((await onboardingTitle.count()) === 0 || !(await onboardingTitle.isVisible().catch(() => false))) {
    return;
  }

  const serverNameInput = page.locator('label:has-text("Server name") input, label:has-text("Название сервера") input').first();
  if ((await serverNameInput.count()) > 0) {
    await serverNameInput.fill(`smoke-${Date.now()}`).catch(() => undefined);
  } else {
    const fallbackInput = page.locator('input[placeholder*="Team Wave"], input[placeholder*="Команда"]').first();
    if ((await fallbackInput.count()) > 0) {
      await fallbackInput.fill(`smoke-${Date.now()}`).catch(() => undefined);
    }
  }

  const createFirstServerButton = page.getByRole("button", { name: /create first server|создать первый сервер/i }).first();
  if ((await createFirstServerButton.count()) > 0) {
    const isEnabled = await createFirstServerButton.isEnabled().catch(() => false);
    if (isEnabled) {
      await createFirstServerButton.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1400);
    }
  }
}

async function ensureTimelineReady(page) {
  const timeline = page.locator('[data-agent-id="chat.timeline"]').first();
  try {
    await timeline.waitFor({ state: "visible", timeout: Math.min(timeoutMs, 8000) });
    return;
  } catch {
    // Continue with explicit topic-open attempt below.
  }

  await completeFirstRunIntroIfVisible(page);
  await completeEmptyServerOnboardingIfVisible(page);

  const continueButton = page.getByRole("button", { name: /continue/i }).first();
  if ((await continueButton.count()) > 0 && await continueButton.isVisible().catch(() => false)) {
    await continueButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(400);
  }

  const createFirstServerButton = page.getByRole("button", { name: /create first server/i }).first();
  if ((await createFirstServerButton.count()) > 0 && await createFirstServerButton.isVisible().catch(() => false)) {
    await completeEmptyServerOnboardingIfVisible(page);
  }

  const firstRoomButton = page.locator(".room-main-btn").first();
  if ((await firstRoomButton.count()) > 0 && await firstRoomButton.isVisible().catch(() => false)) {
    await firstRoomButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(600);
  }

  const openChatButton = page.locator(".channel-chat-open-btn").first();
  if ((await openChatButton.count()) > 0 && await openChatButton.isVisible().catch(() => false)) {
    await openChatButton.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(400);
  }

  const topicTab = page.locator('[data-agent-id="chat.topic-navigation.tab"]').first();
  if ((await topicTab.count()) > 0) {
    await topicTab.click({ force: true }).catch(() => undefined);
  }

  try {
    await timeline.waitFor({ state: "visible", timeout: timeoutMs });
  } catch (error) {
    const currentUrl = page.url();
    const pageTitle = await page.title().catch(() => "<unavailable>");
    const bodyText = await page.locator("body").innerText().catch(() => "<unavailable>");
    const snippet = String(bodyText || "").replace(/\s+/g, " ").trim().slice(0, 320);
    throw new Error(
      `[smoke:web:gap-recovery:browser] timeline is not visible after boot: url=${currentUrl} title=${pageTitle} body=${JSON.stringify(snippet)} cause=${String(error?.message || error)}`
    );
  }
}

async function main() {
  if (!bearerToken || !bearerTokenSecond) {
    console.log("[smoke:web:gap-recovery:browser] skipped (missing SMOKE_TEST_BEARER_TOKEN or SMOKE_TEST_BEARER_TOKEN_SECOND)");
    return;
  }

  let viewerToken = bearerToken;
  let senderToken = bearerTokenSecond;

  const smokeBootstrapSession = await acquireSmokeBootstrapSession(smokeUserEmail);
  if (smokeBootstrapSession?.ok && smokeBootstrapSession?.token) {
    viewerToken = smokeBootstrapSession.token;
  }

  const sessionCookieValuePrimary = await acquireSessionCookieValue(bearerToken);
  const sessionCookieValueSecondary = await acquireSessionCookieValue(bearerTokenSecond);
  const sessionCookieValueBootstrap = String(smokeBootstrapSession?.ok ? smokeBootstrapSession?.cookieValue || "" : "").trim();
  const sessionCookieValueViewer = sessionCookieValueBootstrap
    || (viewerToken === bearerToken ? sessionCookieValuePrimary : viewerToken === bearerTokenSecond ? sessionCookieValueSecondary : "");

  await ensureServerPresence(viewerToken, sessionCookieValueViewer || "");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const telemetryEvents = [];
  const roomMessagesRequests = [];
  const topicMessagesRequests = [];
  const authRequests = [];
  const serverRequestTrail = [];
  let mainFrameNavigations = 0;
  let observedActiveRoomSlug = "";

  page.on("request", (request) => {
    const path = normalizePath(request.url());
    if (path === "/v1/telemetry/web") {
      const parsed = parseTelemetryEventFromRequest(request);
      if (parsed) {
        telemetryEvents.push(parsed);
      }
      return;
    }

    const roomMessagesMatch = path.match(/^\/v1\/rooms\/([^/]+)\/messages$/);
    if (roomMessagesMatch) {
      const requestRoomSlug = decodeURIComponent(String(roomMessagesMatch[1] || "")).trim();
      if (requestRoomSlug) {
        observedActiveRoomSlug = requestRoomSlug;
      }
      roomMessagesRequests.push({
        ts: Date.now(),
        method: request.method(),
        url: request.url(),
        roomSlug: requestRoomSlug
      });
    }

    const topicMessagesMatch = path.match(/^\/v1\/topics\/([^/]+)\/messages$/);
    if (topicMessagesMatch) {
      topicMessagesRequests.push({
        ts: Date.now(),
        method: request.method(),
        url: request.url(),
        topicId: decodeURIComponent(String(topicMessagesMatch[1] || "")).trim()
      });
    }

    if (path.startsWith("/v1/auth/")) {
      authRequests.push({
        ts: Date.now(),
        method: request.method(),
        path
      });
    }

    if (path.startsWith("/v1/servers")) {
      serverRequestTrail.push({
        ts: Date.now(),
        phase: "request",
        method: request.method(),
        path
      });
      if (serverRequestTrail.length > 30) {
        serverRequestTrail.shift();
      }
    }
  });

  page.on("response", async (response) => {
    const path = normalizePath(response.url());
    if (!path.startsWith("/v1/servers")) {
      return;
    }

    serverRequestTrail.push({
      ts: Date.now(),
      phase: "response",
      status: response.status(),
      path
    });
    if (serverRequestTrail.length > 30) {
      serverRequestTrail.shift();
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigations += 1;
    }
  });

  try {
    await page.route("**/v1/auth/sso/session", async (route) => {
      const activeBootstrap = smokeBootstrapSession?.ok
        ? smokeBootstrapSession
        : await acquireSmokeBootstrapSession(smokeUserEmail);

      if (!activeBootstrap?.ok || !activeBootstrap.token) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          token: activeBootstrap.token,
          user: activeBootstrap.user || null
        })
      });
    });

    if (!smokeBootstrapSession?.ok || !smokeBootstrapSession?.token) {
      const bootstrapPrimary = await bootstrapBrowserSessionCookie(page, context, bearerToken);
      if (!bootstrapPrimary.ok) {
        const bootstrapSecondary = await bootstrapBrowserSessionCookie(page, context, bearerTokenSecond);
        if (!bootstrapSecondary.ok) {
          throw new Error(`[smoke:web:gap-recovery:browser] browser refresh failed for both tokens: primary=${bootstrapPrimary.status}:${bootstrapPrimary.body} secondary=${bootstrapSecondary.status}:${bootstrapSecondary.body}`);
        }
        viewerToken = bearerTokenSecond;
        senderToken = bearerToken;
      }
    }

    const tokenPayload = decodeJwtPayload(viewerToken);
    const bootstrapUserId = String(tokenPayload?.sub || "").trim();
    const introSeenKey = bootstrapUserId ? `boltorezka_intro_v1_seen:${bootstrapUserId}` : "";

    const viewerSessionCookieValue = sessionCookieValueBootstrap
      || (viewerToken === bearerToken ? sessionCookieValuePrimary : viewerToken === bearerTokenSecond ? sessionCookieValueSecondary : "");
    if (viewerSessionCookieValue) {
      const parsedBase = new URL(baseUrl);
      await context.addCookies([{
        name: sessionCookieName,
        value: viewerSessionCookieValue,
        domain: parsedBase.hostname,
        path: "/",
        httpOnly: true,
        secure: parsedBase.protocol === "https:",
        sameSite: "Lax"
      }]);
    }

    if (preseedSessionCookieValue) {
      const parsedBase = new URL(baseUrl);
      await context.addCookies([{
        name: sessionCookieName,
        value: preseedSessionCookieValue,
        domain: parsedBase.hostname,
        path: "/",
        httpOnly: true,
        secure: parsedBase.protocol === "https:",
        sameSite: "Lax"
      }]);
    }

    await page.addInitScript((token, firstRunSeenKey) => {
      localStorage.setItem("boltorezka_lang", "en");
      localStorage.setItem("boltorezka_token", token);
      if (firstRunSeenKey) {
        localStorage.setItem(firstRunSeenKey, "1");
      }
    }, viewerToken, introSeenKey);

    if (!smokeBootstrapSession?.ok) {
      console.warn(`[smoke:web:gap-recovery:browser] smoke bootstrap fallback: status=${smokeBootstrapSession?.status || 0} body=${String(smokeBootstrapSession?.body || "")}`);
    }

    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.__smokeGapPatchState = {
        mutated: false,
        mutatedMessageType: "",
        originalSeq: 0,
        injectedSeq: 0,
        baselineSeqObserved: 0,
        observedMessageEvents: 0,
        observedChatTypes: []
      };

      function maybeMutateMessageEvent(event) {
        try {
          const text = typeof event?.data === "string" ? event.data : String(event?.data || "");
          const parsed = JSON.parse(text);
          const type = String(parsed?.type || "").trim().toLowerCase();
          const isChatPayload = type.startsWith("chat.") && type !== "chat.typing";

          window.__smokeGapPatchState.observedMessageEvents += 1;
          if (type && isChatPayload) {
            const recent = Array.isArray(window.__smokeGapPatchState.observedChatTypes)
              ? window.__smokeGapPatchState.observedChatTypes
              : [];
            recent.push(type);
            if (recent.length > 12) {
              recent.shift();
            }
            window.__smokeGapPatchState.observedChatTypes = recent;
          }

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

          // Establish one baseline sequence point before introducing a gap.
          if (!window.__smokeGapPatchState.baselineSeqObserved) {
            window.__smokeGapPatchState.baselineSeqObserved = originalSeq;
            return event;
          }

          const injectedSeq = originalSeq + 2;
          parsed[seqKey] = injectedSeq;
          window.__smokeGapPatchState = {
            mutated: true,
            mutatedMessageType: type,
            originalSeq,
            injectedSeq,
            baselineSeqObserved: window.__smokeGapPatchState.baselineSeqObserved || 0
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
          this.__smokeOnMessageOriginal = null;
          this.__smokeOnMessageWrapped = null;
          this.__smokeWrappedListeners = new Map();
        }

        set onmessage(handler) {
          this.__smokeOnMessageOriginal = typeof handler === "function" ? handler : null;
          if (!this.__smokeOnMessageOriginal) {
            this.__smokeOnMessageWrapped = null;
            super.onmessage = null;
            return;
          }

          this.__smokeOnMessageWrapped = (event) => {
            const nextEvent = maybeMutateMessageEvent(event);
            this.__smokeOnMessageOriginal?.call(this, nextEvent);
          };
          super.onmessage = this.__smokeOnMessageWrapped;
        }

        get onmessage() {
          return this.__smokeOnMessageOriginal;
        }

        addEventListener(type, listener, options) {
          if (type !== "message") {
            return super.addEventListener(type, listener, options);
          }

          let wrapped = null;
          if (typeof listener === "function") {
            wrapped = (event) => {
              const nextEvent = maybeMutateMessageEvent(event);
              listener.call(this, nextEvent);
            };
          } else if (listener && typeof listener.handleEvent === "function") {
            wrapped = {
              handleEvent: (event) => {
                const nextEvent = maybeMutateMessageEvent(event);
                listener.handleEvent.call(listener, nextEvent);
              }
            };
          }

          if (!wrapped) {
            return super.addEventListener(type, listener, options);
          }

          this.__smokeWrappedListeners.set(listener, wrapped);
          return super.addEventListener(type, wrapped, options);
        }

        removeEventListener(type, listener, options) {
          if (type !== "message") {
            return super.removeEventListener(type, listener, options);
          }

          const wrapped = this.__smokeWrappedListeners.get(listener);
          if (wrapped) {
            this.__smokeWrappedListeners.delete(listener);
            return super.removeEventListener(type, wrapped, options);
          }

          return super.removeEventListener(type, listener, options);
        }
      }

      window.WebSocket = SmokeWebSocket;
    });

    await gotoWithRetries(page);
    try {
      await ensureTimelineReady(page);
    } catch (error) {
      const recentAuth = authRequests.slice(-12).map((item) => `${item.method} ${item.path}`);
      const recentServers = serverRequestTrail.slice(-12).map((item) => {
        if (item.phase === "response") {
          return `${item.status} ${item.path}`;
        }
        return `${item.method} ${item.path}`;
      });
      throw new Error(`${String(error?.message || error)} authRequests=${JSON.stringify(recentAuth)} serverTrail=${JSON.stringify(recentServers)}`);
    }
    await page.waitForTimeout(warmupMs);

    const beforeRequestCount = roomMessagesRequests.length;
    const targetRoomSlug = observedActiveRoomSlug || roomSlug;

    for (let index = 0; index < injectionMessages; index += 1) {
      try {
        await postRoomMessage(senderToken, targetRoomSlug, `gap-smoke-${Date.now()}-${index}`);
      } catch (error) {
        const message = String(error?.message || error || "");
        const senderUnauthorized = message.includes("status=401");
        if (!senderUnauthorized || senderToken === viewerToken) {
          throw error;
        }

        await postRoomMessage(viewerToken, targetRoomSlug, `gap-smoke-${Date.now()}-${index}`);
      }
      await page.waitForTimeout(settleMs);
    }

    await waitForGapRecoverySignal({
      telemetryEvents,
      getRecoveryRequestCount: () => {
        const roomReloads = roomMessagesRequests.slice(beforeRequestCount).filter((item) => item.method === "GET").length;
        const topicReloads = topicMessagesRequests.filter((item) => item.method === "GET").length;
        return roomReloads + topicReloads;
      },
      readGapMutationState: async () => page.evaluate(() => window.__smokeGapPatchState || null)
    });

    const recoveryRequests = roomMessagesRequests
      .slice(beforeRequestCount)
      .filter((item) => item.method === "GET" && String(item.roomSlug || "").trim() === targetRoomSlug);

    const topicRecoveryRequests = topicMessagesRequests.filter((item) => item.method === "GET");

    if (recoveryRequests.length === 0 && topicRecoveryRequests.length === 0) {
      throw new Error("[smoke:web:gap-recovery:browser] no messages reload request observed after injected gap");
    }

    if (mainFrameNavigations > 2) {
      throw new Error(`[smoke:web:gap-recovery:browser] unexpected main-frame navigation count: ${mainFrameNavigations}`);
    }

    const mutationState = await page.evaluate(() => window.__smokeGapPatchState || null);
    if (!mutationState?.mutated) {
      throw new Error("[smoke:web:gap-recovery:browser] websocket gap mutation was not applied");
    }

    console.log("[smoke:web:gap-recovery:browser] ok");
    console.log(`- telemetry gap events observed: ${telemetryEvents.filter((item) => item.event.startsWith("ws.realtime.gap.")).map((item) => item.event).join(",")}`);
    console.log(`- recovery room messages requests observed: ${recoveryRequests.length}`);
    console.log(`- recovery topic messages requests observed: ${topicRecoveryRequests.length}`);
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
