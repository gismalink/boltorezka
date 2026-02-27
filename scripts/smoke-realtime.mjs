import WS from "ws";

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const bearerToken = process.env.SMOKE_BEARER_TOKEN ?? "";
const preissuedTicket = process.env.SMOKE_WS_TICKET ?? "";
const preissuedTicketSecond = process.env.SMOKE_WS_TICKET_SECOND ?? "";
const smokeCallSignal = process.env.SMOKE_CALL_SIGNAL === "1";
const roomSlug = process.env.SMOKE_ROOM_SLUG ?? "general";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10000);

const isHttp = baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
if (!isHttp) {
  console.error(`[smoke:realtime] invalid SMOKE_API_URL: ${baseUrl}`);
  process.exit(1);
}

if (!preissuedTicket && !bearerToken) {
  console.error("[smoke:realtime] set SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET");
  process.exit(1);
}

if (smokeCallSignal && !bearerToken && !preissuedTicketSecond) {
  console.error("[smoke:realtime] SMOKE_CALL_SIGNAL=1 requires SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET_SECOND");
  process.exit(1);
}

function toWsUrl(httpUrl) {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return parsed;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload };
}

async function resolveTicket() {
  if (preissuedTicket) {
    return preissuedTicket;
  }

  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerToken}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] /v1/auth/ws-ticket failed: ${response.status}`);
  }

  return payload.ticket;
}

async function resolveSecondTicket() {
  if (preissuedTicketSecond) {
    return preissuedTicketSecond;
  }

  if (!bearerToken) {
    return null;
  }

  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerToken}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] second /v1/auth/ws-ticket failed: ${response.status}`);
  }

  return payload.ticket;
}

function waitForEvent(events, predicate, label) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const hit = events.find(predicate);
      if (hit) {
        clearInterval(timer);
        resolve(hit);
        return;
      }

      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`[smoke:realtime] timeout: ${label}`));
      }
    }, 50);
  });
}

