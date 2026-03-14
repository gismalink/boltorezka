#!/usr/bin/env node
// Purpose: Validate deterministic desktop handoff protocol endpoints (attempt/status/complete).
import { randomUUID } from "node:crypto";

const baseUrl = String(process.env.SMOKE_API_URL ?? process.env.SMOKE_WEB_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const bearer = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? "").trim();

if (!bearer) {
  console.error("[smoke:desktop:handoff-deterministic] requires SMOKE_TEST_BEARER_TOKEN");
  process.exit(1);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
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

async function main() {
  const attemptCreate = await requestJson("/v1/auth/desktop-handoff/attempt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`
    }
  });

  if (!attemptCreate.ok) {
    throw new Error(`[smoke:desktop:handoff-deterministic] attempt create failed: ${attemptCreate.status}`);
  }

  const attemptId = String(attemptCreate.payload?.attemptId || "").trim();
  if (!attemptId) {
    throw new Error("[smoke:desktop:handoff-deterministic] attemptId is missing in create response");
  }

  const statusPending = await requestJson(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(attemptId)}`);
  if (!statusPending.ok || statusPending.payload?.status !== "pending") {
    throw new Error(`[smoke:desktop:handoff-deterministic] expected pending status before complete, got '${String(statusPending.payload?.status || "<empty>")}'`);
  }

  const handoffCreate = await requestJson("/v1/auth/desktop-handoff", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`
    }
  });

  if (!handoffCreate.ok) {
    throw new Error(`[smoke:desktop:handoff-deterministic] handoff code create failed: ${handoffCreate.status}`);
  }

  const code = String(handoffCreate.payload?.code || "").trim();
  if (!code) {
    throw new Error("[smoke:desktop:handoff-deterministic] handoff code is missing");
  }

  const exchange = await requestJson("/v1/auth/desktop-handoff/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ code })
  });

  if (!exchange.ok || exchange.payload?.authenticated !== true) {
    throw new Error(`[smoke:desktop:handoff-deterministic] exchange failed: ${exchange.status}`);
  }

  const desktopToken = String(exchange.payload?.token || "").trim();
  if (!desktopToken) {
    throw new Error("[smoke:desktop:handoff-deterministic] desktop token is missing in exchange response");
  }

  const complete = await requestJson("/v1/auth/desktop-handoff/complete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${desktopToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ attemptId })
  });

  if (!complete.ok || complete.payload?.status !== "completed") {
    throw new Error(`[smoke:desktop:handoff-deterministic] complete failed: ${complete.status}`);
  }

  const statusCompleted = await requestJson(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(attemptId)}`);
  if (!statusCompleted.ok || statusCompleted.payload?.status !== "completed") {
    throw new Error(`[smoke:desktop:handoff-deterministic] expected completed status after ack, got '${String(statusCompleted.payload?.status || "<empty>")}'`);
  }

  const fakeAttemptId = randomUUID();
  const statusExpired = await requestJson(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(fakeAttemptId)}`);
  if (!statusExpired.ok || statusExpired.payload?.status !== "expired") {
    throw new Error(`[smoke:desktop:handoff-deterministic] expected expired status for random attempt id, got '${String(statusExpired.payload?.status || "<empty>")}'`);
  }

  const completeExpired = await requestJson("/v1/auth/desktop-handoff/complete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${desktopToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ attemptId: fakeAttemptId })
  });

  if (completeExpired.status !== 404) {
    throw new Error(`[smoke:desktop:handoff-deterministic] expected 404 for complete on expired attempt, got ${completeExpired.status}`);
  }

  console.log("[smoke:desktop:handoff-deterministic] ok");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- attemptStatusBeforeComplete: ${statusPending.payload?.status}`);
  console.log(`- attemptStatusAfterComplete: ${statusCompleted.payload?.status}`);
  console.log(`- timeoutPathStatus: ${statusExpired.payload?.status}`);
}

main().catch((error) => {
  console.error("[smoke:desktop:handoff-deterministic] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
