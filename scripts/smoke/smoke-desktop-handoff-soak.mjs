#!/usr/bin/env node
// Purpose: Run repeated deterministic desktop handoff cycles to detect race/regression under churn.

const baseUrl = String(process.env.SMOKE_API_URL ?? process.env.SMOKE_WEB_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const bearer = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? "").trim();
const cycles = Math.max(1, Number(process.env.SMOKE_DESKTOP_HANDOFF_SOAK_CYCLES ?? 20));

if (!bearer) {
  console.error("[smoke:desktop:handoff:soak] requires SMOKE_TEST_BEARER_TOKEN");
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
  return { ok: response.ok, status: response.status, payload };
}

async function oneCycle(index) {
  const attemptCreate = await requestJson("/v1/auth/desktop-handoff/attempt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`
    }
  });
  if (!attemptCreate.ok) {
    throw new Error(`cycle#${index}: attempt create failed (${attemptCreate.status})`);
  }

  const attemptId = String(attemptCreate.payload?.attemptId || "").trim();
  if (!attemptId) {
    throw new Error(`cycle#${index}: attemptId missing`);
  }

  const before = await requestJson(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(attemptId)}`);
  if (!before.ok || before.payload?.status !== "pending") {
    throw new Error(`cycle#${index}: expected pending before complete, got '${String(before.payload?.status || "<empty>")}'`);
  }

  const handoffCreate = await requestJson("/v1/auth/desktop-handoff", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`
    }
  });
  if (!handoffCreate.ok) {
    throw new Error(`cycle#${index}: handoff create failed (${handoffCreate.status})`);
  }

  const code = String(handoffCreate.payload?.code || "").trim();
  if (!code) {
    throw new Error(`cycle#${index}: handoff code missing`);
  }

  const exchange = await requestJson("/v1/auth/desktop-handoff/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ code })
  });
  if (!exchange.ok || exchange.payload?.authenticated !== true) {
    throw new Error(`cycle#${index}: handoff exchange failed (${exchange.status})`);
  }

  const desktopToken = String(exchange.payload?.token || "").trim();
  const userId = String(exchange.payload?.user?.id || "").trim();
  if (!desktopToken || !userId) {
    throw new Error(`cycle#${index}: exchange missing token/user`);
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
    throw new Error(`cycle#${index}: attempt complete failed (${complete.status})`);
  }

  const after = await requestJson(`/v1/auth/desktop-handoff/attempt/${encodeURIComponent(attemptId)}`);
  if (!after.ok || after.payload?.status !== "completed") {
    throw new Error(`cycle#${index}: expected completed after ack, got '${String(after.payload?.status || "<empty>")}'`);
  }

  return {
    cycle: index,
    userId,
    attemptId,
    before: before.payload?.status,
    after: after.payload?.status
  };
}

async function main() {
  const startedAt = Date.now();
  const results = [];

  for (let i = 1; i <= cycles; i += 1) {
    // Sequential cycles intentionally maximize race-condition detection around handoff state transitions.
    const item = await oneCycle(i);
    results.push(item);
  }

  const elapsedMs = Date.now() - startedAt;
  const uniqueUsers = new Set(results.map((item) => item.userId));

  if (uniqueUsers.size !== 1) {
    throw new Error(`[smoke:desktop:handoff:soak] expected single user across cycles, got ${uniqueUsers.size}`);
  }

  console.log("[smoke:desktop:handoff:soak] ok");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- cycles: ${cycles}`);
  console.log(`- elapsedMs: ${elapsedMs}`);
  console.log(`- userId: ${results[0]?.userId || "<empty>"}`);
  console.log("- stateTransition: pending->completed (all cycles)");
}

main().catch((error) => {
  console.error("[smoke:desktop:handoff:soak] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
