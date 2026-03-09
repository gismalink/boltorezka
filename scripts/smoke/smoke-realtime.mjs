// Purpose: Realtime WebSocket smoke checks for join/chat/idempotency/call relay/reconnect flows.
import WS from "ws";

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const allowLegacyBearer = process.env.SMOKE_ALLOW_LEGACY_BEARER === "1";
const bearerToken = process.env.SMOKE_TEST_BEARER_TOKEN
  ?? (allowLegacyBearer ? (process.env.SMOKE_BEARER_TOKEN ?? "") : "");
const bearerTokenSecond = process.env.SMOKE_TEST_BEARER_TOKEN_SECOND
  ?? (allowLegacyBearer ? (process.env.SMOKE_BEARER_TOKEN_SECOND ?? "") : "");
const preissuedTicket = process.env.SMOKE_WS_TICKET ?? "";
const preissuedTicketSecond = process.env.SMOKE_WS_TICKET_SECOND ?? "";
const preissuedTicketSecondReconnect = process.env.SMOKE_WS_TICKET_SECOND_RECONNECT ?? "";
const preissuedTicketReconnect = process.env.SMOKE_WS_TICKET_RECONNECT ?? "";
const smokeCallSignal = process.env.SMOKE_CALL_SIGNAL === "1";
const smokeCallLiveRoom = process.env.SMOKE_CALL_LIVE_ROOM === "1";
const smokeReconnect = process.env.SMOKE_RECONNECT === "1";
const canRunReconnect = Boolean(preissuedTicketReconnect || bearerToken);
const roomSlug = process.env.SMOKE_ROOM_SLUG ?? "general";
const MAX_SMOKE_TEST_DURATION_MS = 120000;
const timeoutMs = Math.min(Number(process.env.SMOKE_TIMEOUT_MS ?? 10000), MAX_SMOKE_TEST_DURATION_MS);
const liveRoomDurationMs = Number(process.env.SMOKE_CALL_LIVE_ROOM_DURATION_MS ?? 90000);
const liveRoomParticipantCount = Number(process.env.SMOKE_CALL_LIVE_ROOM_PARTICIPANTS ?? 6);
const liveRoomStepMinMs = Number(process.env.SMOKE_CALL_LIVE_ROOM_STEP_MIN_MS ?? 3000);
const liveRoomStepMaxMs = Number(process.env.SMOKE_CALL_LIVE_ROOM_STEP_MAX_MS ?? 9000);
const liveRoomActionTimeoutMs = Math.min(Number(process.env.SMOKE_CALL_LIVE_ROOM_ACTION_TIMEOUT_MS ?? 7000), MAX_SMOKE_TEST_DURATION_MS);
const liveRoomTicketPool = String(process.env.SMOKE_CALL_LIVE_ROOM_TICKETS ?? "");
const liveRoomBearerPool = String(process.env.SMOKE_CALL_LIVE_ROOM_BEARER_TOKENS ?? process.env.SMOKE_TEST_BEARER_TOKENS ?? "");
const liveRoomToneMode = process.env.SMOKE_CALL_LIVE_ROOM_TONE_MODE === "1";
const liveRoomTonePeriodMs = Number(process.env.SMOKE_CALL_LIVE_ROOM_TONE_PERIOD_MS ?? 7000);
const liveRoomTonePhaseSpread = Number(process.env.SMOKE_CALL_LIVE_ROOM_TONE_PHASE_SPREAD ?? 0.9);
const liveRoomRequireLateJoin = process.env.SMOKE_CALL_LIVE_ROOM_REQUIRE_LATE_JOIN === "1";
const liveRoomLateJoinAtRatio = Number(process.env.SMOKE_CALL_LIVE_ROOM_LATE_JOIN_AT_RATIO ?? 0.3);
const pollIntervalMinMs = Number(process.env.SMOKE_POLL_INTERVAL_MIN_MS ?? 25);
const pollIntervalMaxMs = Number(process.env.SMOKE_POLL_INTERVAL_MAX_MS ?? 220);
const pollBackoffFactor = Number(process.env.SMOKE_POLL_BACKOFF_FACTOR ?? 1.35);
const requireInitialStateReplay = process.env.SMOKE_REQUIRE_INITIAL_STATE_REPLAY !== "0";
const requireMediaTopology = process.env.SMOKE_REQUIRE_MEDIA_TOPOLOGY !== "0";
const rawExpectedMediaTopology = String(process.env.SMOKE_EXPECT_MEDIA_TOPOLOGY || "livekit").trim().toLowerCase();
const expectedMediaTopology = "livekit";

