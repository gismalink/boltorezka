import type { MutableRefObject } from "react";
import {
  handleCallNackEvent,
  handleIncomingMicStateEvent,
  handleIncomingSignalEvent,
  handleIncomingTerminalEvent,
  logInvalidSignalPayload
} from "./voiceCallSignalHandlers";
import type {
  CallMicStatePayload,
  CallNackPayload,
  CallSignalPayload,
  CallTerminalPayload,
  VoicePeersRef,
  WsSender
} from "./voiceCallTypes";

export async function dispatchIncomingSignalForRtc(args: {
  eventType: "call.offer" | "call.answer" | "call.ice";
  payload: CallSignalPayload;
  roomVoiceConnectedRef: MutableRefObject<boolean>;
  peersRef: VoicePeersRef;
  sendWsEvent: WsSender;
  rememberRequestTarget: (requestId: string | null, eventType: string, targetUserId: string) => void;
  ensurePeerConnection: (targetUserId: string, targetLabel: string) => RTCPeerConnection;
  clearPeerReconnectTimer: (targetUserId: string) => void;
  attachLocalTracks: (connection: RTCPeerConnection) => Promise<void>;
  flushPendingRemoteCandidates: (targetUserId: string, targetLabel: string) => Promise<void>;
  setLastCallPeer: (peer: string) => void;
  updateCallStatus: () => void;
  pushCallLog: (text: string) => void;
  closePeer: (targetUserId: string, reason?: string) => void;
  shouldInitiateOffer: (targetUserId: string) => boolean;
  logVoiceDiagnostics: (message: string, context?: Record<string, unknown>) => void;
}): Promise<void> {
  const { eventType, payload } = args;
  const fromUserId = String(payload.fromUserId || "").trim();
  const signal = payload.signal;
  if (!fromUserId || !signal || typeof signal !== "object") {
    args.pushCallLog(`${eventType} ignored: invalid payload`);
    logInvalidSignalPayload({
      eventType,
      fromUserId,
      signal,
      logVoiceDiagnostics: args.logVoiceDiagnostics
    });
    return;
  }

  await handleIncomingSignalEvent({
    eventType,
    payload,
    roomVoiceConnectedRef: args.roomVoiceConnectedRef,
    peersRef: args.peersRef,
    sendWsEvent: args.sendWsEvent,
    rememberRequestTarget: args.rememberRequestTarget,
    ensurePeerConnection: args.ensurePeerConnection,
    clearPeerReconnectTimer: args.clearPeerReconnectTimer,
    attachLocalTracks: args.attachLocalTracks,
    flushPendingRemoteCandidates: args.flushPendingRemoteCandidates,
    setLastCallPeer: args.setLastCallPeer,
    updateCallStatus: args.updateCallStatus,
    pushCallLog: args.pushCallLog,
    closePeer: args.closePeer,
    shouldInitiateOffer: args.shouldInitiateOffer
  });
}

export function dispatchIncomingTerminalForRtc(args: {
  eventType: "call.reject" | "call.hangup";
  payload: CallTerminalPayload;
  closePeer: (targetUserId: string, reason?: string) => void;
  updateCallStatus: () => void;
}): void {
  handleIncomingTerminalEvent(args);
}

export function dispatchIncomingMicStateForRtc(args: {
  payload: CallMicStatePayload;
  peersRef: VoicePeersRef;
  remoteMicStateByUserIdRef: MutableRefObject<Record<string, { muted: boolean; speaking: boolean; audioMuted: boolean }>>;
  syncPeerVoiceState: () => void;
}): void {
  const fromUserId = String(args.payload.fromUserId || "").trim();
  if (fromUserId) {
    const previous = args.remoteMicStateByUserIdRef.current[fromUserId] || {
      muted: false,
      speaking: false,
      audioMuted: false
    };

    args.remoteMicStateByUserIdRef.current[fromUserId] = {
      muted: typeof args.payload.muted === "boolean" ? args.payload.muted : previous.muted,
      speaking: typeof args.payload.speaking === "boolean" ? args.payload.speaking : previous.speaking,
      audioMuted: typeof args.payload.audioMuted === "boolean" ? args.payload.audioMuted : previous.audioMuted
    };
  }

  handleIncomingMicStateEvent({
    payload: args.payload,
    peersRef: args.peersRef,
    syncPeerVoiceState: args.syncPeerVoiceState
  });
}

export function dispatchCallNackForRtc(args: {
  payload: CallNackPayload;
  requestTargetByIdRef: MutableRefObject<Map<string, { targetUserId: string; eventType: string }>>;
  blockedTargetUntilRef: MutableRefObject<Map<string, number>>;
  targetNotInRoomBlockMs: number;
  targetNotInRoomResyncGraceMs: number;
  closePeer: (targetUserId: string, reason?: string) => void;
  scheduleRoomTargetsResync: (delayMs: number) => void;
}): void {
  handleCallNackEvent({
    payload: args.payload,
    requestTargetByIdRef: args.requestTargetByIdRef,
    blockedTargetUntilRef: args.blockedTargetUntilRef,
    targetNotInRoomBlockMs: args.targetNotInRoomBlockMs,
    targetNotInRoomResyncGraceMs: args.targetNotInRoomResyncGraceMs,
    closePeer: args.closePeer,
    scheduleRoomTargetsResync: args.scheduleRoomTargetsResync
  });
}
