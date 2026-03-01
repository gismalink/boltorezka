import type { MutableRefObject } from "react";
import type {
  CallMicStatePayload,
  CallNackPayload,
  CallSignalPayload,
  CallTerminalPayload,
  VoicePeerContext,
  VoicePeersRef,
  WsSender
} from "./voiceCallTypes";
import { buildLocalDescriptionAfterIceGathering } from "./voiceCallUtils";

async function preparePeerConnectionForRemoteDescription({
  fromUserId,
  fromUserName,
  peersRef,
  ensurePeerConnection,
  clearPeerReconnectTimer,
  attachLocalTracks
}: {
  fromUserId: string;
  fromUserName: string;
  peersRef: VoicePeersRef;
  ensurePeerConnection: (targetUserId: string, targetLabel: string) => RTCPeerConnection;
  clearPeerReconnectTimer: (targetUserId: string) => void;
  attachLocalTracks?: (connection: RTCPeerConnection) => Promise<void>;
}) {
  const connection = ensurePeerConnection(fromUserId, fromUserName);
  const peer = peersRef.current.get(fromUserId);
  if (peer) {
    clearPeerReconnectTimer(fromUserId);
    peer.reconnectAttempts = 0;
  }

  if (attachLocalTracks) {
    await attachLocalTracks(connection);
  }

  return connection;
}

export async function handleIncomingSignalEvent({
  eventType,
  payload,
  roomVoiceConnectedRef,
  peersRef,
  sendWsEvent,
  ensurePeerConnection,
  clearPeerReconnectTimer,
  attachLocalTracks,
  flushPendingRemoteCandidates,
  setLastCallPeer,
  updateCallStatus,
  pushCallLog,
  closePeer
}: {
  eventType: "call.offer" | "call.answer" | "call.ice";
  payload: CallSignalPayload;
  roomVoiceConnectedRef: MutableRefObject<boolean>;
  peersRef: VoicePeersRef;
  sendWsEvent: WsSender;
  ensurePeerConnection: (targetUserId: string, targetLabel: string) => RTCPeerConnection;
  clearPeerReconnectTimer: (targetUserId: string) => void;
  attachLocalTracks: (connection: RTCPeerConnection) => Promise<void>;
  flushPendingRemoteCandidates: (targetUserId: string, targetLabel: string) => Promise<void>;
  setLastCallPeer: (peer: string) => void;
  updateCallStatus: () => void;
  pushCallLog: (text: string) => void;
  closePeer: (targetUserId: string, reason?: string) => void;
}) {
  const fromUserId = String(payload.fromUserId || "").trim();
  const fromUserName = String(payload.fromUserName || fromUserId || "unknown").trim();
  const signal = payload.signal;
  if (!fromUserId || !signal || typeof signal !== "object") {
    return;
  }

  if (eventType === "call.offer") {
    if (!roomVoiceConnectedRef.current) {
      sendWsEvent(
        "call.reject",
        {
          targetUserId: fromUserId,
          reason: "room_voice_disabled"
        },
        { maxRetries: 1 }
      );
      return;
    }

    try {
      const connection = await preparePeerConnectionForRemoteDescription({
        fromUserId,
        fromUserName,
        peersRef,
        ensurePeerConnection,
        clearPeerReconnectTimer,
        attachLocalTracks
      });
      await connection.setRemoteDescription(new RTCSessionDescription(signal as unknown as RTCSessionDescriptionInit));
      await flushPendingRemoteCandidates(fromUserId, fromUserName);

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      const { signal: answerSignal, settledBy } = await buildLocalDescriptionAfterIceGathering(connection);
      if (settledBy === "timeout") {
        pushCallLog(`rtc ice gathering timeout before answer -> ${fromUserName}`);
      }

      sendWsEvent(
        "call.answer",
        {
          targetUserId: fromUserId,
          signal: answerSignal
        },
        { maxRetries: 1 }
      );

      setLastCallPeer(fromUserName);
      updateCallStatus();
      pushCallLog(`auto-answer sent -> ${fromUserName}`);
    } catch (error) {
      pushCallLog(`call.offer handling failed: ${(error as Error).message}`);
      closePeer(fromUserId);
    }

    return;
  }

  if (eventType === "call.answer") {
    try {
      const connection = await preparePeerConnectionForRemoteDescription({
        fromUserId,
        fromUserName,
        peersRef,
        ensurePeerConnection,
        clearPeerReconnectTimer
      });

      await connection.setRemoteDescription(new RTCSessionDescription(signal as unknown as RTCSessionDescriptionInit));
      await flushPendingRemoteCandidates(fromUserId, fromUserName);
      setLastCallPeer(fromUserName);
      updateCallStatus();
      pushCallLog(`call answered by ${fromUserName}`);
    } catch (error) {
      pushCallLog(`call.answer handling failed: ${(error as Error).message}`);
    }

    return;
  }

  try {
    const connection = ensurePeerConnection(fromUserId, fromUserName);
    const peer = peersRef.current.get(fromUserId);
    const candidate = (signal as { candidate?: RTCIceCandidateInit }).candidate
      ? (signal as { candidate: RTCIceCandidateInit }).candidate
      : (signal as RTCIceCandidateInit);

    if (!candidate || typeof candidate.candidate !== "string") {
      return;
    }

    if (!connection.remoteDescription) {
      if (peer) {
        peer.pendingRemoteCandidates.push(candidate);
        pushCallLog(`call.ice queued <- ${fromUserName} (${peer.pendingRemoteCandidates.length})`);
      }
      return;
    }

    await connection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    pushCallLog(`call.ice handling failed: ${(error as Error).message}`);
  }
}

