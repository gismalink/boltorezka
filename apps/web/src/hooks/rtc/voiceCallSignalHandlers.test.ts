import { describe, expect, it, vi } from "vitest";
import { handleCallNackEvent, handleIncomingSignalEvent } from "./voiceCallSignalHandlers";

function createPeer(overrides: Record<string, unknown> = {}) {
  return {
    connection: {
      signalingState: "stable"
    },
    pendingRemoteCandidates: [],
    reconnectAttempts: 0,
    ...overrides
  } as any;
}

describe("voiceCallSignalHandlers", () => {
  it("rejects offer when room voice is disabled", async () => {
    const sendWsEvent = vi.fn(() => "req-reject-1");
    const rememberRequestTarget = vi.fn();

    await handleIncomingSignalEvent({
      eventType: "call.offer",
      payload: {
        fromUserId: "user-2",
        fromUserName: "User 2",
        signal: { type: "offer", sdp: "dummy" }
      },
      roomVoiceConnectedRef: { current: false },
      peersRef: { current: new Map() } as any,
      sendWsEvent,
      rememberRequestTarget,
      ensurePeerConnection: vi.fn(),
      clearPeerReconnectTimer: vi.fn(),
      attachLocalTracks: vi.fn(async () => undefined),
      flushPendingRemoteCandidates: vi.fn(async () => undefined),
      setLastCallPeer: vi.fn(),
      updateCallStatus: vi.fn(),
      pushCallLog: vi.fn(),
      closePeer: vi.fn(),
      shouldInitiateOffer: vi.fn(() => false)
    });

    expect(sendWsEvent).toHaveBeenCalledWith(
      "call.reject",
      {
        targetUserId: "user-2",
        reason: "room_voice_disabled"
      },
      { trackAck: false, maxRetries: 0 }
    );
    expect(rememberRequestTarget).toHaveBeenCalledWith("req-reject-1", "call.reject", "user-2");
  });

  it("ignores remote glare offer when local side is designated offerer", async () => {
    const sendWsEvent = vi.fn(() => "req-reject-glare");
    const rememberRequestTarget = vi.fn();
    const ensurePeerConnection = vi.fn();

    const peer = createPeer({
      makingOffer: true,
      isSettingRemoteAnswerPending: false
    });

    await handleIncomingSignalEvent({
      eventType: "call.offer",
      payload: {
        fromUserId: "user-2",
        fromUserName: "User 2",
        signal: { type: "offer", sdp: "dummy" }
      },
      roomVoiceConnectedRef: { current: true },
      peersRef: { current: new Map([["user-2", peer]]) } as any,
      sendWsEvent,
      rememberRequestTarget,
      ensurePeerConnection,
      clearPeerReconnectTimer: vi.fn(),
      attachLocalTracks: vi.fn(async () => undefined),
      flushPendingRemoteCandidates: vi.fn(async () => undefined),
      setLastCallPeer: vi.fn(),
      updateCallStatus: vi.fn(),
      pushCallLog: vi.fn(),
      closePeer: vi.fn(),
      shouldInitiateOffer: vi.fn(() => true)
    });

    expect(sendWsEvent).toHaveBeenCalledWith(
      "call.reject",
      {
        targetUserId: "user-2",
        reason: "glare-local-offer"
      },
      { trackAck: false, maxRetries: 0 }
    );
    expect(rememberRequestTarget).toHaveBeenCalledWith("req-reject-glare", "call.reject", "user-2");
    expect(ensurePeerConnection).not.toHaveBeenCalled();
  });

  it("queues incoming ICE when remote description is not set", async () => {
    const pushCallLog = vi.fn();
    const peer = createPeer();
    const connection = {
      remoteDescription: null,
      addIceCandidate: vi.fn(async () => undefined)
    } as any;

    await handleIncomingSignalEvent({
      eventType: "call.ice",
      payload: {
        fromUserId: "user-2",
        fromUserName: "User 2",
        signal: {
          candidate: {
            candidate: "candidate:0 1 udp 2122260223 10.0.0.1 8998 typ host"
          }
        }
      },
      roomVoiceConnectedRef: { current: true },
      peersRef: { current: new Map([["user-2", peer]]) } as any,
      sendWsEvent: vi.fn(),
      rememberRequestTarget: vi.fn(),
      ensurePeerConnection: vi.fn(() => connection),
      clearPeerReconnectTimer: vi.fn(),
      attachLocalTracks: vi.fn(async () => undefined),
      flushPendingRemoteCandidates: vi.fn(async () => undefined),
      setLastCallPeer: vi.fn(),
      updateCallStatus: vi.fn(),
      pushCallLog,
      closePeer: vi.fn(),
      shouldInitiateOffer: vi.fn(() => false)
    });

    expect(peer.pendingRemoteCandidates).toHaveLength(1);
    expect(connection.addIceCandidate).not.toHaveBeenCalled();
    expect(pushCallLog).toHaveBeenCalledWith("call.ice queued <- User 2 (1)");
  });

  it("blocks target and schedules resync on TargetNotInRoom nack", () => {
    const requestTargetByIdRef = {
      current: new Map([
        ["req-123", { targetUserId: "user-2", eventType: "call.offer" }]
      ])
    };
    const blockedTargetUntilRef = { current: new Map<string, number>() };
    const closePeer = vi.fn();
    const scheduleRoomTargetsResync = vi.fn();

    handleCallNackEvent({
      payload: {
        requestId: "req-123",
        eventType: "call.offer",
        code: "TargetNotInRoom",
        message: "not in room"
      },
      requestTargetByIdRef: requestTargetByIdRef as any,
      blockedTargetUntilRef: blockedTargetUntilRef as any,
      targetNotInRoomBlockMs: 12000,
      targetNotInRoomResyncGraceMs: 500,
      closePeer,
      scheduleRoomTargetsResync
    });

    expect(blockedTargetUntilRef.current.has("user-2")).toBe(true);
    expect(closePeer).toHaveBeenCalledWith("user-2", "nack call.offer: TargetNotInRoom");
    expect(scheduleRoomTargetsResync).toHaveBeenCalledWith(12500);
    expect(requestTargetByIdRef.current.has("req-123")).toBe(false);
  });
});
