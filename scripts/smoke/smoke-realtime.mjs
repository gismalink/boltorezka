// Purpose: Realtime WebSocket smoke checks for join/chat/idempotency/call relay/reconnect flows.
import WS from "ws";

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const allowLegacyBearer = process.env.SMOKE_ALLOW_LEGACY_BEARER === "1";
const bearerToken = process.env.SMOKE_TEST_BEARER_TOKEN
  ?? (allowLegacyBearer ? (process.env.SMOKE_BEARER_TOKEN ?? "") : "");
const bearerTokenSecond = process.env.SMOKE_TEST_BEARER_TOKEN_SECOND
  ?? (allowLegacyBearer ? (process.env.SMOKE_BEARER_TOKEN_SECOND ?? "") : "");
const bearerTokenThird = process.env.SMOKE_TEST_BEARER_TOKEN_THIRD
  ?? (allowLegacyBearer ? (process.env.SMOKE_BEARER_TOKEN_THIRD ?? "") : "");
const preissuedTicket = process.env.SMOKE_WS_TICKET ?? "";
const preissuedTicketSecond = process.env.SMOKE_WS_TICKET_SECOND ?? "";
const preissuedTicketThird = process.env.SMOKE_WS_TICKET_THIRD ?? "";
const preissuedTicketReconnect = process.env.SMOKE_WS_TICKET_RECONNECT ?? "";
const smokeCallSignal = process.env.SMOKE_CALL_SIGNAL === "1";
const smokeCallRace3Way = process.env.SMOKE_CALL_RACE_3WAY === "1";
const smokeCallCameraToggleReconnect = process.env.SMOKE_CALL_CAMERA_TOGGLE_RECONNECT === "1";
const smokeReconnect = process.env.SMOKE_RECONNECT === "1";
const canRunReconnect = Boolean(preissuedTicketReconnect || bearerToken);
const roomSlug = process.env.SMOKE_ROOM_SLUG ?? "general";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10000);

const isHttp = baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
if (!isHttp) {
  console.error(`[smoke:realtime] invalid SMOKE_API_URL: ${baseUrl}`);
  process.exit(1);
}

if (!preissuedTicket && !bearerToken) {
  console.error("[smoke:realtime] set SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET");
  process.exit(1);
}

if (smokeCallSignal && !bearerToken && !preissuedTicketSecond) {
  console.error("[smoke:realtime] SMOKE_CALL_SIGNAL=1 requires SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET_SECOND");
  process.exit(1);
}

if (smokeCallRace3Way && !preissuedTicketThird && !bearerTokenThird) {
  console.error("[smoke:realtime] SMOKE_CALL_RACE_3WAY=1 requires SMOKE_TEST_BEARER_TOKEN_THIRD or SMOKE_WS_TICKET_THIRD");
  process.exit(1);
}

if (smokeCallCameraToggleReconnect && !smokeCallRace3Way) {
  console.error("[smoke:realtime] SMOKE_CALL_CAMERA_TOGGLE_RECONNECT=1 requires SMOKE_CALL_RACE_3WAY=1");
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

  const tokenForSecondTicket = bearerTokenSecond || bearerToken;
  if (!tokenForSecondTicket) {
    return null;
  }

  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenForSecondTicket}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] second /v1/auth/ws-ticket failed: ${response.status}`);
  }

  return payload.ticket;
}

async function resolveReconnectTicket() {
  if (preissuedTicketReconnect) {
    return preissuedTicketReconnect;
  }

  if (!bearerToken) {
    throw new Error("[smoke:realtime] SMOKE_RECONNECT=1 requires SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET_RECONNECT");
  }

  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerToken}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] reconnect /v1/auth/ws-ticket failed: ${response.status}`);
  }

  return payload.ticket;
}

