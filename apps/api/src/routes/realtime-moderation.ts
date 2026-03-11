import type { WebSocket } from "ws";
import type { RoomRow } from "../db.types.ts";

type SocketState = {
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type ModerationSharedParams = {
  connection: WebSocket;
  state: SocketState;
  payload: unknown;
  requestId: string | null;
  eventType: string;
  normalizeRequestId: (value: unknown) => string | null;
  getPayloadString: (payload: any, key: string, maxLength?: number) => string | null;
  isUserModerator: (userId: string) => Promise<boolean>;
  sendValidationNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string
  ) => void;
  sendForbiddenNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message?: string
  ) => void;
  sendNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    code: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendTargetNotInRoomNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>
  ) => void;
  incrementMetric: (name: string) => Promise<void>;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  dbQuery: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: T[] }>;
  getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
  socketState: WeakMap<WebSocket, SocketState>;
  markRecentRoomDetach: (roomId: string, userId: string) => void;
  detachRoomSocket: (roomId: string, socket: WebSocket) => void;
  clearCanonicalMediaState: (roomId: string, userId: string) => void;
  clearRoomScreenShareOwnerIfMatches: (roomId: string, userId: string, roomSlug: string | null) => void;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  buildRoomLeftEnvelope: (...args: any[]) => unknown;
  buildErrorEnvelope: (code: string, message: string, category: "auth" | "permissions" | "topology" | "transport") => unknown;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
  buildPresenceLeftEnvelope: (...args: any[]) => unknown;
  buildPresenceJoinedEnvelope: (...args: any[]) => unknown;
  getRoomPresence: (roomId: string) => Array<{ userId: string; userName: string }>;
  broadcastAllRoomsPresence: () => void;
  resolveRoomMediaTopology: (roomSlug: string, userId: string | null) => "livekit";
  getCallInitialStateParticipants: (roomId: string) => Array<{
    userId: string;
    userName: string;
    mic: { muted: boolean; speaking: boolean; audioMuted: boolean };
    video: { localVideoEnabled: boolean };
  }>;
  rtcFeatureInitialStateReplay: boolean;
  incrementMetricBy: (name: string, value: number) => Promise<void>;
  attachRoomSocket: (roomId: string, socket: WebSocket) => void;
  buildRoomJoinedEnvelope: (...args: any[]) => unknown;
  buildRoomPresenceEnvelope: (...args: any[]) => unknown;
  buildScreenShareStateEnvelope: (...args: any[]) => unknown;
  buildCallInitialStateEnvelope: (...args: any[]) => unknown;
};

export async function handleRoomKick(params: ModerationSharedParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendValidationNack,
    isUserModerator,
    sendForbiddenNack,
    dbQuery,
    sendNack,
    incrementMetric,
    getUserRoomSockets,
    sendTargetNotInRoomNack,
    socketState,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    sendJson,
    buildRoomLeftEnvelope,
    buildErrorEnvelope,
    broadcastRoom,
    buildPresenceLeftEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence,
    sendAckWithMetrics
  } = params;

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

  const roomResult = await dbQuery<RoomRow>(
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
    clearRoomScreenShareOwnerIfMatches(targetRoom.id, targetUserId, targetRoom.slug);
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
}

