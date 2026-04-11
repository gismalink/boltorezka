import type { WebSocket } from "ws";
import { config } from "../config.js";
import { db } from "../db.js";
import type {
  CallInitialStateParticipantPayload,
  MediaTopology,
  PresenceUser,
  SocketState,
  WsIncomingPayload
} from "../ws-protocol.types.ts";
import {
  buildCallInitialStateEnvelope,
  buildPresenceJoinedEnvelope,
  buildPresenceLeftEnvelope,
  buildRoomJoinedEnvelope,
  buildRoomLeftEnvelope,
  buildRoomPresenceEnvelope,
  getPayloadString
} from "../ws-protocol.js";
import { canJoinRoom } from "./realtime-room-join.js";

type RoomEventHandlerDeps = {
  sendJson: (socket: WebSocket, envelope: unknown) => void;
  sendValidationNack: (socket: WebSocket, requestId: string | null, eventType: string, details: string) => void;
  sendJoinDeniedNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    reason: "RoomNotFound" | "Forbidden" | "AgeVerificationRequired"
  ) => void;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  buildCallTraceId: (eventType: string, requestId: string | null, sessionId: string) => string;
  resolveRoomMediaTopology: (roomSlug: string, userId: string) => MediaTopology;
  consumeRecentReconnectMark: (roomId: string, userId: string) => boolean;
  markRecentRoomDetach: (roomId: string, userId: string) => void;
  attachRoomSocket: (roomId: string, socket: WebSocket) => void;
  detachRoomSocket: (roomId: string, socket: WebSocket) => void;
  clearCanonicalMediaState: (roomId: string, userId: string) => void;
  clearRoomScreenShareOwnerIfMatches: (roomId: string, userId: string, roomSlug: string) => void;
  broadcastRoom: (roomId: string, envelope: unknown, except?: WebSocket) => void;
  broadcastAllRoomsPresence: () => void;
  getRoomPresence: (roomId: string) => PresenceUser[];
  getCallInitialStateParticipants: (roomId: string) => CallInitialStateParticipantPayload[];
  getCallInitialStateLagStats: (roomId: string) => { totalLagMs: number; count: number };
  incrementMetric: (name: string) => Promise<void>;
  incrementMetricBy: (name: string, value: number) => Promise<void>;
  buildScreenShareStateEnvelope: (roomId: string, roomSlug: string) => unknown;
  evictUserFromOtherNonTextChannels: (userId: string, keepSocket: WebSocket) => void;
};