export function handleIncomingTerminalEvent({
  eventType,
  payload,
  closePeer,
  updateCallStatus
}: {
  eventType: "call.reject" | "call.hangup";
  payload: CallTerminalPayload;
  closePeer: (targetUserId: string, reason?: string) => void;
  updateCallStatus: () => void;
}) {
  const fromUserId = String(payload.fromUserId || "").trim();
  const fromUserName = String(payload.fromUserName || fromUserId || "unknown").trim();
  const reason = String(payload.reason || "").trim();
  if (fromUserId) {
    closePeer(fromUserId, `${eventType} from ${fromUserName}${reason ? ` (${reason})` : ""}`);
    return;
  }

  updateCallStatus();
}

export function handleIncomingMicStateEvent({
  payload,
  peersRef,
  syncPeerVoiceState
}: {
  payload: CallMicStatePayload;
  peersRef: VoicePeersRef;
  syncPeerVoiceState: () => void;
}) {
  const fromUserId = String(payload.fromUserId || "").trim();
  if (!fromUserId) {
    return;
  }

  const peer = peersRef.current.get(fromUserId);
  if (!peer) {
    return;
  }

  if (typeof payload.muted === "boolean") {
    peer.isRemoteMicMuted = payload.muted;
  }

  if (typeof payload.audioMuted === "boolean") {
    peer.isRemoteAudioMuted = payload.audioMuted;
  }

  if (typeof payload.speaking === "boolean") {
    peer.hasRemoteSpeakingSignal = true;
    peer.isRemoteSpeaking = !peer.isRemoteMicMuted && payload.speaking;
  }

  if (peer.isRemoteMicMuted) {
    peer.isRemoteSpeaking = false;
  }
  syncPeerVoiceState();
}

export function handleCallNackEvent({
  payload,
  requestTargetByIdRef,
  blockedTargetUntilRef,
  targetNotInRoomBlockMs,
  targetNotInRoomResyncGraceMs,
  closePeer,
  scheduleRoomTargetsResync
}: {
  payload: CallNackPayload;
  requestTargetByIdRef: MutableRefObject<Map<string, { targetUserId: string; eventType: string }>>;
  blockedTargetUntilRef: MutableRefObject<Map<string, number>>;
  targetNotInRoomBlockMs: number;
  targetNotInRoomResyncGraceMs: number;
  closePeer: (targetUserId: string, reason?: string) => void;
  scheduleRoomTargetsResync: (delayMs: number) => void;
}) {
  const requestId = String(payload.requestId || "").trim();
  const code = String(payload.code || "").trim();
  const eventType = String(payload.eventType || "").trim();
  if (!requestId || !eventType.startsWith("call.")) {
    return;
  }

  const mapped = requestTargetByIdRef.current.get(requestId);
  if (mapped) {
    requestTargetByIdRef.current.delete(requestId);
  }

  if (!mapped || code !== "TargetNotInRoom") {
    return;
  }

  if (mapped.eventType !== "call.offer" && mapped.eventType !== "call.answer") {
    return;
  }

  blockedTargetUntilRef.current.set(mapped.targetUserId, Date.now() + targetNotInRoomBlockMs);
  closePeer(mapped.targetUserId, `nack ${mapped.eventType}: ${code}`);
  scheduleRoomTargetsResync(targetNotInRoomBlockMs + targetNotInRoomResyncGraceMs);
}

export function logInvalidSignalPayload({
  eventType,
  fromUserId,
  signal,
  logVoiceDiagnostics
}: {
  eventType: "call.offer" | "call.answer" | "call.ice";
  fromUserId: string;
  signal: unknown;
  logVoiceDiagnostics: (event: string, data: Record<string, unknown>) => void;
}) {
  logVoiceDiagnostics("runtime signal ignored", {
    eventType,
    fromUserId,
    hasSignalObject: Boolean(signal && typeof signal === "object")
  });
}