async function resolveThirdTicket() {
  if (preissuedTicketThird) {
    return preissuedTicketThird;
  }

  if (!bearerTokenThird) {
    throw new Error("[smoke:realtime] third ticket requires SMOKE_TEST_BEARER_TOKEN_THIRD or SMOKE_WS_TICKET_THIRD");
  }

  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerTokenThird}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] third /v1/auth/ws-ticket failed: ${response.status}`);
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

async function waitForAckOrNack(events, requestId, label) {
  // Concurrent offer races may legitimately return nack; this helper treats both as terminal outcomes.
  const event = await waitForEvent(
    events,
    (item) => {
      const eventRequestId = item?.payload?.requestId;
      if (eventRequestId !== requestId) {
        return false;
      }
      return item?.type === "ack" || item?.type === "nack";
    },
    label
  );

  return {
    ok: event?.type === "ack",
    type: String(event?.type || ""),
    code: String(event?.payload?.code || "")
  };
}

async function runThreeWayRaceScenario({
  firstWs,
  secondWs,
  firstEvents,
  secondEvents,
  firstUserId,
  secondUserId,
  roomSlug,
  timeoutMs,
  cameraToggleReconnect
}) {
  const thirdTicket = await resolveThirdTicket();
  const wsThirdUrl = toWsUrl(baseUrl);
  wsThirdUrl.pathname = "/v1/realtime/ws";
  wsThirdUrl.search = "";
  wsThirdUrl.searchParams.set("ticket", thirdTicket);
  const wsThird = new WS(wsThirdUrl.toString());
  const thirdEvents = [];

  wsThird.on("message", (raw) => {
    try {
      const value = typeof raw === "string" ? raw : raw.toString("utf8");
      thirdEvents.push(JSON.parse(value));
    } catch {
      return;
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("[smoke:realtime] third websocket open timeout")), timeoutMs);

    wsThird.once("open", () => {
      clearTimeout(timer);
      resolve();
    });

    wsThird.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const thirdReady = await waitForEvent(thirdEvents, (item) => item?.type === "server.ready", "server.ready for third websocket");
  const thirdUserId = String(thirdReady?.payload?.userId || "").trim();
  if (!thirdUserId || thirdUserId === firstUserId || thirdUserId === secondUserId) {
    throw new Error("[smoke:realtime] third websocket must belong to distinct user");
  }

  const joinRequest = `join3-${Date.now()}`;
  wsThird.send(JSON.stringify({ type: "room.join", requestId: joinRequest, payload: { roomSlug } }));
  await waitForEvent(thirdEvents, (item) => item?.type === "ack" && item?.payload?.requestId === joinRequest, "ack for third room.join");

  // Send concurrent offer pairs to trigger possible glare paths in a controlled manner.
  const offerAB = `race-offer-ab-${Date.now()}`;
  const offerBA = `race-offer-ba-${Date.now()}`;
  firstWs.send(JSON.stringify({ type: "call.offer", requestId: offerAB, payload: { targetUserId: secondUserId, signal: { type: "offer", sdp: "race-ab" } } }));
  secondWs.send(JSON.stringify({ type: "call.offer", requestId: offerBA, payload: { targetUserId: firstUserId, signal: { type: "offer", sdp: "race-ba" } } }));
  const firstPairAcks = await Promise.all([
    waitForAckOrNack(firstEvents, offerAB, "ack|nack race offer A->B"),
    waitForAckOrNack(secondEvents, offerBA, "ack|nack race offer B->A")
  ]);

  const offerAC = `race-offer-ac-${Date.now()}`;
  const offerCA = `race-offer-ca-${Date.now()}`;
  firstWs.send(JSON.stringify({ type: "call.offer", requestId: offerAC, payload: { targetUserId: thirdUserId, signal: { type: "offer", sdp: "race-ac" } } }));
  wsThird.send(JSON.stringify({ type: "call.offer", requestId: offerCA, payload: { targetUserId: firstUserId, signal: { type: "offer", sdp: "race-ca" } } }));
  const secondPairAcks = await Promise.all([
    waitForAckOrNack(firstEvents, offerAC, "ack|nack race offer A->C"),
    waitForAckOrNack(thirdEvents, offerCA, "ack|nack race offer C->A")
  ]);

  const raceVideoRequestFirst = `race-video-1-${Date.now()}`;
  const raceVideoRequestSecond = `race-video-2-${Date.now()}`;
  const raceVideoRequestThird = `race-video-3-${Date.now()}`;
  firstWs.send(JSON.stringify({ type: "call.video_state", requestId: raceVideoRequestFirst, payload: { settings: { localVideoEnabled: true } } }));
  secondWs.send(JSON.stringify({ type: "call.video_state", requestId: raceVideoRequestSecond, payload: { settings: { localVideoEnabled: false } } }));
  wsThird.send(JSON.stringify({ type: "call.video_state", requestId: raceVideoRequestThird, payload: { settings: { localVideoEnabled: true } } }));

  if (cameraToggleReconnect) {
    await waitForEvent(firstEvents, (item) => item?.type === "ack" && item?.payload?.requestId === raceVideoRequestFirst, "ack race video state A");
    await waitForEvent(secondEvents, (item) => item?.type === "ack" && item?.payload?.requestId === raceVideoRequestSecond, "ack race video state B");
    await waitForEvent(thirdEvents, (item) => item?.type === "ack" && item?.payload?.requestId === raceVideoRequestThird, "ack race video state C");
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const allEvents = [...firstEvents, ...secondEvents, ...thirdEvents];
  const offerRateLimited = allEvents.filter((item) => item?.type === "nack" && item?.payload?.code === "OfferRateLimited").length;

  const raceRequestResults = [...firstPairAcks, ...secondPairAcks];
  const hardFailures = raceRequestResults.filter((result) => !result.ok && result.code && result.code !== "OfferRateLimited");
  if (hardFailures.length > 0) {
    throw new Error(`[smoke:realtime] race3way unexpected nack codes: ${hardFailures.map((result) => result.code).join(",")}`);
  }

  if (offerRateLimited > 4) {
    throw new Error(`[smoke:realtime] race3way excessive OfferRateLimited: ${offerRateLimited}`);
  }

  wsThird.close();

  const reconnectTicket = await resolveThirdTicket();
  const wsThirdReconnectUrl = toWsUrl(baseUrl);
  wsThirdReconnectUrl.pathname = "/v1/realtime/ws";
  wsThirdReconnectUrl.search = "";
  wsThirdReconnectUrl.searchParams.set("ticket", reconnectTicket);
  const wsThirdReconnect = new WS(wsThirdReconnectUrl.toString());
  const reconnectEvents = [];
  wsThirdReconnect.on("message", (raw) => {
    try {
      const value = typeof raw === "string" ? raw : raw.toString("utf8");
      reconnectEvents.push(JSON.parse(value));
    } catch {
      return;
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("[smoke:realtime] third reconnect websocket open timeout")), timeoutMs);

    wsThirdReconnect.once("open", () => {
      clearTimeout(timer);
      resolve();
    });

    wsThirdReconnect.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  await waitForEvent(reconnectEvents, (item) => item?.type === "server.ready", "server.ready for third reconnect websocket");
  const rejoinRequest = `rejoin3-${Date.now()}`;
  wsThirdReconnect.send(JSON.stringify({ type: "room.join", requestId: rejoinRequest, payload: { roomSlug } }));
  await waitForEvent(reconnectEvents, (item) => item?.type === "ack" && item?.payload?.requestId === rejoinRequest, "ack for third rejoin");

  let cameraToggleReconnectOk = false;
  if (cameraToggleReconnect) {
    const reconnectOfferRequest = `race-reconnect-offer-a3-${Date.now()}`;
    firstWs.send(JSON.stringify({
      type: "call.offer",
      requestId: reconnectOfferRequest,
      payload: {
        targetUserId: thirdUserId,
        signal: { type: "offer", sdp: "race-reconnect-a3" }
      }
    }));

    const reconnectOfferResult = await waitForAckOrNack(firstEvents, reconnectOfferRequest, "ack|nack race reconnect offer A->C");
    if (!reconnectOfferResult.ok && reconnectOfferResult.code && reconnectOfferResult.code !== "OfferRateLimited") {
      throw new Error(`[smoke:realtime] race reconnect unexpected nack: ${reconnectOfferResult.code}`);
    }

    const reconnectVideoRequest = `race-video-reconnect-3-${Date.now()}`;
    wsThirdReconnect.send(JSON.stringify({
      type: "call.video_state",
      requestId: reconnectVideoRequest,
      payload: { settings: { localVideoEnabled: false } }
    }));
    await waitForEvent(
      reconnectEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === reconnectVideoRequest,
      "ack for race reconnect video state C"
    );

    cameraToggleReconnectOk = true;
  }

  wsThirdReconnect.close();

  return {
    race3WayOk: true,
    race3WayReconnectOk: true,
    race3WayOfferRateLimited: offerRateLimited,
    cameraToggleReconnectOk
  };
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
  let race3WayOk = false;
  let race3WayReconnectOk = false;
  let race3WayOfferRateLimited = 0;
  let cameraToggleReconnectOk = false;
  let reconnectOk = false;
  let reconnectSkipped = false;
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
    if (secondUserId === firstUserId) {
      throw new Error("[smoke:realtime] call-signal requires second ticket from another user (first and second user ids are equal)");
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

    if (smokeCallRace3Way) {
      const raceResult = await runThreeWayRaceScenario({
        firstWs: ws,
        secondWs: wsSecond,
        firstEvents: events,
        secondEvents,
        firstUserId,
        secondUserId,
        roomSlug,
        timeoutMs,
        cameraToggleReconnect: smokeCallCameraToggleReconnect
      });
      race3WayOk = raceResult.race3WayOk;
      race3WayReconnectOk = raceResult.race3WayReconnectOk;
      race3WayOfferRateLimited = raceResult.race3WayOfferRateLimited;
      cameraToggleReconnectOk = raceResult.cameraToggleReconnectOk;
    }
  }

  if (smokeReconnect && canRunReconnect) {
    ws.close();

    const reconnectTicket = await resolveReconnectTicket();
    const wsReconnectUrl = toWsUrl(baseUrl);
    wsReconnectUrl.pathname = "/v1/realtime/ws";
    wsReconnectUrl.search = "";
    wsReconnectUrl.searchParams.set("ticket", reconnectTicket);

    const reconnectEvents = [];
    const wsReconnect = new WS(wsReconnectUrl.toString());

    wsReconnect.on("message", (raw) => {
      try {
        const value = typeof raw === "string" ? raw : raw.toString("utf8");
        reconnectEvents.push(JSON.parse(value));
      } catch {
        return;
      }
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("[smoke:realtime] reconnect websocket open timeout")), timeoutMs);

      wsReconnect.once("open", () => {
        clearTimeout(timer);
        resolve();
      });

      wsReconnect.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    await waitForEvent(reconnectEvents, (item) => item?.type === "server.ready", "server.ready after reconnect");

    const reconnectJoinRequest = `rejoin-${Date.now()}`;
    wsReconnect.send(JSON.stringify({ type: "room.join", requestId: reconnectJoinRequest, payload: { roomSlug } }));

    await waitForEvent(
      reconnectEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === reconnectJoinRequest,
      "ack for room.join after reconnect"
    );

    const reconnectChatRequest = `chat-reconnect-${Date.now()}`;
    wsReconnect.send(
      JSON.stringify({
        type: "chat.send",
        requestId: reconnectChatRequest,
        idempotencyKey: `idem-reconnect-${Date.now()}`,
        payload: { text: `smoke reconnect ${new Date().toISOString()}` }
      })
    );

    await waitForEvent(
      reconnectEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === reconnectChatRequest,
      "ack for chat.send after reconnect"
    );

    reconnectOk = true;
    wsReconnect.close();
  } else if (smokeReconnect && !canRunReconnect) {
    reconnectSkipped = true;
    console.warn("[smoke:realtime] reconnect scenario skipped: set SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET_RECONNECT");
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
        reconnectOk,
        reconnectSkipped,
        race3WayOk,
        race3WayReconnectOk,
        race3WayOfferRateLimited,
        cameraToggleReconnectOk,
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
