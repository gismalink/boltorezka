import type { WebSocket } from "ws";
import { buildCallSignalRelayEnvelope, getCallSignal, getPayloadString } from "../ws-protocol.js";

export type RealtimeCallSignalEventType = "call.offer" | "call.answer" | "call.ice";

export type RealtimeSocketStateLike = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type RelayOutcome = {
  ok: boolean;
  relayedCount: number;
};

export type RealtimeCallSignalHandlerDeps = {
  callSignalMinBytes: number;
  callSdpSignalMaxBytes: number;
  callIceSignalMaxBytes: number;
  callGlareWindowMs: number;
  normalizeRequestId: (value: unknown) => string | null;
  safeJsonSize: (value: unknown) => number;
  extractIceCandidateMeta: (signal: unknown) => Record<string, unknown> | null;
  extractSdpMeta: (signal: unknown) => Record<string, unknown> | null;
  isCallOfferRateLimited: (fromUserId: string, targetUserId: string) => boolean;
  relayToTargetOrRoom: (
    senderSocket: WebSocket,
    roomId: string,
    targetUserId: string | null,
    relayEnvelope: unknown
  ) => RelayOutcome;
  sendNoActiveRoomNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>
  ) => void;
  sendValidationNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendTargetNotInRoomNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>
  ) => void;
  sendNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    code: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  incrementMetric: (name: string) => Promise<void>;
  logCallDebug: (message: string, meta?: Record<string, unknown>) => void;
  buildCallTraceId: (eventType: string, requestId: string | null, sessionId: string) => string;
  checkAndMarkCallSignalIdempotency: (args: {
    userId: string;
    eventType: RealtimeCallSignalEventType;
    requestId: string | null;
    targetUserId: string;
    connection: WebSocket;
  }) => Promise<boolean>;
};

/**
 * Handles call.signal contract checks, dedupe, metrics and relay logic.
 */
export class RealtimeCallSignalHandler {
  constructor(private readonly deps: RealtimeCallSignalHandlerDeps) {}

  private resolveRequiredTargetUserId(args: {
    payload: Record<string, unknown> | undefined;
    connection: WebSocket;
    requestId: string | null;
    eventType: RealtimeCallSignalEventType;
    state: RealtimeSocketStateLike;
    traceId: string;
  }): string | null {
    const { payload, connection, requestId, eventType, state, traceId } = args;
    const targetUserId = this.deps.normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
    if (targetUserId) {
      return targetUserId;
    }

    this.deps.logCallDebug("call signal rejected: missing targetUserId", {
      eventType,
      userId: state.userId,
      roomId: state.roomId,
      roomSlug: state.roomSlug,
      requestId
    });
    this.deps.sendValidationNack(connection, requestId, eventType, "payload.targetUserId is required", {
      traceId,
      roomId: state.roomId,
      userId: state.userId,
      sessionId: state.sessionId
    });
    void this.deps.incrementMetric("call_signal_missing_target");
    return null;
  }

