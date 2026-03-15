#!/usr/bin/env node
// Purpose: Browser-level deterministic handoff soak across Chromium/WebKit/Firefox.
import { chromium, firefox, webkit } from "playwright";

const baseUrl = String(process.env.SMOKE_API_URL ?? process.env.SMOKE_WEB_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const bearer = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? "").trim();
const totalCycles = Math.max(3, Number(process.env.SMOKE_DESKTOP_HANDOFF_BROWSER_SOAK_CYCLES ?? 20));
const browserSpecs = [
  { name: "chromium", launcher: chromium },
  { name: "webkit", launcher: webkit },
  { name: "firefox", launcher: firefox }
];

if (!bearer) {
  console.error("[smoke:desktop:handoff:browser-soak] requires SMOKE_TEST_BEARER_TOKEN");
  process.exit(1);
}

function cycleCountForIndex(index) {
  const per = Math.floor(totalCycles / browserSpecs.length);
  const rem = totalCycles % browserSpecs.length;
  return per + (index < rem ? 1 : 0);
}

async function runOneCycle(page, cycleNo) {
  const result = await page.evaluate(async ({ token }) => {
    async function request(path, init = {}) {
      const response = await fetch(path, init);
      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }
      return {
        ok: response.ok,
        status: response.status,
        payload
      };
    }

    const headersAuth = {
      Authorization: `Bearer ${token}`
    };

    const attemptCreate = await request("/v1/auth/desktop-handoff/attempt", {
      method: "POST",
      headers: headersAuth
    });
    if (!attemptCreate.ok) {
      return { ok: false, stage: "attemptCreate", detail: String(attemptCreate.status) };
    }

    const attemptId = String(attemptCreate.payload?.attemptId || "").trim();
    if (!attemptId) {
      return { ok: false, stage: "attemptId", detail: "missing" };
    }

    const before = await request(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(attemptId)}`);
    if (!before.ok || before.payload?.status !== "pending") {
      return { ok: false, stage: "statusBefore", detail: String(before.payload?.status || before.status) };
    }

    const handoffCreate = await request("/v1/auth/desktop-handoff", {
      method: "POST",
      headers: headersAuth
    });
    if (!handoffCreate.ok) {
      return { ok: false, stage: "handoffCreate", detail: String(handoffCreate.status) };
    }

    const code = String(handoffCreate.payload?.code || "").trim();
    if (!code) {
      return { ok: false, stage: "handoffCode", detail: "missing" };
    }

    const exchange = await request("/v1/auth/desktop-handoff/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ code })
    });
    if (!exchange.ok || exchange.payload?.authenticated !== true) {
      return { ok: false, stage: "exchange", detail: String(exchange.status) };
    }

    const desktopToken = String(exchange.payload?.token || "").trim();
    if (!desktopToken) {
      return { ok: false, stage: "exchangeToken", detail: "missing" };
    }

    const complete = await request("/v1/auth/desktop-handoff/complete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${desktopToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ attemptId })
    });
    if (!complete.ok || complete.payload?.status !== "completed") {
      return { ok: false, stage: "complete", detail: String(complete.status) };
    }

    const after = await request(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(attemptId)}`);
    if (!after.ok || after.payload?.status !== "completed") {
      return { ok: false, stage: "statusAfter", detail: String(after.payload?.status || after.status) };
    }

    return {
      ok: true,
      userId: String(exchange.payload?.user?.id || "").trim(),
      transition: `${before.payload?.status}->${after.payload?.status}`
    };
  }, { token: bearer });

  if (!result?.ok) {
    throw new Error(`cycle#${cycleNo} failed at ${result?.stage || "unknown"}: ${result?.detail || "no-detail"}`);
  }

  return result;
}

async function runForBrowser(spec, cycles) {
  const browser = await spec.launcher.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const userIds = new Set();
    for (let i = 1; i <= cycles; i += 1) {
      const cycleResult = await runOneCycle(page, i);
      if (cycleResult.userId) {
        userIds.add(cycleResult.userId);
      }
      if (cycleResult.transition !== "pending->completed") {
        throw new Error(`cycle#${i}: unexpected transition ${cycleResult.transition}`);
      }
    }

    return {
      browser: spec.name,
      cycles,
      userIds: Array.from(userIds)
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const startedAt = Date.now();
  const perBrowser = [];

  for (let i = 0; i < browserSpecs.length; i += 1) {
    const count = cycleCountForIndex(i);
    const res = await runForBrowser(browserSpecs[i], count);
    perBrowser.push(res);
  }

  const elapsedMs = Date.now() - startedAt;
  const uniqueUserIds = new Set(perBrowser.flatMap((item) => item.userIds));
  if (uniqueUserIds.size !== 1) {
    throw new Error(`[smoke:desktop:handoff:browser-soak] expected one stable user id, got ${uniqueUserIds.size}`);
  }

  console.log("[smoke:desktop:handoff:browser-soak] ok");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- totalCycles: ${totalCycles}`);
  console.log(`- elapsedMs: ${elapsedMs}`);
  for (const row of perBrowser) {
    console.log(`- ${row.browser}: cycles=${row.cycles}, userIds=${row.userIds.length}`);
  }
  console.log("- transition: pending->completed (all cycles)");
}

main().catch((error) => {
  console.error("[smoke:desktop:handoff:browser-soak] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