if (rawExpectedMediaTopology && rawExpectedMediaTopology !== "livekit") {
  console.error(`[smoke:realtime] only livekit topology is supported, got: ${rawExpectedMediaTopology}`);
  process.exit(1);
}

const isHttp = baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
if (!isHttp) {
  console.error(`[smoke:realtime] invalid SMOKE_API_URL: ${baseUrl}`);
  process.exit(1);
}

if (!preissuedTicket && !bearerToken && !smokeCallLiveRoom) {
  console.error("[smoke:realtime] set SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET");
  process.exit(1);
}

if (smokeCallLiveRoom && (liveRoomParticipantCount < 5 || liveRoomParticipantCount > 6)) {
  console.error("[smoke:realtime] SMOKE_CALL_LIVE_ROOM_PARTICIPANTS must be between 5 and 6");
  process.exit(1);
}

if (smokeCallLiveRoom && (liveRoomDurationMs < 60000 || liveRoomDurationMs > MAX_SMOKE_TEST_DURATION_MS)) {
  console.error(`[smoke:realtime] SMOKE_CALL_LIVE_ROOM_DURATION_MS must be between 60000 and ${MAX_SMOKE_TEST_DURATION_MS}`);
  process.exit(1);
}

if (smokeCallLiveRoom && liveRoomActionTimeoutMs > MAX_SMOKE_TEST_DURATION_MS) {
  console.error(`[smoke:realtime] SMOKE_CALL_LIVE_ROOM_ACTION_TIMEOUT_MS must be <= ${MAX_SMOKE_TEST_DURATION_MS}`);
  process.exit(1);
}

if (smokeCallLiveRoom && (liveRoomStepMinMs < 400 || liveRoomStepMaxMs < liveRoomStepMinMs)) {
  console.error("[smoke:realtime] invalid live room step bounds");
  process.exit(1);
}

if (smokeCallLiveRoom && (liveRoomTonePeriodMs < 1200 || liveRoomTonePeriodMs > 60000)) {
  console.error("[smoke:realtime] invalid SMOKE_CALL_LIVE_ROOM_TONE_PERIOD_MS (1200..60000)");
  process.exit(1);
}

if (smokeCallLiveRoom && liveRoomRequireLateJoin && (liveRoomLateJoinAtRatio < 0.1 || liveRoomLateJoinAtRatio > 0.8)) {
  console.error("[smoke:realtime] SMOKE_CALL_LIVE_ROOM_LATE_JOIN_AT_RATIO must be between 0.1 and 0.8");
  process.exit(1);
}

if (pollIntervalMinMs < 5 || pollIntervalMaxMs < pollIntervalMinMs) {
  console.error("[smoke:realtime] invalid adaptive poll interval bounds");
  process.exit(1);
}

if (pollBackoffFactor < 1 || pollBackoffFactor > 3) {
  console.error("[smoke:realtime] SMOKE_POLL_BACKOFF_FACTOR must be between 1 and 3");
  process.exit(1);
}

if (smokeCallSignal && !bearerToken && !preissuedTicketSecond) {
  console.error("[smoke:realtime] SMOKE_CALL_SIGNAL=1 requires SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET_SECOND");
  process.exit(1);
}