export function createRealtimeRoomEventHandlers(deps: RoomEventHandlerDeps) {
  const {
    sendJson,
    sendValidationNack,
    sendJoinDeniedNack,
    sendNoActiveRoomNack,
    sendAckWithMetrics,
    buildCallTraceId,
    resolveRoomMediaTopology,
    consumeRecentReconnectMark,
    markRecentRoomDetach,
    attachRoomSocket,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    broadcastRoom,
    broadcastAllRoomsPresence,
    getRoomPresence,
    getCallInitialStateParticipants,
    getCallInitialStateLagStats,
    incrementMetric,
    incrementMetricBy,
    buildScreenShareStateEnvelope,
    evictUserFromOtherNonTextChannels
  } = deps;

  const handleRoomJoinEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    const roomSlug = getPayloadString(payload, "roomSlug", 80);

    if (!roomSlug) {
      sendValidationNack(connection, requestId, eventType, "roomSlug is required");
      return;
    }

    const joinResult = await canJoinRoom(roomSlug, state.userId);
    const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

    if (!joinResult.ok) {
      sendJoinDeniedNack(connection, requestId, eventType, joinResult.reason);
      return;
    }

    if (state.roomId) {
      const previousRoomPresenceCount = getRoomPresence(state.roomId).length;
      markRecentRoomDetach(state.roomId, state.userId);
      detachRoomSocket(state.roomId, connection);
      clearCanonicalMediaState(state.roomId, state.userId);
      broadcastRoom(
        state.roomId,
        buildPresenceLeftEnvelope(
          state.userId,
          state.userName,
          state.roomSlug,
          Math.max(0, previousRoomPresenceCount - 1),
          {
            requestId,
            sessionId: state.sessionId,
            traceId
          }
        ),
        connection
      );
      broadcastAllRoomsPresence();
    }

    if (joinResult.room.kind !== "text") {
      evictUserFromOtherNonTextChannels(state.userId, connection);
    }

    const roomMediaTopology = resolveRoomMediaTopology(joinResult.room.slug, state.userId);
    const reconnected = consumeRecentReconnectMark(joinResult.room.id, state.userId);
    state.roomId = joinResult.room.id;
    state.roomSlug = joinResult.room.slug;
    state.roomKind = joinResult.room.kind;
    attachRoomSocket(joinResult.room.id, connection);

    if (reconnected) {
      void incrementMetric("call_reconnect_joined");
    }

    sendJson(
      connection,
      buildRoomJoinedEnvelope(
        joinResult.room.id,
        joinResult.room.slug,
        joinResult.room.title,
        roomMediaTopology,
        {
          requestId,
          sessionId: state.sessionId,
          traceId
        },
        reconnected
      )
    );

    sendAckWithMetrics(
      connection,
      requestId,
      eventType,
      {
        roomId: joinResult.room.id,
        roomSlug: joinResult.room.slug,
        mediaTopology: roomMediaTopology,
        sessionId: state.sessionId,
        traceId,
        reconnect: reconnected
      }
    );

    sendJson(connection, buildScreenShareStateEnvelope(joinResult.room.id, joinResult.room.slug));

    sendJson(
      connection,
      buildRoomPresenceEnvelope(
        joinResult.room.id,
        joinResult.room.slug,
        getRoomPresence(joinResult.room.id),
        roomMediaTopology,
        {
          requestId,
          sessionId: state.sessionId,
          traceId
        }
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
        getRoomPresence(joinResult.room.id).length,
        {
          requestId,
          sessionId: state.sessionId,
          traceId
        }
      ),
      connection
    );

    broadcastAllRoomsPresence();
  };

  const handleRoomLeaveEvent = (
    connection: WebSocket,
    state: SocketState,
    requestId: string | null,
    eventType: string
  ) => {
    if (!state.roomId || !state.roomSlug) {
      sendNoActiveRoomNack(connection, requestId, eventType);
      return;
    }

    const traceId = buildCallTraceId(eventType, requestId, state.sessionId);
    const previousRoomId = state.roomId;
    const previousRoomSlug = state.roomSlug;

    markRecentRoomDetach(previousRoomId, state.userId);
    detachRoomSocket(previousRoomId, connection);
    clearCanonicalMediaState(previousRoomId, state.userId);
    clearRoomScreenShareOwnerIfMatches(previousRoomId, state.userId, previousRoomSlug);
    state.roomId = null;
    state.roomSlug = null;
    state.roomKind = null;

    // Hidden-room forced moves use temporary membership so the room disappears again after leave.
    void db.query(
      `DELETE FROM room_members rm
       USING rooms r
       WHERE rm.room_id = $1
         AND rm.user_id = $2
         AND rm.role = 'member'
         AND r.id = rm.room_id
         AND r.is_hidden = TRUE
         AND NOT EXISTS (
           SELECT 1
           FROM room_visibility_grants rvg
           WHERE rvg.room_id = rm.room_id
             AND rvg.user_id = rm.user_id
         )`,
      [previousRoomId, state.userId]
    ).catch(() => {
      // Best effort cleanup; leave flow must not fail on this.
    });

    sendJson(
      connection,
      buildRoomLeftEnvelope(previousRoomId, previousRoomSlug, {
        requestId,
        sessionId: state.sessionId,
        traceId
      })
    );

    sendAckWithMetrics(connection, requestId, eventType, {
      roomId: previousRoomId,
      roomSlug: previousRoomSlug,
      sessionId: state.sessionId,
      traceId
    });

    broadcastRoom(
      previousRoomId,
      buildPresenceLeftEnvelope(
        state.userId,
        state.userName,
        previousRoomSlug,
        getRoomPresence(previousRoomId).length,
        {
          requestId,
          sessionId: state.sessionId,
          traceId
        }
      ),
      connection
    );

    broadcastAllRoomsPresence();
  };

  return {
    handleRoomJoinEvent,
    handleRoomLeaveEvent
  };
}
