import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { db } from "../db.js";
import { config } from "../config.js";
import { registerRealtimeSocket, unregisterRealtimeSocket } from "../realtime-broadcast.js";
import { RealtimeCallSignalHandler } from "./realtime-call-signal.js";
import type { InsertedMessageRow, RoomRow } from "../db.types.ts";
import {
  buildRoomsPresenceEnvelope,
  asKnownWsIncomingEnvelope,
  buildAckEnvelope,
  buildCallInitialStateEnvelope,
  buildCallMicStateRelayEnvelope,
  buildCallTerminalRelayEnvelope,
  buildCallVideoStateRelayEnvelope,
  buildChatDeletedEnvelope,
  buildChatEditedEnvelope,
  buildChatMessageEnvelope,
  buildErrorEnvelope,
  buildNackEnvelope,
  buildPongEnvelope,
  buildPresenceJoinedEnvelope,
  buildPresenceLeftEnvelope,
  buildRoomJoinedEnvelope,
  buildRoomLeftEnvelope,
  buildRoomPresenceEnvelope,
  buildServerReadyEnvelope,
  getPayloadString,
  parseWsIncomingEnvelope
} from "../ws-protocol.js";
type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type WsTicketClaims = {
  userId?: string;
  userName?: string;
  name?: string;
  email?: string;
};

type CanJoinRoomResult =
  | { ok: true; room: RoomRow }
  | { ok: false; reason: "RoomNotFound" | "Forbidden" };

type RelayOutcome = {
  ok: boolean;
  relayedCount: number;
};

type CanonicalMediaState = {
  muted: boolean;
  speaking: boolean;
  audioMuted: boolean;
  localVideoEnabled: boolean;
  lastUpdatedAtMs: number;
};

type MediaTopology = "p2p" | "sfu";
type RealtimeErrorCategory = "auth" | "permissions" | "topology" | "transport";

const CALL_SIGNAL_MIN_BYTES = 2;
const CALL_SDP_SIGNAL_MAX_BYTES = 600_000;
const CALL_ICE_SIGNAL_MAX_BYTES = 12_000;
const CALL_OFFER_MIN_INTERVAL_MS = 5000;
const CALL_OFFER_RATE_LIMIT_TTL_MS = 60000;
const CALL_RECONNECT_WINDOW_MS = 90000;
const CALL_GLARE_WINDOW_MS = 2500;
const CALL_SIGNAL_IDEMPOTENCY_TTL_SEC = 120;

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 128);
}

function sendAck(socket: WebSocket, requestId: string | null, eventType: string, meta: Record<string, unknown> = {}) {
  if (!requestId) {
    return;
  }

  sendJson(socket, buildAckEnvelope(requestId, eventType, meta));
}

function resolveErrorCategory(code: string): RealtimeErrorCategory {
  if (code === "Forbidden" || code === "ChannelKicked") {
    return "permissions";
  }

  if (
    code === "RoomNotFound"
    || code === "NoActiveRoom"
    || code === "TargetNotInRoom"
    || code === "ChannelSessionMoved"
  ) {
    return "topology";
  }

  if (code === "MissingTicket" || code === "InvalidTicket") {
    return "auth";
  }

  return "transport";
}