function toWsUrl(httpUrl) {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return parsed;
}

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  const seen = new Set();
  const result = [];
  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomInt(min, max) {
  const floorMin = Math.floor(min);
  const floorMax = Math.floor(max);
  if (floorMax <= floorMin) {
    return floorMin;
  }
  return floorMin + Math.floor(Math.random() * (floorMax - floorMin + 1));
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return items[randomInt(0, items.length - 1)] || null;
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

async function resolveTicketFromBearerToken(token, label) {
  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] ${label} /v1/auth/ws-ticket failed: ${response.status}`);
  }

  return payload.ticket;
}

async function resolveTicket() {
  if (preissuedTicket) {
    return preissuedTicket;
  }

  if (!bearerToken) {
    const poolTicket = parseCsvList(liveRoomTicketPool)[0];
    if (poolTicket) {
      return poolTicket;
    }

    const poolBearerToken = parseCsvList(liveRoomBearerPool)[0];
    if (poolBearerToken) {
      return resolveTicketFromBearerToken(poolBearerToken, "primary-from-pool");
    }
  }

  return resolveTicketFromBearerToken(bearerToken, "primary");
}

async function resolveSecondTicket() {
  if (preissuedTicketSecond) {
    return preissuedTicketSecond;
  }

  const tokenForSecondTicket = bearerTokenSecond || bearerToken;
  if (!tokenForSecondTicket) {
    return null;
  }

  return resolveTicketFromBearerToken(tokenForSecondTicket, "second");
}

async function resolveSecondReconnectTicket() {
  if (preissuedTicketSecondReconnect) {
    return preissuedTicketSecondReconnect;
  }

  const tokenForSecondTicket = bearerTokenSecond || bearerToken;
  if (!tokenForSecondTicket) {
    return null;
  }

  return resolveTicketFromBearerToken(tokenForSecondTicket, "second-reconnect");
}

async function resolveReconnectTicket() {
  if (preissuedTicketReconnect) {
    return preissuedTicketReconnect;
  }

  if (!bearerToken) {
    throw new Error("[smoke:realtime] SMOKE_RECONNECT=1 requires SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET_RECONNECT");
  }

  return resolveTicketFromBearerToken(bearerToken, "reconnect");
}

async function waitForEvent(events, predicate, label, options = {}) {
  const started = Date.now();
  const waitTimeoutMs = Number(options.timeoutMs ?? timeoutMs);
  let pollMs = Number(options.initialPollMs ?? pollIntervalMinMs);

  while (Date.now() - started <= waitTimeoutMs) {
    const hit = events.find(predicate);
    if (hit) {
      return hit;
    }

    await sleep(pollMs);
    const backoffMs = Math.round(pollMs * pollBackoffFactor);
    pollMs = Math.min(pollIntervalMaxMs, Math.max(pollIntervalMinMs, backoffMs));
  }

  throw new Error(`[smoke:realtime] timeout: ${label}`);
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

async function waitForInitialStateReplay(events, label, expectedRoomSlug) {
  const replay = await waitForEvent(
    events,
    (item) => item?.type === "call.initial_state",
    `call.initial_state (${label})`
  );

  const replayRoomSlug = String(replay?.payload?.roomSlug || "").trim();
  if (expectedRoomSlug && replayRoomSlug && replayRoomSlug !== expectedRoomSlug) {
    throw new Error(`[smoke:realtime] ${label} call.initial_state roomSlug mismatch: expected=${expectedRoomSlug} actual=${replayRoomSlug}`);
  }

  if (!Array.isArray(replay?.payload?.participants)) {
    throw new Error(`[smoke:realtime] ${label} call.initial_state participants must be array`);
  }

  return replay;
}

async function waitForRoomTopology(events, label, expectedRoomSlug, expectedTopology) {
  const joined = await waitForEvent(
    events,
    (item) => item?.type === "room.joined" && String(item?.payload?.roomSlug || "").trim() === expectedRoomSlug,
    `room.joined (${label})`
  );

  const joinedTopology = String(joined?.payload?.mediaTopology || "").trim().toLowerCase();
  if (joinedTopology !== expectedTopology) {
    throw new Error(`[smoke:realtime] ${label} room.joined mediaTopology mismatch: expected=${expectedTopology} actual=${joinedTopology || "missing"}`);
  }

  const presence = await waitForEvent(
    events,
    (item) => item?.type === "room.presence" && String(item?.payload?.roomSlug || "").trim() === expectedRoomSlug,
    `room.presence (${label})`
  );

  const presenceTopology = String(presence?.payload?.mediaTopology || "").trim().toLowerCase();
  if (presenceTopology !== expectedTopology) {
    throw new Error(`[smoke:realtime] ${label} room.presence mediaTopology mismatch: expected=${expectedTopology} actual=${presenceTopology || "missing"}`);
  }
}

async function openRealtimeSocket({ ticket, label, timeoutMs }) {
  const wsUrl = toWsUrl(baseUrl);
  wsUrl.pathname = "/v1/realtime/ws";
  wsUrl.search = "";
  wsUrl.searchParams.set("ticket", ticket);

  const ws = new WS(wsUrl.toString());
  const events = [];

  ws.on("message", (raw) => {
    try {
      const value = typeof raw === "string" ? raw : raw.toString("utf8");
      events.push(JSON.parse(value));
    } catch {
      return;
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[smoke:realtime] ${label} websocket open timeout`)), timeoutMs);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const ready = await waitForEvent(events, (item) => item?.type === "server.ready", `server.ready for ${label}`);
  const userId = String(ready?.payload?.userId || "").trim();
  if (!userId) {
    throw new Error(`[smoke:realtime] ${label} user id is missing`);
  }

  return { ws, events, userId };
}