  async handle(args: {
    eventType: RealtimeCallSignalEventType;
    payload: Record<string, unknown> | undefined;
    state: RealtimeSocketStateLike;
    requestId: string | null;
    connection: WebSocket;
    lastCallOfferByPair: Map<string, number>;
  }): Promise<void> {
    const {
      eventType,
      payload,
      state,
      requestId,
      connection,
      lastCallOfferByPair
    } = args;

    const traceId = this.deps.buildCallTraceId(eventType, requestId, state.sessionId);

    if (!state.roomId) {
      this.deps.logCallDebug("call signal rejected: no active room", {
        eventType,
        userId: state.userId,
        requestId
      });
      this.deps.sendNoActiveRoomNack(connection, requestId, eventType, {
        traceId,
        roomId: state.roomId,
        userId: state.userId,
        sessionId: state.sessionId
      });
      return;
    }

    const signal = getCallSignal(payload);
    if (!signal) {
      this.deps.logCallDebug("call signal rejected: missing signal payload", {
        eventType,
        userId: state.userId,
        roomId: state.roomId,
        roomSlug: state.roomSlug,
        requestId
      });
      this.deps.sendValidationNack(connection, requestId, eventType, "payload.signal object is required", {
        traceId,
        roomId: state.roomId,
        userId: state.userId,
        sessionId: state.sessionId
      });
      return;
    }

    const signalSize = this.deps.safeJsonSize(signal);
    const maxSignalSize = eventType === "call.offer" || eventType === "call.answer"
      ? this.deps.callSdpSignalMaxBytes
      : this.deps.callIceSignalMaxBytes;

    if (
      !Number.isFinite(signalSize)
      || signalSize < this.deps.callSignalMinBytes
      || signalSize > maxSignalSize
    ) {
      this.deps.logCallDebug("call signal rejected: invalid signal size", {
        eventType,
        userId: state.userId,
        roomId: state.roomId,
        roomSlug: state.roomSlug,
        requestId,
        signalSize,
        maxSignalSize
      });
      this.deps.sendValidationNack(
        connection,
        requestId,
        eventType,
        `payload.signal size must be between ${this.deps.callSignalMinBytes} and ${maxSignalSize} bytes`,
        {
          traceId,
          roomId: state.roomId,
          userId: state.userId,
          sessionId: state.sessionId
        }
      );
      return;
    }

    const targetUserId = this.resolveRequiredTargetUserId({
      payload,
      connection,
      requestId,
      eventType,
      state,
      traceId
    });
    if (!targetUserId) {
      return;
    }

    if (await this.deps.checkAndMarkCallSignalIdempotency({
      userId: state.userId,
      eventType,
      requestId,
      targetUserId,
      connection
    })) {
      this.deps.logCallDebug("call signal duplicate dropped", {
        eventType,
        userId: state.userId,
        roomId: state.roomId,
        roomSlug: state.roomSlug,
        requestId,
        targetUserId
      });
      return;
    }

    if (eventType === "call.offer") {
      void this.deps.incrementMetric("call_offer_received");
      const reverseKey = `${targetUserId}->${state.userId}`;
      const reverseLastAt = lastCallOfferByPair.get(reverseKey) || 0;
      if (reverseLastAt > 0 && Date.now() - reverseLastAt <= this.deps.callGlareWindowMs) {
        void this.deps.incrementMetric("call_glare_suspected");
      }

      if (this.deps.isCallOfferRateLimited(state.userId, targetUserId)) {
        this.deps.logCallDebug("call signal rejected: offer rate limited", {
          eventType,
          userId: state.userId,
          roomId: state.roomId,
          roomSlug: state.roomSlug,
          requestId,
          targetUserId
        });
        this.deps.sendNack(
          connection,
          requestId,
          eventType,
          "OfferRateLimited",
          "Too many call offers; retry in a few seconds",
          {
            traceId,
            roomId: state.roomId,
            userId: state.userId,
            sessionId: state.sessionId,
            targetUserId
          }
        );
        void this.deps.incrementMetric("nack_sent");
        void this.deps.incrementMetric("call_offer_rate_limited");
        return;
      }
    }

    if (eventType === "call.answer") {
      void this.deps.incrementMetric("call_answer_received");
    }

    if (eventType === "call.ice") {
      void this.deps.incrementMetric("call_ice_received");
    }

    const iceMeta = eventType === "call.ice" ? this.deps.extractIceCandidateMeta(signal) : null;
    const sdpMeta = eventType === "call.offer" || eventType === "call.answer" ? this.deps.extractSdpMeta(signal) : null;

    this.deps.logCallDebug("call signal received", {
      eventType,
      userId: state.userId,
      sessionId: state.sessionId,
      traceId,
      roomId: state.roomId,
      roomSlug: state.roomSlug,
      requestId,
      targetUserId,
      signalType: (signal as { type?: unknown }).type ?? null,
      signalSize,
      ...(iceMeta || {}),
      ...(sdpMeta || {})
    });

    const relayEnvelope = buildCallSignalRelayEnvelope(
      eventType,
      requestId,
      state.sessionId,
      traceId,
      state.userId,
      state.userName,
      state.roomId,
      state.roomSlug,
      targetUserId,
      signal
    );

    const relayOutcome = this.deps.relayToTargetOrRoom(connection, state.roomId, targetUserId, relayEnvelope);
    if (!relayOutcome.ok) {
      this.deps.logCallDebug("call signal relay failed: target not in room", {
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
      this.deps.sendTargetNotInRoomNack(connection, requestId, eventType, {
        traceId,
        roomId: state.roomId,
        userId: state.userId,
        sessionId: state.sessionId,
        targetUserId
      });
      void this.deps.incrementMetric("call_signal_target_miss");
      return;
    }

    this.deps.logCallDebug("call signal relayed", {
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

    this.deps.sendAckWithMetrics(
      connection,
      requestId,
      eventType,
      {
        relayedTo: relayOutcome.relayedCount,
        targetUserId
      },
      ["call_signal_sent"]
    );
  }
}