export async function handleRoomMoveMember(params: ModerationSharedParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendValidationNack,
    isUserModerator,
    sendForbiddenNack,
    dbQuery,
    sendNack,
    incrementMetric,
    getUserRoomSockets,
    sendTargetNotInRoomNack,
    socketState,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    sendJson,
    buildRoomLeftEnvelope,
    broadcastRoom,
    buildPresenceLeftEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence,
    sendAckWithMetrics,
    resolveRoomMediaTopology,
    getCallInitialStateParticipants,
    rtcFeatureInitialStateReplay,
    incrementMetricBy,
    attachRoomSocket,
    buildRoomJoinedEnvelope,
    buildRoomPresenceEnvelope,
    buildScreenShareStateEnvelope,
    buildCallInitialStateEnvelope,
    buildPresenceJoinedEnvelope
  } = params;

  const fromRoomSlug = getPayloadString(payload, "fromRoomSlug", 80);
  const toRoomSlug = getPayloadString(payload, "toRoomSlug", 80);
  const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128));

  if (!fromRoomSlug || !toRoomSlug || !targetUserId) {
    sendValidationNack(connection, requestId, eventType, "fromRoomSlug, toRoomSlug and targetUserId are required");
    return;
  }

  if (fromRoomSlug === toRoomSlug) {
    sendValidationNack(connection, requestId, eventType, "fromRoomSlug and toRoomSlug must be different");
    return;
  }

  const canModerate = await isUserModerator(state.userId);
  if (!canModerate) {
    sendForbiddenNack(connection, requestId, eventType);
    return;
  }

  const roomsResult = await dbQuery<RoomRow>(
    `SELECT id, slug, title, kind, is_public
     FROM rooms
     WHERE slug IN ($1, $2) AND is_archived = FALSE`,
    [fromRoomSlug, toRoomSlug]
  );

  const fromRoom = roomsResult.rows.find((row) => row.slug === fromRoomSlug) || null;
  const toRoom = roomsResult.rows.find((row) => row.slug === toRoomSlug) || null;

  if (!fromRoom || !toRoom) {
    sendNack(connection, requestId, eventType, "RoomNotFound", "Cannot find source or target room");
    void incrementMetric("nack_sent");
    return;
  }

  const targetSockets = getUserRoomSockets(targetUserId, fromRoom.id);
  if (targetSockets.length === 0) {
    sendTargetNotInRoomNack(connection, requestId, eventType, {
      fromRoomSlug,
      targetUserId
    });
    return;
  }

  await dbQuery(
    `INSERT INTO room_members (room_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [toRoom.id, targetUserId]
  );

  const roomMediaTopology = resolveRoomMediaTopology(toRoom.slug, targetUserId);
  const initialStateParticipants = getCallInitialStateParticipants(toRoom.id);
  let movedUserName = "unknown";

  for (const targetSocket of targetSockets) {
    const targetState = socketState.get(targetSocket);
    if (!targetState || targetState.roomId !== fromRoom.id || targetState.roomSlug !== fromRoom.slug) {
      continue;
    }

    movedUserName = targetState.userName || movedUserName;

    markRecentRoomDetach(fromRoom.id, targetUserId);
    detachRoomSocket(fromRoom.id, targetSocket);
    clearCanonicalMediaState(fromRoom.id, targetUserId);
    clearRoomScreenShareOwnerIfMatches(fromRoom.id, targetUserId, fromRoom.slug);

    targetState.roomId = toRoom.id;
    targetState.roomSlug = toRoom.slug;
    targetState.roomKind = toRoom.kind;
    attachRoomSocket(toRoom.id, targetSocket);

    sendJson(targetSocket, buildRoomLeftEnvelope(fromRoom.id, fromRoom.slug));
    sendJson(targetSocket, buildRoomJoinedEnvelope(toRoom.id, toRoom.slug, toRoom.title, roomMediaTopology));
    sendJson(targetSocket, buildRoomPresenceEnvelope(toRoom.id, toRoom.slug, getRoomPresence(toRoom.id), roomMediaTopology));
    sendJson(targetSocket, buildScreenShareStateEnvelope(toRoom.id, toRoom.slug));

    if (rtcFeatureInitialStateReplay) {
      sendJson(targetSocket, buildCallInitialStateEnvelope(toRoom.id, toRoom.slug, initialStateParticipants));
      void incrementMetric("call_initial_state_sent");
      void incrementMetricBy("call_initial_state_participants_total", initialStateParticipants.length);
    }
  }

  broadcastRoom(
    fromRoom.id,
    buildPresenceLeftEnvelope(
      targetUserId,
      movedUserName,
      fromRoom.slug,
      getRoomPresence(fromRoom.id).length
    )
  );

  broadcastRoom(
    toRoom.id,
    buildPresenceJoinedEnvelope(
      targetUserId,
      movedUserName,
      toRoom.slug,
      getRoomPresence(toRoom.id).length
    )
  );

  broadcastAllRoomsPresence();

  sendAckWithMetrics(connection, requestId, eventType, {
    targetUserId,
    fromRoomSlug: fromRoom.slug,
    toRoomSlug: toRoom.slug
  });
}
