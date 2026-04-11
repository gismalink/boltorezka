import type { WebSocket } from "ws";
import type { SocketState } from "../ws-protocol.types.ts";

type BaseParams = {
  connection: WebSocket;
  state: SocketState;
  payload: any;
  requestId: string | null;
  eventType: string;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string, meta?: Record<string, unknown>) => void;
  sendValidationNack: (socket: WebSocket, requestId: string | null, eventType: string, message: string, meta?: Record<string, unknown>) => void;
  sendForbiddenNack: (socket: WebSocket, requestId: string | null, eventType: string, message?: string) => void;
  sendNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    code: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendTargetNotInRoomNack: (socket: WebSocket, requestId: string | null, eventType: string, meta?: Record<string, unknown>) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  incrementMetric: (name: string) => Promise<void>;
  logCallDebug: (message: string, meta?: Record<string, unknown>) => void;
  normalizeRequestId: (value: unknown) => string | null;
  getPayloadString: (payload: any, key: string, maxLength?: number) => string | null;
  setCanonicalMediaState: (roomId: string, userId: string, patch: Record<string, unknown>) => void;
  buildCallTraceId: (eventType: string, requestId: string | null, sessionId: string) => string;
  knownMessageType: string;
  buildCallMicStateRelayEnvelope: (...args: any[]) => unknown;
  buildCallVideoStateRelayEnvelope: (...args: any[]) => unknown;
  relayToTargetOrRoom: (params: {
    senderSocket: WebSocket;
    roomId: string;
    targetUserId: string | null;
    relayEnvelope: unknown;
    getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
    socketsByRoomId: Map<string, Set<WebSocket>>;
    sendJson: (socket: WebSocket, payload: unknown) => void;
  }) => { ok: boolean; relayedCount: number };
  getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
  socketsByRoomId: Map<string, Set<WebSocket>>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  screenShareOwnerByRoomId: Map<string, string>;
  buildScreenShareStateEnvelope: (roomId: string, roomSlug: string | null) => unknown;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
};

export function handleScreenShareStart(params: BaseParams): void {
  const {
    connection,
    state,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack,
    incrementMetric,
    screenShareOwnerByRoomId,
    buildScreenShareStateEnvelope,
    broadcastRoom,
    sendAckWithMetrics
  } = params;

  if (!state.roomId || !state.roomSlug) {
    sendNoActiveRoomNack(connection, requestId, eventType);
    return;
  }

  const currentOwnerUserId = screenShareOwnerByRoomId.get(state.roomId) || null;
  if (currentOwnerUserId && currentOwnerUserId !== state.userId) {
    sendNack(
      connection,
      requestId,
      eventType,
      "ScreenShareAlreadyActive",
      "Another user is already sharing the screen",
      {
        roomId: state.roomId,
        roomSlug: state.roomSlug,
        ownerUserId: currentOwnerUserId
      }
    );
    void incrementMetric("nack_sent");
    return;
  }

  screenShareOwnerByRoomId.set(state.roomId, state.userId);
  const envelope = buildScreenShareStateEnvelope(state.roomId, state.roomSlug);
  broadcastRoom(state.roomId, envelope);
  sendAckWithMetrics(connection, requestId, eventType, {
    roomId: state.roomId,
    roomSlug: state.roomSlug,
    ownerUserId: state.userId
  });
}

export function handleScreenShareStop(params: BaseParams): void {
  const {
    connection,
    state,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendForbiddenNack,
    screenShareOwnerByRoomId,
    broadcastRoom,
    buildScreenShareStateEnvelope,
    sendAckWithMetrics
  } = params;

  if (!state.roomId || !state.roomSlug) {
    sendNoActiveRoomNack(connection, requestId, eventType);
    return;
  }

  const currentOwnerUserId = screenShareOwnerByRoomId.get(state.roomId) || null;
  if (currentOwnerUserId && currentOwnerUserId !== state.userId) {
    sendForbiddenNack(connection, requestId, eventType, "Only current screen-share owner can stop it");
    return;
  }

  if (currentOwnerUserId === state.userId) {
    screenShareOwnerByRoomId.delete(state.roomId);
    broadcastRoom(state.roomId, buildScreenShareStateEnvelope(state.roomId, state.roomSlug));
  }

  sendAckWithMetrics(connection, requestId, eventType, {
    roomId: state.roomId,
    roomSlug: state.roomSlug,
    stopped: currentOwnerUserId === state.userId
  });
}

export function handleCallMicState(params: BaseParams): void {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendValidationNack,
    logCallDebug,
    setCanonicalMediaState,
    buildCallTraceId,
    normalizeRequestId,
    getPayloadString,
    knownMessageType,
    buildCallMicStateRelayEnvelope,
    relayToTargetOrRoom,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson,
    sendTargetNotInRoomNack,
    incrementMetric,
    sendAckWithMetrics
  } = params;

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
    knownMessageType,
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

  const relayOutcome = relayToTargetOrRoom({
    senderSocket: connection,
    roomId: state.roomId,
    targetUserId,
    relayEnvelope,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson
  });
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
}

export function handleCallVideoState(params: BaseParams): void {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendValidationNack,
    logCallDebug,
    normalizeRequestId,
    getPayloadString,
    setCanonicalMediaState,
    buildCallTraceId,
    knownMessageType,
    buildCallVideoStateRelayEnvelope,
    relayToTargetOrRoom,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson,
    sendTargetNotInRoomNack,
    incrementMetric,
    sendAckWithMetrics
  } = params;

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
    knownMessageType,
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

  const relayOutcome = relayToTargetOrRoom({
    senderSocket: connection,
    roomId: state.roomId,
    targetUserId,
    relayEnvelope,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson
  });
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
}