function sendNack(socket: WebSocket, requestId: string | null, eventType: string, code: string, message: string) {
  const category = resolveErrorCategory(code);
  if (!requestId) {
    sendJson(socket, buildErrorEnvelope(code, message, category));
    return;
  }

  sendJson(socket, buildNackEnvelope(requestId, eventType, code, message, category));
}

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function maskIceAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.includes(":")) {
    const parts = value.split(":").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}:*:${parts[parts.length - 1]}`;
    }
    return "*:*";
  }

  const parts = value.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }

  return "masked";
}

function maskIcePort(value: number | null): number | null {
  if (!Number.isFinite(value) || value === null) {
    return null;
  }

  return Math.floor(value / 1000) * 1000;
}

function extractIceCandidateMeta(signal: unknown): {
  iceCandidateType: string | null;
  iceTransport: string | null;
  iceTcpType: string | null;
  iceAddress: string | null;
  icePort: number | null;
  iceAddressRaw?: string | null;
  icePortRaw?: number | null;
} {
  let candidateLine: string | null = null;

  if (signal && typeof signal === "object") {
    const maybeSignal = signal as { candidate?: unknown };

    if (typeof maybeSignal.candidate === "string") {
      candidateLine = maybeSignal.candidate;
    } else if (maybeSignal.candidate && typeof maybeSignal.candidate === "object") {
      const nestedCandidate = maybeSignal.candidate as { candidate?: unknown };
      if (typeof nestedCandidate.candidate === "string") {
        candidateLine = nestedCandidate.candidate;
      }
    }
  }

  if (!candidateLine) {
    return {
      iceCandidateType: null,
      iceTransport: null,
      iceTcpType: null,
      iceAddress: null,
      icePort: null
    };
  }

  const typeMatch = candidateLine.match(/\btyp\s+([a-z0-9]+)/i);
  const transportMatch = candidateLine.match(/\b(udp|tcp)\b/i);
  const tcpTypeMatch = candidateLine.match(/\btcptype\s+([a-z0-9]+)/i);
  const addressPortMatch = candidateLine.match(/candidate:[^\s]+\s+\d+\s+(?:udp|tcp)\s+\d+\s+([^\s]+)\s+(\d+)/i);
  const icePortRaw = addressPortMatch?.[2] ? Number.parseInt(addressPortMatch[2], 10) : null;
  const iceAddressRaw = addressPortMatch?.[1] ?? null;
  const wsCallDebugRawIceEnabled = process.env.WS_CALL_DEBUG_RAW_ICE === "1";

  return {
    iceCandidateType: typeMatch?.[1]?.toLowerCase() ?? null,
    iceTransport: transportMatch?.[1]?.toLowerCase() ?? null,
    iceTcpType: tcpTypeMatch?.[1]?.toLowerCase() ?? null,
    iceAddress: maskIceAddress(iceAddressRaw),
    icePort: maskIcePort(Number.isFinite(icePortRaw) ? icePortRaw : null),
    ...(wsCallDebugRawIceEnabled
      ? {
          iceAddressRaw,
          icePortRaw: Number.isFinite(icePortRaw) ? icePortRaw : null
        }
      : {})
  };
}

function extractSdpMeta(signal: unknown): {
  sdpLength: number | null;
  sdpCandidateLines: number | null;
  sdpRelayCandidates: number | null;
  sdpSrflxCandidates: number | null;
  sdpHostCandidates: number | null;
  sdpHasRelay: boolean | null;
  sdpHasTrickleOption: boolean | null;
} {
  if (!signal || typeof signal !== "object") {
    return {
      sdpLength: null,
      sdpCandidateLines: null,
      sdpRelayCandidates: null,
      sdpSrflxCandidates: null,
      sdpHostCandidates: null,
      sdpHasRelay: null,
      sdpHasTrickleOption: null
    };
  }

  const maybeSignal = signal as { sdp?: unknown };
  if (typeof maybeSignal.sdp !== "string") {
    return {
      sdpLength: null,
      sdpCandidateLines: null,
      sdpRelayCandidates: null,
      sdpSrflxCandidates: null,
      sdpHostCandidates: null,
      sdpHasRelay: null,
      sdpHasTrickleOption: null
    };
  }

  const sdp = maybeSignal.sdp;
  const candidateLines = sdp.match(/^a=candidate:.*$/gm) ?? [];
  let relay = 0;
  let srflx = 0;
  let host = 0;

  for (const line of candidateLines) {
    const typeMatch = line.match(/\btyp\s+([a-z0-9]+)/i);
    const candidateType = typeMatch?.[1]?.toLowerCase() ?? null;
    if (candidateType === "relay") {
      relay += 1;
    } else if (candidateType === "srflx") {
      srflx += 1;
    } else if (candidateType === "host") {
      host += 1;
    }
  }

  return {
    sdpLength: sdp.length,
    sdpCandidateLines: candidateLines.length,
    sdpRelayCandidates: relay,
    sdpSrflxCandidates: srflx,
    sdpHostCandidates: host,
    sdpHasRelay: relay > 0,
    sdpHasTrickleOption: /a=ice-options:\s*trickle/i.test(sdp)
  };
}

export async function realtimeRoutes(fastify: FastifyInstance) {
  const socketsByUserId = new Map<string, Set<WebSocket>>();
  const socketsByRoomId = new Map<string, Set<WebSocket>>();
  const socketState = new WeakMap<WebSocket, SocketState>();
  const lastCallOfferByPair = new Map<string, number>();
  const wsCallDebugEnabled = process.env.WS_CALL_DEBUG === "1";
  const mediaStateByRoomUserKey = new Map<string, CanonicalMediaState>();
  const recentRoomDetachByRoomUserKey = new Map<string, number>();

  const mediaStateKey = (roomId: string, userId: string) => `${roomId}:${userId}`;

  const setCanonicalMediaState = (
    roomId: string,
    userId: string,
    patch: Partial<CanonicalMediaState>
  ) => {
    const key = mediaStateKey(roomId, userId);
    const current = mediaStateByRoomUserKey.get(key) || {
      muted: false,
      speaking: false,
      audioMuted: false,
      localVideoEnabled: false,
      lastUpdatedAtMs: Date.now()
    };

    mediaStateByRoomUserKey.set(key, {
      ...current,
      ...patch,
      lastUpdatedAtMs: Date.now()
    });
  };

  const clearCanonicalMediaState = (roomId: string, userId: string) => {
    mediaStateByRoomUserKey.delete(mediaStateKey(roomId, userId));
  };

  const markRecentRoomDetach = (roomId: string, userId: string) => {
    const key = mediaStateKey(roomId, userId);
    recentRoomDetachByRoomUserKey.set(key, Date.now());

    if (recentRoomDetachByRoomUserKey.size > 6000) {
      const threshold = Date.now() - CALL_RECONNECT_WINDOW_MS;
      for (const [storedKey, at] of recentRoomDetachByRoomUserKey.entries()) {
        if (at < threshold) {
          recentRoomDetachByRoomUserKey.delete(storedKey);
        }
      }
    }
  };

  const consumeRecentReconnectMark = (roomId: string, userId: string): boolean => {
    const key = mediaStateKey(roomId, userId);
    const at = recentRoomDetachByRoomUserKey.get(key) || 0;
    if (!at) {
      return false;
    }

    recentRoomDetachByRoomUserKey.delete(key);
    return Date.now() - at <= CALL_RECONNECT_WINDOW_MS;
  };

  const isCallOfferRateLimited = (fromUserId: string, targetUserId: string): boolean => {
    const now = Date.now();
    const key = `${fromUserId}->${targetUserId}`;
    const lastAt = lastCallOfferByPair.get(key) || 0;

    if (lastAt > 0 && now - lastAt < CALL_OFFER_MIN_INTERVAL_MS) {
      return true;
    }

    lastCallOfferByPair.set(key, now);

    if (lastCallOfferByPair.size > 4000) {
      const threshold = now - CALL_OFFER_RATE_LIMIT_TTL_MS;
      for (const [pairKey, pairLastAt] of lastCallOfferByPair.entries()) {
        if (pairLastAt < threshold) {
          lastCallOfferByPair.delete(pairKey);
        }
      }
    }

    return false;
  };

  const logCallDebug = (message: string, meta: Record<string, unknown> = {}) => {
    if (!wsCallDebugEnabled) {
      return;
    }

    fastify.log.info(
      {
        scope: "ws-call",
        ...meta
      },
      message
    );
  };

  const incrementMetric = async (name: string) => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, 1);
    } catch {
      return;
    }
  };

  const incrementMetricBy = async (name: string, value: number) => {
    const delta = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    if (delta <= 0) {
      return;
    }

    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, delta);
    } catch {
      return;
    }
  };

  const attachUserSocket = (userId: string, socket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId) || new Set();
    userSockets.add(socket);
    socketsByUserId.set(userId, userSockets);
  };

  const detachUserSocket = (userId: string, socket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }
    userSockets.delete(socket);
    if (userSockets.size === 0) {
      socketsByUserId.delete(userId);
    }
  };

  const attachRoomSocket = (roomId: string, socket: WebSocket) => {
    const roomSockets = socketsByRoomId.get(roomId) || new Set();
    roomSockets.add(socket);
    socketsByRoomId.set(roomId, roomSockets);
  };

  const detachRoomSocket = (roomId: string, socket: WebSocket) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }
    roomSockets.delete(socket);
    if (roomSockets.size === 0) {
      socketsByRoomId.delete(roomId);
    }
  };

  const broadcastRoom = (roomId: string, payload: unknown, excludedSocket: WebSocket | null = null) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }

    for (const socket of roomSockets) {
      if (socket !== excludedSocket) {
        sendJson(socket, payload);
      }
    }
  };

  const getRoomPresence = (roomId: string) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return [];
    }

    const seen = new Set();
    const users = [];

    for (const socket of roomSockets) {
      const state = socketState.get(socket);
      if (!state || seen.has(state.userId)) {
        continue;
      }

      seen.add(state.userId);
      users.push({ userId: state.userId, userName: state.userName });
    }

    return users;
  };

  const getCallInitialStateParticipants = (roomId: string) => {
    const presenceByUserId = new Map<string, string>();
    for (const user of getRoomPresence(roomId)) {
      presenceByUserId.set(user.userId, user.userName);
    }

    const participants: Array<{
      userId: string;
      userName: string;
      mic: { muted: boolean; speaking: boolean; audioMuted: boolean };
      video: { localVideoEnabled: boolean };
    }> = [];

    const prefix = `${roomId}:`;
    for (const [key, state] of mediaStateByRoomUserKey.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const userId = key.slice(prefix.length);
      const userName = presenceByUserId.get(userId);
      if (!userName) {
        continue;
      }

      participants.push({
        userId,
        userName,
        mic: {
          muted: state.muted,
          speaking: state.speaking,
          audioMuted: state.audioMuted
        },
        video: {
          localVideoEnabled: state.localVideoEnabled
        }
      });
    }

    return participants;
  };

  const getCallInitialStateLagStats = (roomId: string): { count: number; totalLagMs: number } => {
    const presenceByUserId = new Set(getRoomPresence(roomId).map((item) => item.userId));
    const prefix = `${roomId}:`;
    const now = Date.now();
    let count = 0;
    let totalLagMs = 0;

    for (const [key, state] of mediaStateByRoomUserKey.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const userId = key.slice(prefix.length);
      if (!presenceByUserId.has(userId)) {
        continue;
      }

      const lagMs = Math.max(0, now - Number(state.lastUpdatedAtMs || 0));
      totalLagMs += lagMs;
      count += 1;
    }

    return { count, totalLagMs };
  };

  const getAllRoomsPresence = (forUserId: string | null = null) => {
    const result: Array<{
      roomId: string;
      roomSlug: string;
      users: Array<{ userId: string; userName: string }>;
      mediaTopology: MediaTopology;
    }> = [];

    for (const [roomId, roomSockets] of socketsByRoomId.entries()) {
      let roomSlug: string | null = null;
      for (const socket of roomSockets) {
        const state = socketState.get(socket);
        if (state?.roomSlug) {
          roomSlug = state.roomSlug;
          break;
        }
      }

      if (!roomSlug) {
        continue;
      }

      result.push({
        roomId,
        roomSlug,
        users: getRoomPresence(roomId),
        mediaTopology: resolveRoomMediaTopology(roomSlug, forUserId)
      });
    }

    return result;
  };

  const broadcastAllRoomsPresence = () => {
    const seen = new Set<WebSocket>();

    for (const userSockets of socketsByUserId.values()) {
      for (const socket of userSockets) {
        if (seen.has(socket)) {
          continue;
        }
        seen.add(socket);
        const state = socketState.get(socket);
        const envelope = buildRoomsPresenceEnvelope(getAllRoomsPresence(state?.userId || null));
        sendJson(socket, envelope);
      }
    }
  };

  const getUserRoomSockets = (userId: string, roomId: string) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return [];
    }

    const result = [];
    for (const socket of userSockets) {
      const state = socketState.get(socket);
      if (!state) {
        continue;
      }
      if (state.roomId === roomId) {
        result.push(socket);
      }
    }

    return result;
  };

  function resolveRoomMediaTopology(roomSlug: string, userId: string | null = null): MediaTopology {
    const normalizedUserId = String(userId || "").trim().toLowerCase();
    if (normalizedUserId && config.rtcMediaTopologySfuUsers.includes(normalizedUserId)) {
      return "sfu";
    }

    const normalizedSlug = String(roomSlug || "").trim().toLowerCase();
    if (!normalizedSlug) {
      return config.rtcMediaTopologyDefault;
    }

    return config.rtcMediaTopologySfuRooms.includes(normalizedSlug)
      ? "sfu"
      : config.rtcMediaTopologyDefault;
  }

  const evictUserFromOtherNonTextChannels = (userId: string, keepSocket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }

    let didChange = false;

    for (const socket of userSockets) {
      if (socket === keepSocket) {
        continue;
      }

      const state = socketState.get(socket);
      if (!state || !state.roomId || !state.roomSlug || !state.roomKind || state.roomKind === "text") {
        continue;
      }

      const previousRoomId = state.roomId;
      const previousRoomSlug = state.roomSlug;

      detachRoomSocket(previousRoomId, socket);
      clearCanonicalMediaState(previousRoomId, state.userId);
      state.roomId = null;
      state.roomSlug = null;
      state.roomKind = null;

      sendJson(socket, buildRoomLeftEnvelope(previousRoomId, previousRoomSlug));
      sendJson(
        socket,
        buildErrorEnvelope(
          "ChannelSessionMoved",
          "You were disconnected from this channel because your account joined another channel elsewhere",
          "topology"
        )
      );

      broadcastRoom(
        previousRoomId,
        buildPresenceLeftEnvelope(
          state.userId,
          state.userName,
          previousRoomSlug,
          getRoomPresence(previousRoomId).length
        ),
        socket
      );

      didChange = true;
    }

    if (didChange) {
      broadcastAllRoomsPresence();
    }
  };

  const canJoinRoom = async (roomSlug: string, userId: string): Promise<CanJoinRoomResult> => {
    const room = await db.query<RoomRow>(
      "SELECT id, slug, title, kind, is_public FROM rooms WHERE slug = $1 AND is_archived = FALSE",
      [roomSlug]
    );

    if (room.rowCount === 0) {
      return { ok: false, reason: "RoomNotFound" };
    }

    const selectedRoom = room.rows[0];

    if (!selectedRoom.is_public) {
      const membership = await db.query(
        "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2",
        [selectedRoom.id, userId]
      );

      if (membership.rowCount === 0) {
        return { ok: false, reason: "Forbidden" };
      }
    }

    await db.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [selectedRoom.id, userId]
    );

    return {
      ok: true,
      room: selectedRoom
    };
  };

  const relayToTargetOrRoom = (
    senderSocket: WebSocket,
    roomId: string,
    targetUserId: string | null,
    relayEnvelope: unknown
  ): RelayOutcome => {
    let relayedCount = 0;

    if (targetUserId) {
      const targetSockets = getUserRoomSockets(targetUserId, roomId);
      for (const targetSocket of targetSockets) {
        if (targetSocket === senderSocket) {
          continue;
        }

        sendJson(targetSocket, relayEnvelope);
        relayedCount += 1;
      }

      if (relayedCount === 0) {
        return { ok: false, relayedCount };
      }

      return { ok: true, relayedCount };
    }

    const roomSockets = socketsByRoomId.get(roomId) || new Set();
    for (const roomSocket of roomSockets) {
      if (roomSocket === senderSocket) {
        continue;
      }

      sendJson(roomSocket, relayEnvelope);
      relayedCount += 1;
    }

    return { ok: true, relayedCount };
  };

  const sendNoActiveRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(socket, requestId, eventType, "NoActiveRoom", "Join a room first");
    void incrementMetric("nack_sent");
  };

  const sendTargetNotInRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "TargetNotInRoom",
      "Target user is offline or not in this room"
    );
    void incrementMetric("nack_sent");
  };

  const sendValidationNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string
  ) => {
    sendNack(socket, requestId, eventType, "ValidationError", message);
    void incrementMetric("nack_sent");
  };

  const sendInvalidEnvelopeError = (socket: WebSocket) => {
    sendJson(socket, buildErrorEnvelope("ValidationError", "Invalid ws envelope", "transport"));
    void incrementMetric("nack_sent");
  };

  const sendUnknownEventNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(socket, requestId, eventType, "UnknownEvent", "Unsupported event type");
    void incrementMetric("nack_sent");
  };

  const sendJoinDeniedNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    reason: "RoomNotFound" | "Forbidden"
  ) => {
    sendNack(socket, requestId, eventType, reason, "Cannot join room");
    void incrementMetric("nack_sent");
  };

  const sendForbiddenNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message = "Insufficient permissions"
  ) => {
    sendNack(socket, requestId, eventType, "Forbidden", message);
    void incrementMetric("nack_sent");
  };

  const isUserModerator = async (userId: string) => {
    const result = await db.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [userId]);
    const role = String(result.rows[0]?.role || "").trim();
    return role === "admin" || role === "super_admin";
  };

  const sendAckWithMetrics = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {},
    additionalMetrics: string[] = []
  ) => {
    sendAck(socket, requestId, eventType, meta);
    void incrementMetric("ack_sent");
    for (const metricName of additionalMetrics) {
      void incrementMetric(metricName);
    }
  };

  const buildCallTraceId = (
    eventType: string,
    requestId: string | null,
    sessionId: string
  ): string => {
    if (requestId) {
      return `${eventType}:${sessionId}:${requestId}`;
    }

    return `${eventType}:${sessionId}:${Date.now()}`;
  };

  const checkAndMarkCallSignalIdempotency = async (args: {
    userId: string;
    eventType: "call.offer" | "call.answer" | "call.ice";
    requestId: string | null;
    targetUserId: string;
    connection: WebSocket;
  }): Promise<boolean> => {
    const { userId, eventType, requestId, targetUserId, connection } = args;
    if (!requestId) {
      return false;
    }

    const key = `ws:call-idempotency:${userId}:${eventType}:${requestId}`;

    try {
      const created = await fastify.redis.set(key, "1", { NX: true, EX: CALL_SIGNAL_IDEMPOTENCY_TTL_SEC });
      if (created !== null) {
        return false;
      }

      sendAckWithMetrics(
        connection,
        requestId,
        eventType,
        {
          duplicate: true,
          targetUserId
        },
        ["call_signal_idempotency_hit"]
      );
      return true;
    } catch {
      // Do not block signaling flow when Redis dedupe is temporarily unavailable.
      return false;
    }
  };

  const callSignalHandler = new RealtimeCallSignalHandler({
    callSignalMinBytes: CALL_SIGNAL_MIN_BYTES,
    callSdpSignalMaxBytes: CALL_SDP_SIGNAL_MAX_BYTES,
    callIceSignalMaxBytes: CALL_ICE_SIGNAL_MAX_BYTES,
    callGlareWindowMs: CALL_GLARE_WINDOW_MS,
    normalizeRequestId,
    safeJsonSize,
    extractIceCandidateMeta,
    extractSdpMeta,
    isCallOfferRateLimited,
    relayToTargetOrRoom,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendTargetNotInRoomNack,
    sendNack,
    sendAckWithMetrics,
    incrementMetric,
    logCallDebug,
    buildCallTraceId,
    checkAndMarkCallSignalIdempotency
  });

  fastify.get(
    "/v1/realtime/ws",
    {
      websocket: true
    },
    async (connection: WebSocket, request: FastifyRequest) => {
      try {
        const url = new URL(request.url, "http://localhost");
        const ticket = url.searchParams.get("ticket");

        if (!ticket) {
          sendJson(connection, buildErrorEnvelope("MissingTicket", "ticket query param is required", "auth"));
          connection.close(4001, "Missing ticket");
          return;
        }

        const ticketKey = `ws:ticket:${ticket}`;
        const ticketPayload = await fastify.redis.get(ticketKey);

        if (!ticketPayload) {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "WebSocket ticket is invalid or expired", "auth"));
          connection.close(4002, "Invalid ticket");
          return;
        }

        await fastify.redis.del(ticketKey);

        let claims: WsTicketClaims;
        try {
          claims = JSON.parse(ticketPayload);
        } catch {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket payload is corrupted", "auth"));
          connection.close(4003, "Invalid ticket");
          return;
        }

        const userId = claims.userId;

        if (!userId) {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket subject is missing", "auth"));
          connection.close(4004, "Invalid ticket");
          return;
        }

        const userName = claims.userName || claims.name || claims.email || "unknown";

        socketState.set(connection, {
          sessionId: crypto.randomUUID(),
          userId,
          userName,
          roomId: null,
          roomSlug: null,
          roomKind: null
        });

        attachUserSocket(userId, connection);
        registerRealtimeSocket(connection);

        await fastify.redis.hSet(`presence:user:${userId}`, {
          online: "1",
          updatedAt: new Date().toISOString()
        });
        await fastify.redis.expire(`presence:user:${userId}`, 120);

        sendJson(connection, buildServerReadyEnvelope(userId, userName));
        sendJson(connection, buildRoomsPresenceEnvelope(getAllRoomsPresence(userId)));

        connection.on("message", async (raw: RawData) => {
          try {
            const message = parseWsIncomingEnvelope(raw);
            if (!message) {
              sendInvalidEnvelopeError(connection);
              return;
            }

            const state = socketState.get(connection);
            const requestId = normalizeRequestId(message.requestId);
            const eventType = message.type;
            const payload = message.payload;
            const knownMessage = asKnownWsIncomingEnvelope(message);

            if (!state) {
              return;
            }

            if (!knownMessage) {
              sendUnknownEventNack(connection, requestId, eventType);
              return;
            }

            switch (knownMessage.type) {
              case "ping": {
                sendJson(connection, buildPongEnvelope());
                sendAckWithMetrics(connection, requestId, eventType);
                return;
              }

              case "room.join": {
                const roomSlug = getPayloadString(payload, "roomSlug", 80);

                if (!roomSlug) {
                  sendValidationNack(connection, requestId, eventType, "roomSlug is required");
                  return;
                }

                const joinResult = await canJoinRoom(roomSlug, state.userId);

                if (!joinResult.ok) {
                  sendJoinDeniedNack(connection, requestId, eventType, joinResult.reason);
                  return;
                }

                if (state.roomId) {
                  markRecentRoomDetach(state.roomId, state.userId);
                  detachRoomSocket(state.roomId, connection);
                  clearCanonicalMediaState(state.roomId, state.userId);
                  broadcastRoom(
                    state.roomId,
                    buildPresenceLeftEnvelope(state.userId, state.userName, state.roomSlug, 0),
                    connection
                  );
                  broadcastAllRoomsPresence();
                }

                if (joinResult.room.kind !== "text") {
                  evictUserFromOtherNonTextChannels(state.userId, connection);
                }

                state.roomId = joinResult.room.id;
                state.roomSlug = joinResult.room.slug;
                state.roomKind = joinResult.room.kind;
                attachRoomSocket(joinResult.room.id, connection);

                if (consumeRecentReconnectMark(joinResult.room.id, state.userId)) {
                  void incrementMetric("call_reconnect_joined");
                }

                sendJson(
                  connection,
                  buildRoomJoinedEnvelope(
                    joinResult.room.id,
                    joinResult.room.slug,
                    joinResult.room.title,
                    resolveRoomMediaTopology(joinResult.room.slug, state.userId)
                  )
                );

                sendAckWithMetrics(
                  connection,
                  requestId,
                  eventType,
                  {
                    roomId: joinResult.room.id,
                    roomSlug: joinResult.room.slug
                  }
                );

                sendJson(
                  connection,
                  buildRoomPresenceEnvelope(
                    joinResult.room.id,
                    joinResult.room.slug,
                    getRoomPresence(joinResult.room.id),
                    resolveRoomMediaTopology(joinResult.room.slug, state.userId)
                  )
                );

                if (config.rtcFeatureInitialStateReplay) {
                  const initialStateParticipants = getCallInitialStateParticipants(joinResult.room.id);
                  const initialStateLagStats = getCallInitialStateLagStats(joinResult.room.id);
                  sendJson(
                    connection,
                    buildCallInitialStateEnvelope(
                      joinResult.room.id,
                      joinResult.room.slug,
                      initialStateParticipants
                    )
                  );
                  void incrementMetric("call_initial_state_sent");
                  void incrementMetricBy("call_initial_state_participants_total", initialStateParticipants.length);
                  void incrementMetricBy("call_initial_state_lag_ms_total", initialStateLagStats.totalLagMs);
                  void incrementMetricBy("call_initial_state_lag_samples", initialStateLagStats.count);
                }

                broadcastRoom(
                  joinResult.room.id,
                  buildPresenceJoinedEnvelope(
                    state.userId,
                    state.userName,
                    joinResult.room.slug,
                    getRoomPresence(joinResult.room.id).length
                  ),
                  connection
                );

                broadcastAllRoomsPresence();

                return;
              }

              case "room.leave": {
                if (!state.roomId || !state.roomSlug) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const previousRoomId = state.roomId;
                const previousRoomSlug = state.roomSlug;

                markRecentRoomDetach(previousRoomId, state.userId);
                detachRoomSocket(previousRoomId, connection);
                clearCanonicalMediaState(previousRoomId, state.userId);
                state.roomId = null;
                state.roomSlug = null;
                state.roomKind = null;

                sendJson(connection, buildRoomLeftEnvelope(previousRoomId, previousRoomSlug));
                sendAckWithMetrics(connection, requestId, eventType, {
                  roomId: previousRoomId,
                  roomSlug: previousRoomSlug
                });

                broadcastRoom(
                  previousRoomId,
                  buildPresenceLeftEnvelope(
                    state.userId,
                    state.userName,
                    previousRoomSlug,
                    getRoomPresence(previousRoomId).length
                  ),
                  connection
                );

                broadcastAllRoomsPresence();

                return;
              }

              case "room.kick": {
                const roomSlug = getPayloadString(payload, "roomSlug", 80);
                const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128));

                if (!roomSlug || !targetUserId) {
                  sendValidationNack(connection, requestId, eventType, "roomSlug and targetUserId are required");
                  return;
                }

                if (targetUserId === state.userId) {
                  sendValidationNack(connection, requestId, eventType, "Cannot kick yourself");
                  return;
                }

                const canModerate = await isUserModerator(state.userId);
                if (!canModerate) {
                  sendForbiddenNack(connection, requestId, eventType);
                  return;
                }

                const roomResult = await db.query<RoomRow>(
                  "SELECT id, slug, title, kind, is_public FROM rooms WHERE slug = $1 AND is_archived = FALSE",
                  [roomSlug]
                );

                if (roomResult.rowCount === 0) {
                  sendNack(connection, requestId, eventType, "RoomNotFound", "Cannot find room to moderate");
                  void incrementMetric("nack_sent");
                  return;
                }

                const targetRoom = roomResult.rows[0];
                const targetSockets = getUserRoomSockets(targetUserId, targetRoom.id);
                if (targetSockets.length === 0) {
                  sendTargetNotInRoomNack(connection, requestId, eventType);
                  return;
                }

                let kickedUserName = "unknown";
                for (const targetSocket of targetSockets) {
                  const targetState = socketState.get(targetSocket);
                  if (!targetState || targetState.roomId !== targetRoom.id || targetState.roomSlug !== targetRoom.slug) {
                    continue;
                  }

                  kickedUserName = targetState.userName || kickedUserName;
                  markRecentRoomDetach(targetRoom.id, targetUserId);
                  detachRoomSocket(targetRoom.id, targetSocket);
                  clearCanonicalMediaState(targetRoom.id, targetUserId);
                  targetState.roomId = null;
                  targetState.roomSlug = null;
                  targetState.roomKind = null;

                  sendJson(targetSocket, buildRoomLeftEnvelope(targetRoom.id, targetRoom.slug));
                  sendJson(
                    targetSocket,
                    buildErrorEnvelope(
                      "ChannelKicked",
                      `You were removed from #${targetRoom.slug} by a moderator`,
                      "permissions"
                    )
                  );
                }

                broadcastRoom(
                  targetRoom.id,
                  buildPresenceLeftEnvelope(
                    targetUserId,
                    kickedUserName,
                    targetRoom.slug,
                    getRoomPresence(targetRoom.id).length
                  )
                );
                broadcastAllRoomsPresence();

                sendAckWithMetrics(connection, requestId, eventType, {
                  roomSlug: targetRoom.slug,
                  kickedUserId: targetUserId
                });
                return;
              }

              case "chat.send": {
                if (!state.roomId) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const text = getPayloadString(payload, "text", 20000);

                if (!text) {
                  sendValidationNack(connection, requestId, eventType, "Message text is required");
                  return;
                }

                const idempotencyKey = normalizeRequestId(knownMessage.idempotencyKey) || requestId;

                if (idempotencyKey) {
                  const idemRedisKey = `ws:idempotency:${state.userId}:${idempotencyKey}`;
                  const cachedPayloadRaw = await fastify.redis.get(idemRedisKey);

                  if (cachedPayloadRaw) {
                    try {
                      const cachedPayload = JSON.parse(cachedPayloadRaw);
                      sendJson(connection, buildChatMessageEnvelope(cachedPayload));
                    } catch {
                      await fastify.redis.del(idemRedisKey);
                    }

                    sendAckWithMetrics(
                      connection,
                      requestId,
                      eventType,
                      {
                        duplicate: true,
                        idempotencyKey
                      },
                      ["chat_idempotency_hit"]
                    );
                    return;
                  }
                }

                const inserted = await db.query<InsertedMessageRow>(
                  `INSERT INTO messages (room_id, user_id, body)
                   VALUES ($1, $2, $3)
                   RETURNING id, room_id, user_id, body, created_at`,
                  [state.roomId, state.userId, text]
                );

                const chatMessage = inserted.rows[0];

                const chatPayload = {
                  id: chatMessage.id,
                  roomId: chatMessage.room_id,
                  roomSlug: state.roomSlug,
                  userId: chatMessage.user_id,
                  userName: state.userName,
                  text: chatMessage.body,
                  createdAt: chatMessage.created_at,
                  senderRequestId: requestId || null
                };

                if (idempotencyKey) {
                  await fastify.redis.setEx(
                    `ws:idempotency:${state.userId}:${idempotencyKey}`,
                    120,
                    JSON.stringify(chatPayload)
                  );
                }

                broadcastRoom(state.roomId, buildChatMessageEnvelope(chatPayload));

                sendAckWithMetrics(
                  connection,
                  requestId,
                  eventType,
                  {
                    messageId: chatMessage.id,
                    idempotencyKey: idempotencyKey || null
                  },
                  ["chat_sent"]
                );

                return;
              }

              case "chat.edit": {
                if (!state.roomId) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
                const text = getPayloadString(payload, "text", 20000);
                if (!messageId || !text) {
                  sendValidationNack(connection, requestId, eventType, "messageId and text are required");
                  return;
                }

                const existingMessage = await db.query<{
                  id: string;
                  room_id: string;
                  user_id: string;
                  created_at: string;
                }>(
                  `SELECT id, room_id, user_id, created_at
                   FROM messages
                   WHERE id = $1 AND room_id = $2
                   LIMIT 1`,
                  [messageId, state.roomId]
                );

                if ((existingMessage.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const messageRow = existingMessage.rows[0];
                if (messageRow.user_id !== state.userId) {
                  sendForbiddenNack(connection, requestId, eventType, "You can edit only your own messages");
                  return;
                }

                const createdAtTs = Number(new Date(messageRow.created_at));
                const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= 10 * 60 * 1000;
                if (!withinWindow) {
                  sendNack(connection, requestId, eventType, "EditWindowExpired", "Message edit window has expired");
                  void incrementMetric("nack_sent");
                  return;
                }

                const updated = await db.query<{
                  id: string;
                  room_id: string;
                  body: string;
                  updated_at: string;
                }>(
                  `UPDATE messages
                   SET body = $1, updated_at = NOW()
                   WHERE id = $2 AND room_id = $3
                   RETURNING id, room_id, body, updated_at`,
                  [text, messageId, state.roomId]
                );

                if ((updated.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const updatedMessage = updated.rows[0];
                broadcastRoom(
                  state.roomId,
                  buildChatEditedEnvelope({
                    id: updatedMessage.id,
                    roomId: updatedMessage.room_id,
                    roomSlug: state.roomSlug,
                    text: updatedMessage.body,
                    editedAt: updatedMessage.updated_at,
                    editedByUserId: state.userId
                  })
                );

                sendAckWithMetrics(connection, requestId, eventType, {
                  messageId: updatedMessage.id
                });
                return;
              }

              case "chat.delete": {
                if (!state.roomId) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
                if (!messageId) {
                  sendValidationNack(connection, requestId, eventType, "messageId is required");
                  return;
                }

                const existingMessage = await db.query<{
                  id: string;
                  room_id: string;
                  user_id: string;
                  created_at: string;
                }>(
                  `SELECT id, room_id, user_id, created_at
                   FROM messages
                   WHERE id = $1 AND room_id = $2
                   LIMIT 1`,
                  [messageId, state.roomId]
                );

                if ((existingMessage.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const messageRow = existingMessage.rows[0];
                if (messageRow.user_id !== state.userId) {
                  sendForbiddenNack(connection, requestId, eventType, "You can delete only your own messages");
                  return;
                }

                const createdAtTs = Number(new Date(messageRow.created_at));
                const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= 10 * 60 * 1000;
                if (!withinWindow) {
                  sendNack(connection, requestId, eventType, "DeleteWindowExpired", "Message delete window has expired");
                  void incrementMetric("nack_sent");
                  return;
                }

                const deleted = await db.query<{ id: string; room_id: string }>(
                  `DELETE FROM messages
                   WHERE id = $1 AND room_id = $2
                   RETURNING id, room_id`,
                  [messageId, state.roomId]
                );

                if ((deleted.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const deletedMessage = deleted.rows[0];
                broadcastRoom(
                  state.roomId,
                  buildChatDeletedEnvelope({
                    id: deletedMessage.id,
                    roomId: deletedMessage.room_id,
                    roomSlug: state.roomSlug,
                    deletedByUserId: state.userId,
                    ts: new Date().toISOString()
                  })
                );

                sendAckWithMetrics(connection, requestId, eventType, {
                  messageId: deletedMessage.id
                });
                return;
              }

              case "call.offer":
              case "call.answer":
              case "call.ice": {
                await callSignalHandler.handle({
                  eventType: knownMessage.type,
                  payload,
                  state,
                  requestId,
                  connection,
                  lastCallOfferByPair
                });
                return;
              }

              case "call.hangup":
              case "call.reject": {
              if (!state.roomId) {
                logCallDebug("call terminal rejected: no active room", {
                  eventType,
                  userId: state.userId,
                  requestId
                });
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              const reason = getPayloadString(payload, "reason", 128) || null;
              const traceId = buildCallTraceId(eventType, requestId, state.sessionId);
              logCallDebug("call terminal received", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                reason
              });
              const relayEnvelope = buildCallTerminalRelayEnvelope(
                knownMessage.type,
                requestId,
                state.sessionId,
                traceId,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                reason
              );

              const relayOutcome = relayToTargetOrRoom(connection, state.roomId, targetUserId, relayEnvelope);
              if (!relayOutcome.ok) {
                logCallDebug("call terminal relay failed: target not in room", {
                  eventType,
                  userId: state.userId,
                  sessionId: state.sessionId,
                  traceId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId,
                  targetUserId,
                  reason,
                  relayedTo: relayOutcome.relayedCount
                });
                sendTargetNotInRoomNack(connection, requestId, eventType);
                void incrementMetric("call_terminal_target_miss");
                return;
              }

              logCallDebug("call terminal relayed", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                reason,
                relayedTo: relayOutcome.relayedCount
              });

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId
                },
                [knownMessage.type === "call.hangup" ? "call_hangup_sent" : "call_reject_sent"]
              );
              return;
              }

              case "call.mic_state": {
              if (!state.roomId) {
                logCallDebug("call mic_state rejected: no active room", {
                  eventType,
                  userId: state.userId,
                  requestId
                });
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const mutedRaw = payload?.muted;
              if (typeof mutedRaw !== "boolean") {
                logCallDebug("call mic_state rejected: missing muted boolean", {
                  eventType,
                  userId: state.userId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId
                });
                sendValidationNack(connection, requestId, eventType, "payload.muted boolean is required");
                return;
              }
              const speakingRaw = payload?.speaking;
              const audioMutedRaw = payload?.audioMuted;
              const speaking = typeof speakingRaw === "boolean" ? speakingRaw : undefined;
              const audioMuted = typeof audioMutedRaw === "boolean" ? audioMutedRaw : undefined;
              const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

              setCanonicalMediaState(state.roomId, state.userId, {
                muted: mutedRaw,
                speaking: speaking ?? false,
                audioMuted: audioMuted ?? false
              });

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              logCallDebug("call mic_state received", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                muted: mutedRaw,
                speaking: speaking ?? null,
                audioMuted: audioMuted ?? null
              });
              const relayEnvelope = buildCallMicStateRelayEnvelope(
                knownMessage.type,
                requestId,
                state.sessionId,
                traceId,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                { muted: mutedRaw, speaking, audioMuted }
              );

              const relayOutcome = relayToTargetOrRoom(connection, state.roomId, targetUserId, relayEnvelope);
              if (!relayOutcome.ok) {
                logCallDebug("call mic_state relay failed: target not in room", {
                  eventType,
                  userId: state.userId,
                  sessionId: state.sessionId,
                  traceId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId,
                  targetUserId,
                  relayedTo: relayOutcome.relayedCount
                });
                sendTargetNotInRoomNack(connection, requestId, eventType);
                void incrementMetric("call_mic_state_target_miss");
                return;
              }

              logCallDebug("call mic_state relayed", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                relayedTo: relayOutcome.relayedCount,
                muted: mutedRaw,
                speaking: speaking ?? null,
                audioMuted: audioMuted ?? null
              });

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId,
                  muted: mutedRaw,
                  speaking: speaking ?? null,
                  audioMuted: audioMuted ?? null
                }
              );
              return;
              }

              case "call.video_state": {
              if (!state.roomId) {
                logCallDebug("call video_state rejected: no active room", {
                  eventType,
                  userId: state.userId,
                  requestId
                });
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const settingsRaw = payload?.settings;
              if (!settingsRaw || typeof settingsRaw !== "object" || Array.isArray(settingsRaw)) {
                logCallDebug("call video_state rejected: invalid settings payload", {
                  eventType,
                  userId: state.userId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId
                });
                sendValidationNack(connection, requestId, eventType, "payload.settings object is required");
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;

              const localVideoEnabledRaw = (settingsRaw as Record<string, unknown>).localVideoEnabled;
              if (typeof localVideoEnabledRaw === "boolean") {
                setCanonicalMediaState(state.roomId, state.userId, {
                  localVideoEnabled: localVideoEnabledRaw
                });
              }
              const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

              const relayEnvelope = buildCallVideoStateRelayEnvelope(
                knownMessage.type,
                requestId,
                state.sessionId,
                traceId,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                settingsRaw as Record<string, unknown>
              );

              const relayOutcome = relayToTargetOrRoom(connection, state.roomId, targetUserId, relayEnvelope);
              if (!relayOutcome.ok) {
                logCallDebug("call video_state relay failed: target not in room", {
                  eventType,
                  userId: state.userId,
                  sessionId: state.sessionId,
                  traceId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId,
                  targetUserId,
                  relayedTo: relayOutcome.relayedCount
                });
                sendTargetNotInRoomNack(connection, requestId, eventType);
                void incrementMetric("call_video_state_target_miss");
                return;
              }

              logCallDebug("call video_state relayed", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                relayedTo: relayOutcome.relayedCount
              });

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId
                }
              );
              return;
              }
            }
          } catch (error) {
            fastify.log.error(error, "ws message handling failed");
            sendJson(connection, buildErrorEnvelope("ServerError", "Failed to process event"));
          }
        });

        connection.on("close", async () => {
          const state = socketState.get(connection);
          unregisterRealtimeSocket(connection);
          if (!state) {
            return;
          }

          detachUserSocket(state.userId, connection);

          if (state.roomId) {
            markRecentRoomDetach(state.roomId, state.userId);
            detachRoomSocket(state.roomId, connection);
            clearCanonicalMediaState(state.roomId, state.userId);
            broadcastRoom(
              state.roomId,
              buildPresenceLeftEnvelope(
                state.userId,
                state.userName,
                state.roomSlug,
                getRoomPresence(state.roomId).length
              )
            );
            broadcastAllRoomsPresence();
          }

          const userSockets = socketsByUserId.get(state.userId);
          if (!userSockets || userSockets.size === 0) {
            await fastify.redis.hSet(`presence:user:${state.userId}`, {
              online: "0",
              updatedAt: new Date().toISOString()
            });
            await fastify.redis.expire(`presence:user:${state.userId}`, 120);
          }
        });
      } catch (error) {
        fastify.log.error(error, "ws connection failed");
        try {
          connection.close(1011, "Internal error");
        } catch {
          return;
        }
      }
    }
  );
}