(async () => {
  const ticket = await resolveTicket();
  const secondTicket = smokeCallSignal ? await resolveSecondTicket() : null;
  const wsUrl = toWsUrl(baseUrl);
  wsUrl.pathname = "/v1/realtime/ws";
  wsUrl.search = "";
  wsUrl.searchParams.set("ticket", ticket);

  const ws = new WS(wsUrl.toString());
  const events = [];
  let wsSecond = null;
  const secondEvents = [];

  ws.on("message", (raw) => {
    try {
      const value = typeof raw === "string" ? raw : raw.toString("utf8");
      events.push(JSON.parse(value));
    } catch {
      return;
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("[smoke:realtime] websocket open timeout")), timeoutMs);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const firstReady = await waitForEvent(events, (item) => item?.type === "server.ready", "server.ready for first websocket");
  const firstUserId = String(firstReady?.payload?.userId || "").trim();
  if (!firstUserId) {
    throw new Error("[smoke:realtime] first websocket user id is missing");
  }

  const requestNack = `nack-${Date.now()}`;
  ws.send(JSON.stringify({ type: "chat.send", requestId: requestNack, payload: { text: "smoke pre-join nack" } }));

  const nack = await waitForEvent(
    events,
    (item) => item?.type === "nack" && item?.payload?.requestId === requestNack,
    "nack before room.join"
  );

  const requestJoin = `join-${Date.now()}`;
  ws.send(JSON.stringify({ type: "room.join", requestId: requestJoin, payload: { roomSlug } }));

  await waitForEvent(
    events,
    (item) => item?.type === "ack" && item?.payload?.requestId === requestJoin,
    "ack for room.join"
  );

  const idempotencyKey = `idem-${Date.now()}`;
  const requestChat1 = `chat1-${Date.now()}`;

  ws.send(
    JSON.stringify({
      type: "chat.send",
      requestId: requestChat1,
      idempotencyKey,
      payload: { text: `smoke ${new Date().toISOString()}` }
    })
  );

  const firstAck = await waitForEvent(
    events,
    (item) => item?.type === "ack" && item?.payload?.requestId === requestChat1,
    "ack for first chat.send"
  );

  await waitForEvent(
    events,
    (item) => item?.type === "chat.message" && item?.payload?.senderRequestId === requestChat1,
    "chat.message for first chat.send"
  );

  const requestChat2 = `chat2-${Date.now()}`;
  ws.send(
    JSON.stringify({
      type: "chat.send",
      requestId: requestChat2,
      idempotencyKey,
      payload: { text: "smoke duplicate" }
    })
  );

  const duplicateAck = await waitForEvent(
    events,
    (item) => item?.type === "ack" && item?.payload?.requestId === requestChat2,
    "ack for duplicate chat.send"
  );

  if (duplicateAck?.payload?.duplicate !== true) {
    throw new Error("[smoke:realtime] expected duplicate=true in duplicate ack");
  }

  let callSignalRelayed = false;
  let callRejectRelayed = false;
  let callHangupRelayed = false;
  if (smokeCallSignal) {
    if (!secondTicket) {
      throw new Error("[smoke:realtime] second ticket is required for call signaling smoke");
    }

    const wsSecondUrl = toWsUrl(baseUrl);
    wsSecondUrl.pathname = "/v1/realtime/ws";
    wsSecondUrl.search = "";
    wsSecondUrl.searchParams.set("ticket", secondTicket);
    wsSecond = new WS(wsSecondUrl.toString());

    wsSecond.on("message", (raw) => {
      try {
        const value = typeof raw === "string" ? raw : raw.toString("utf8");
        secondEvents.push(JSON.parse(value));
      } catch {
        return;
      }
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("[smoke:realtime] second websocket open timeout")), timeoutMs);

      wsSecond.once("open", () => {
        clearTimeout(timer);
        resolve();
      });

      wsSecond.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const secondReady = await waitForEvent(secondEvents, (item) => item?.type === "server.ready", "server.ready for second websocket");
    const secondUserId = String(secondReady?.payload?.userId || "").trim();
    if (!secondUserId) {
      throw new Error("[smoke:realtime] second websocket user id is missing");
    }

    const secondJoinRequest = `join2-${Date.now()}`;
    wsSecond.send(JSON.stringify({ type: "room.join", requestId: secondJoinRequest, payload: { roomSlug } }));
    await waitForEvent(
      secondEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === secondJoinRequest,
      "ack for second room.join"
    );

    const callRequestId = `call-offer-${Date.now()}`;
    const signalPayload = { type: "offer", sdp: "smoke-offer-sdp" };
    ws.send(
      JSON.stringify({
        type: "call.offer",
        requestId: callRequestId,
        payload: {
          targetUserId: secondUserId,
          signal: signalPayload
        }
      })
    );

    const callAck = await waitForEvent(
      events,
      (item) => item?.type === "ack" && item?.payload?.requestId === callRequestId,
      "ack for call.offer"
    );

    const relayedOffer = await waitForEvent(
      secondEvents,
      (item) => item?.type === "call.offer" && item?.payload?.signal?.type === "offer",
      "relayed call.offer"
    );

    if (Number(callAck?.payload?.relayedTo || 0) < 1) {
      throw new Error("[smoke:realtime] expected call.offer relayedTo >= 1");
    }

    if (String(relayedOffer?.payload?.targetUserId || "") !== secondUserId) {
      throw new Error("[smoke:realtime] relayed call.offer targetUserId mismatch");
    }

    callSignalRelayed = true;

    const rejectRequestId = `call-reject-${Date.now()}`;
    wsSecond.send(
      JSON.stringify({
        type: "call.reject",
        requestId: rejectRequestId,
        payload: {
          targetUserId: firstUserId,
          reason: "smoke-reject"
        }
      })
    );

    const rejectAck = await waitForEvent(
      secondEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === rejectRequestId,
      "ack for call.reject"
    );

    const relayedReject = await waitForEvent(
      events,
      (item) => item?.type === "call.reject" && item?.payload?.reason === "smoke-reject",
      "relayed call.reject"
    );

    if (Number(rejectAck?.payload?.relayedTo || 0) < 1) {
      throw new Error("[smoke:realtime] expected call.reject relayedTo >= 1");
    }

    if (String(relayedReject?.payload?.targetUserId || "") !== firstUserId) {
      throw new Error("[smoke:realtime] relayed call.reject targetUserId mismatch");
    }

    callRejectRelayed = true;

    const hangupRequestId = `call-hangup-${Date.now()}`;
    ws.send(
      JSON.stringify({
        type: "call.hangup",
        requestId: hangupRequestId,
        payload: {
          targetUserId: secondUserId,
          reason: "smoke-hangup"
        }
      })
    );

    const hangupAck = await waitForEvent(
      events,
      (item) => item?.type === "ack" && item?.payload?.requestId === hangupRequestId,
      "ack for call.hangup"
    );

    const relayedHangup = await waitForEvent(
      secondEvents,
      (item) => item?.type === "call.hangup" && item?.payload?.reason === "smoke-hangup",
      "relayed call.hangup"
    );

    if (Number(hangupAck?.payload?.relayedTo || 0) < 1) {
      throw new Error("[smoke:realtime] expected call.hangup relayedTo >= 1");
    }

    if (String(relayedHangup?.payload?.targetUserId || "") !== secondUserId) {
      throw new Error("[smoke:realtime] relayed call.hangup targetUserId mismatch");
    }

    callHangupRelayed = true;
  }

  ws.close();
  if (wsSecond) {
    wsSecond.close();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        roomSlug,
        nackCode: nack?.payload?.code ?? null,
        firstMessageId: firstAck?.payload?.messageId ?? null,
        duplicateIdempotencyKey: duplicateAck?.payload?.idempotencyKey ?? null,
        callSignalRelayed,
        callRejectRelayed,
        callHangupRelayed
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