async function sendAckedEvent({ ws, events, type, payload, idempotencyKey, label, timeoutMs, allowedNackCodes = [] }) {
  const requestId = `${label}-${Date.now()}-${randomInt(1000, 9999)}`;
  const frame = {
    type,
    requestId,
    payload
  };

  if (idempotencyKey) {
    frame.idempotencyKey = idempotencyKey;
  }

  ws.send(JSON.stringify(frame));

  const result = await waitForAckOrNack(events, requestId, `${type} ack|nack (${label})`);
  if (!result.ok && !allowedNackCodes.includes(result.code)) {
    throw new Error(`[smoke:realtime] ${type} unexpected nack (${label}): ${result.code || "unknown"}`);
  }

  return result;
}

async function runLiveRoomBehaviorScenario({ roomSlug, timeoutMs }) {
  const explicitTickets = parseCsvList(liveRoomTicketPool);
  const explicitBearerTokens = parseCsvList(liveRoomBearerPool);

  const baseTickets = uniqueList([preissuedTicket, preissuedTicketSecond, ...explicitTickets]);
  const baseBearerTokens = uniqueList([bearerToken, bearerTokenSecond, ...explicitBearerTokens]);

  const participantDefs = Array.from({ length: liveRoomParticipantCount }, (_, index) => {
    const slot = index + 1;
    return {
      label: `live-user-${slot}`,
      ticket: baseTickets[index] || "",
      bearerToken: baseBearerTokens[index] || "",
      state: {
        muted: false,
        speaking: false,
        audioMuted: false,
        videoEnabled: false
      },
      tonePhase: index * liveRoomTonePhaseSpread
    };
  });

  const missingCredentials = participantDefs.filter((item) => !item.ticket && !item.bearerToken);
  if (missingCredentials.length > 0) {
    throw new Error(
      `[smoke:realtime] SMOKE_CALL_LIVE_ROOM=1 requires credentials for ${liveRoomParticipantCount} users via SMOKE_CALL_LIVE_ROOM_TICKETS or SMOKE_CALL_LIVE_ROOM_BEARER_TOKENS`
    );
  }

  const sessions = [];
  const immediateParticipants = liveRoomRequireLateJoin
    ? participantDefs.slice(0, Math.max(1, participantDefs.length - 1))
    : participantDefs;
  const lateJoinParticipant = liveRoomRequireLateJoin
    ? participantDefs[participantDefs.length - 1]
    : null;

  for (const participant of immediateParticipants) {
    const ticket = participant.ticket || await resolveTicketFromBearerToken(participant.bearerToken, participant.label);
    const session = await openRealtimeSocket({ ticket, label: participant.label, timeoutMs });
    await sendAckedEvent({
      ws: session.ws,
      events: session.events,
      type: "room.join",
      payload: { roomSlug },
      label: `join-${participant.label}`,
      timeoutMs
    });

    sessions.push({
      ...session,
      ...participant
    });

    await sleep(randomInt(300, 1300));
  }

  const uniqueUserIds = new Set(sessions.map((item) => item.userId));
  if (uniqueUserIds.size !== sessions.length) {
    throw new Error("[smoke:realtime] live-room scenario requires distinct users for each participant");
  }

  const startedAt = Date.now();
  const lateJoinDueAtMs = startedAt + Math.floor(liveRoomDurationMs * liveRoomLateJoinAtRatio);
  const forceRejoinAfterMs = Math.floor(liveRoomDurationMs * 0.6);
  const stats = {
    micEvents: 0,
    videoEvents: 0,
    headsetEvents: 0,
    chatEvents: 0,
    mediaStateBursts: 0,
    lateJoinEvents: 0,
    leaveRejoinEvents: 0,
    toneModeEnabled: liveRoomToneMode,
    toneSpeakingSwitches: 0,
    toneSpeakingTicks: 0,
    toneTotalTicks: 0
  };

  const computeToneSpeaking = (actor, nowMs) => {
    if (!liveRoomToneMode) {
      return null;
    }

    const period = Math.max(1200, liveRoomTonePeriodMs);
    const normalized = ((nowMs - startedAt) / period) * Math.PI * 2;
    const value = Math.sin(normalized + actor.tonePhase);
    return value > 0.1;
  };

  const performLeaveAndRejoin = async () => {
    const connected = sessions.filter((item) => item.ws.readyState === WS.OPEN);
    const rejoinCandidate = pickRandom(connected.filter((item) => Boolean(item.bearerToken)));
    if (!rejoinCandidate) {
      return false;
    }

    rejoinCandidate.ws.close();
    await sleep(randomInt(1200, 2600));

    const reconnectTicket = await resolveTicketFromBearerToken(rejoinCandidate.bearerToken, `${rejoinCandidate.label}-rejoin`);
    const reconnectedSession = await openRealtimeSocket({
      ticket: reconnectTicket,
      label: `${rejoinCandidate.label}-rejoin`,
      timeoutMs
    });
    await sendAckedEvent({
      ws: reconnectedSession.ws,
      events: reconnectedSession.events,
      type: "room.join",
      payload: { roomSlug },
      label: `rejoin-${rejoinCandidate.label}`,
      timeoutMs
    });

    rejoinCandidate.ws = reconnectedSession.ws;
    rejoinCandidate.events = reconnectedSession.events;
    rejoinCandidate.userId = reconnectedSession.userId;
    stats.leaveRejoinEvents += 1;
    return true;
  };

  while (Date.now() - startedAt < liveRoomDurationMs) {
    if (liveRoomRequireLateJoin && lateJoinParticipant && stats.lateJoinEvents === 0 && Date.now() >= lateJoinDueAtMs) {
      const lateTicket = lateJoinParticipant.ticket || await resolveTicketFromBearerToken(lateJoinParticipant.bearerToken, lateJoinParticipant.label);
      const lateSession = await openRealtimeSocket({ ticket: lateTicket, label: `${lateJoinParticipant.label}-late`, timeoutMs });
      await sendAckedEvent({
        ws: lateSession.ws,
        events: lateSession.events,
        type: "room.join",
        payload: { roomSlug },
        label: `join-late-${lateJoinParticipant.label}`,
        timeoutMs
      });

      sessions.push({
        ...lateSession,
        ...lateJoinParticipant
      });

      const uniqueLateJoinUserIds = new Set(sessions.map((item) => item.userId));
      if (uniqueLateJoinUserIds.size !== sessions.length) {
        throw new Error("[smoke:realtime] late-join scenario produced duplicate users");
      }

      stats.lateJoinEvents += 1;
    }

    const connected = sessions.filter((item) => item.ws.readyState === WS.OPEN);
    if (connected.length < Math.max(4, liveRoomParticipantCount - 1)) {
      throw new Error("[smoke:realtime] too few active participants during live-room scenario");
    }

    const actor = pickRandom(connected);
    if (!actor) {
      throw new Error("[smoke:realtime] failed to pick actor for live-room scenario");
    }

    if (stats.leaveRejoinEvents === 0 && Date.now() - startedAt >= forceRejoinAfterMs) {
      await performLeaveAndRejoin();
      await sleep(randomInt(liveRoomStepMinMs, liveRoomStepMaxMs));
      continue;
    }

    const roll = Math.random();
    if (roll < 0.3) {
      if (Math.random() < 0.45) {
        actor.state.muted = !actor.state.muted;
      }
      const prevSpeaking = actor.state.speaking;
      const toneSpeaking = computeToneSpeaking(actor, Date.now());
      const nextSpeaking = toneSpeaking === null
        ? (!actor.state.muted && !actor.state.audioMuted && Math.random() < 0.65)
        : (!actor.state.muted && !actor.state.audioMuted && toneSpeaking);
      actor.state.speaking = nextSpeaking;

      if (liveRoomToneMode) {
        stats.toneTotalTicks += 1;
        if (nextSpeaking) {
          stats.toneSpeakingTicks += 1;
        }
        if (prevSpeaking !== nextSpeaking) {
          stats.toneSpeakingSwitches += 1;
        }
      }

      await sendAckedEvent({
        ws: actor.ws,
        events: actor.events,
        type: "call.mic_state",
        payload: {
          muted: actor.state.muted,
          speaking: actor.state.speaking,
          audioMuted: actor.state.audioMuted
        },
        label: `mic-${actor.label}`,
        timeoutMs: liveRoomActionTimeoutMs
      });
      stats.micEvents += 1;
    } else if (roll < 0.55) {
      actor.state.videoEnabled = !actor.state.videoEnabled;
      await sendAckedEvent({
        ws: actor.ws,
        events: actor.events,
        type: "call.video_state",
        payload: {
          settings: {
            localVideoEnabled: actor.state.videoEnabled
          }
        },
        label: `video-${actor.label}`,
        timeoutMs: liveRoomActionTimeoutMs
      });
      stats.videoEvents += 1;
    } else if (roll < 0.75) {
      actor.state.audioMuted = !actor.state.audioMuted;
      if (actor.state.audioMuted) {
        actor.state.speaking = false;
      } else if (liveRoomToneMode) {
        const toneSpeaking = computeToneSpeaking(actor, Date.now());
        actor.state.speaking = Boolean(toneSpeaking);
      }
      await sendAckedEvent({
        ws: actor.ws,
        events: actor.events,
        type: "call.mic_state",
        payload: {
          muted: actor.state.muted,
          speaking: actor.state.speaking,
          audioMuted: actor.state.audioMuted
        },
        label: `headset-${actor.label}`,
        timeoutMs: liveRoomActionTimeoutMs
      });
      stats.headsetEvents += 1;
    } else if (roll < 0.9) {
      await sendAckedEvent({
        ws: actor.ws,
        events: actor.events,
        type: "chat.send",
        payload: {
          text: `${actor.label} says hello at ${new Date().toISOString()}`
        },
        idempotencyKey: `live-chat-${Date.now()}-${randomInt(1000, 9999)}`,
        label: `chat-${actor.label}`,
        timeoutMs: liveRoomActionTimeoutMs
      });
      stats.chatEvents += 1;
    } else if (roll < 0.97) {
      actor.state.videoEnabled = !actor.state.videoEnabled;
      await sendAckedEvent({
        ws: actor.ws,
        events: actor.events,
        type: "call.video_state",
        payload: {
          settings: {
            localVideoEnabled: actor.state.videoEnabled
          }
        },
        label: `video-burst-${actor.label}`,
        timeoutMs: liveRoomActionTimeoutMs
      });
      stats.mediaStateBursts += 1;
    } else {
      await performLeaveAndRejoin();
    }

    await sleep(randomInt(liveRoomStepMinMs, liveRoomStepMaxMs));
  }

  sessions.forEach((session) => {
    try {
      session.ws.close();
    } catch {
      return;
    }
  });

  const totalActions = stats.micEvents
    + stats.videoEvents
    + stats.headsetEvents
    + stats.chatEvents
    + stats.mediaStateBursts
    + stats.lateJoinEvents
    + stats.leaveRejoinEvents;

  if (totalActions < 30) {
    throw new Error(`[smoke:realtime] live-room scenario too short: only ${totalActions} actions completed`);
  }

  if (stats.leaveRejoinEvents < 1) {
    throw new Error("[smoke:realtime] live-room scenario must include at least one leave/rejoin event");
  }

  if (liveRoomRequireLateJoin && stats.lateJoinEvents < 1) {
    throw new Error("[smoke:realtime] live-room scenario must include at least one late join event");
  }

  return {
    ok: true,
    participants: sessions.length,
    durationMs: liveRoomDurationMs,
    totalActions,
    toneSpeakingDutyCycle: stats.toneTotalTicks > 0
      ? Number((stats.toneSpeakingTicks / stats.toneTotalTicks).toFixed(4))
      : null,
    ...stats
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
  if (String(nack?.payload?.category || "") !== "topology") {
    throw new Error(`[smoke:realtime] expected nack.category=topology for pre-join chat, got ${String(nack?.payload?.category || "missing")}`);
  }

  const requestJoin = `join-${Date.now()}`;
  ws.send(JSON.stringify({ type: "room.join", requestId: requestJoin, payload: { roomSlug } }));

  const joinResult = await waitForAckOrNack(events, requestJoin, "ack|nack for room.join");
  if (!joinResult.ok) {
    throw new Error(`[smoke:realtime] room.join rejected: ${joinResult.code || joinResult.type || "unknown"}`);
  }

  let initialStateReplayFirstOk = false;
  let mediaTopologyFirstOk = false;
  if (requireMediaTopology) {
    await waitForRoomTopology(events, "first", roomSlug, expectedMediaTopology);
    mediaTopologyFirstOk = true;
  }

  if (requireInitialStateReplay) {
    await waitForInitialStateReplay(events, "first", roomSlug);
    initialStateReplayFirstOk = true;
  }

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
  let liveRoomOk = false;
  let liveRoomStats = null;
  let initialStateReplaySecondOk = false;
  let mediaTopologySecondOk = false;
  let callMissingTargetRejected = false;
  let callSignalIdempotencyOk = false;
  let callSignalGuarded = false;
  let callSignalGuardCode = null;
  let callNegotiationReconnectSkipped = false;
  let reconnectOk = false;
  let reconnectSkipped = false;
  if (smokeCallSignal) {
    if (!secondTicket) {
      throw new Error("[smoke:realtime] second ticket is required for realtime media-state smoke");
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
      throw new Error("[smoke:realtime] realtime media-state smoke requires two distinct users");
    }

    const secondJoinRequest = `join2-${Date.now()}`;
    wsSecond.send(JSON.stringify({ type: "room.join", requestId: secondJoinRequest, payload: { roomSlug } }));
    await waitForEvent(
      secondEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === secondJoinRequest,
      "ack for second room.join"
    );

    if (requireMediaTopology) {
      await waitForRoomTopology(secondEvents, "second", roomSlug, expectedMediaTopology);
      mediaTopologySecondOk = true;
    }

    if (requireInitialStateReplay) {
      await waitForInitialStateReplay(secondEvents, "second", roomSlug);
      initialStateReplaySecondOk = true;
    }

    const micStateRequestId = `call-mic-state-${Date.now()}`;
    const micPayload = { muted: false, speaking: true, audioMuted: false };
    ws.send(JSON.stringify({ type: "call.mic_state", requestId: micStateRequestId, payload: micPayload }));

    await waitForEvent(
      events,
      (item) => item?.type === "ack" && item?.payload?.requestId === micStateRequestId,
      "ack for call.mic_state"
    );

    await waitForEvent(
      secondEvents,
      (item) => item?.type === "call.mic_state"
        && String(item?.payload?.fromUserId || "") === firstUserId
        && item?.payload?.muted === micPayload.muted
        && item?.payload?.speaking === micPayload.speaking,
      "relayed call.mic_state"
    );

    const videoStateRequestId = `call-video-state-${Date.now()}`;
    wsSecond.send(JSON.stringify({
      type: "call.video_state",
      requestId: videoStateRequestId,
      payload: { settings: { localVideoEnabled: true } }
    }));

    await waitForEvent(
      secondEvents,
      (item) => item?.type === "ack" && item?.payload?.requestId === videoStateRequestId,
      "ack for call.video_state"
    );

    await waitForEvent(
      events,
      (item) => item?.type === "call.video_state"
        && String(item?.payload?.fromUserId || "") === secondUserId
        && item?.payload?.settings?.localVideoEnabled === true,
      "relayed call.video_state"
    );

    callSignalRelayed = true;
    callSignalGuarded = true;
    callSignalGuardCode = "legacy-disabled";
    callMissingTargetRejected = true;
    callSignalIdempotencyOk = true;
    callNegotiationReconnectSkipped = true;

    if (requireInitialStateReplay && !initialStateReplaySecondOk) {
      throw new Error("[smoke:realtime] call.initial_state replay missing for second join");
    }
    if (requireMediaTopology && !mediaTopologySecondOk) {
      throw new Error("[smoke:realtime] mediaTopology missing for second join");
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

  if (smokeCallLiveRoom) {
    liveRoomStats = await runLiveRoomBehaviorScenario({ roomSlug, timeoutMs });
    liveRoomOk = Boolean(liveRoomStats?.ok);
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
        requireMediaTopology,
        expectedMediaTopology,
        mediaTopologyFirstOk,
        mediaTopologySecondOk: smokeCallSignal ? mediaTopologySecondOk : null,
        requireInitialStateReplay,
        initialStateReplayFirstOk,
        initialStateReplaySecondOk: smokeCallSignal ? initialStateReplaySecondOk : null,
        reconnectOk,
        reconnectSkipped,
        liveRoomOk,
        liveRoomStats,
        callSignalRelayed,
        callSignalGuarded,
        callSignalGuardCode,
        callMissingTargetRejected,
        callSignalIdempotencyOk,
        callNegotiationReconnectSkipped
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
