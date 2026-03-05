import {
  decrementVoiceCounter,
  incrementVoiceCounter,
  logVoiceDiagnostics
} from "../../utils/voiceDiagnostics";
import { RTC_CONFIG } from "./voiceCallConfig";
import { bindVoicePeerConnectionHandlers } from "./voiceCallPeerConnectionHandlers";
import {
  createHiddenRemoteAudioElement,
  createVoicePeerContext,
  disposeVoicePeerContext
} from "./voiceCallPeerLifecycle";
import type { VoicePeersRef, WsSender } from "./voiceCallTypes";

export function deriveCallStatusForRtc(peersRef: VoicePeersRef): {
  connectedUserIds: string[];
  connectingUserIds: string[];
  status: "idle" | "connecting" | "active";
} {
  const peers = Array.from(peersRef.current.values());
  const connectedUserIds = Array.from(peersRef.current.entries())
    .filter(([, peer]) => peer.connection.connectionState === "connected" || peer.hasRemoteTrack)
    .map(([userId]) => userId);

  const connectingUserIds = Array.from(peersRef.current.entries())
    .filter(([, peer]) => {
      if (peer.connection.connectionState === "connected" || peer.hasRemoteTrack) {
        return false;
      }
      const state = peer.connection.connectionState;
      return state === "new" || state === "connecting";
    })
    .map(([userId]) => userId);

  const anyConnected = peers.some((peer) => peer.connection.connectionState === "connected" || peer.hasRemoteTrack);
  if (anyConnected) {
    return { connectedUserIds, connectingUserIds, status: "active" };
  }

  const anyConnecting = peers.some((peer) => {
    const state = peer.connection.connectionState;
    return state === "connecting" || state === "new";
  });
  if (anyConnecting) {
    return { connectedUserIds, connectingUserIds, status: "connecting" };
  }

  return { connectedUserIds, connectingUserIds, status: "idle" };
}

export function closePeerForRtc(args: {
  targetUserId: string;
  peersRef: VoicePeersRef;
  clearPeerReconnectTimer: (targetUserId: string) => void;
  clearPeerStatsTimer: (targetUserId: string) => void;
  clearRemoteVideoStream: (targetUserId: string) => void;
  syncPeerVoiceState: () => void;
  updateCallStatus: () => void;
  pushCallLog: (text: string) => void;
  reason?: string;
}): void {
  const {
    targetUserId,
    peersRef,
    clearPeerReconnectTimer,
    clearPeerStatsTimer,
    clearRemoteVideoStream,
    syncPeerVoiceState,
    updateCallStatus,
    pushCallLog,
    reason
  } = args;

  const peer = peersRef.current.get(targetUserId);
  if (!peer) {
    return;
  }

  clearPeerReconnectTimer(targetUserId);
  clearPeerStatsTimer(targetUserId);
  disposeVoicePeerContext(peer);
  peersRef.current.delete(targetUserId);
  clearRemoteVideoStream(targetUserId);
  decrementVoiceCounter("runtimePeers");
  decrementVoiceCounter("runtimeAudioElements");
  logVoiceDiagnostics("runtime peer closed", { targetUserId, label: peer.label });
  syncPeerVoiceState();

  if (reason) {
    pushCallLog(reason);
  }

  updateCallStatus();
}

export function ensurePeerConnectionForRtc(args: {
  targetUserId: string;
  targetLabel: string;
  peersRef: VoicePeersRef;
  sendWsEvent: WsSender;
  rememberRequestTarget: (requestId: string | null, eventType: string, targetUserId: string) => void;
  pushCallLog: (text: string) => void;
  clearPeerReconnectTimer: (targetUserId: string) => void;
  startPeerStatsMonitor: (targetUserId: string, targetLabel: string) => void;
  updateCallStatus: () => void;
  retryRemoteAudioPlayback: (reason: string) => void;
  scheduleReconnect: (targetUserId: string, trigger: string) => void;
  closePeer: (targetUserId: string, reason?: string) => void;
  setRemoteVideoStream: (targetUserId: string, stream: MediaStream) => void;
  clearRemoteVideoStream: (targetUserId: string) => void;
  applyRemoteAudioOutput: (element: HTMLAudioElement) => Promise<void>;
  syncPeerVoiceState: () => void;
  audioMuted: boolean;
  outputVolume: number;
}): RTCPeerConnection {
  const {
    targetUserId,
    targetLabel,
    peersRef,
    sendWsEvent,
    rememberRequestTarget,
    pushCallLog,
    clearPeerReconnectTimer,
    startPeerStatsMonitor,
    updateCallStatus,
    retryRemoteAudioPlayback,
    scheduleReconnect,
    closePeer,
    setRemoteVideoStream,
    clearRemoteVideoStream,
    applyRemoteAudioOutput,
    syncPeerVoiceState,
    audioMuted,
    outputVolume
  } = args;

  const existing = peersRef.current.get(targetUserId);
  if (existing) {
    if (existing.label !== targetLabel) {
      existing.label = targetLabel;
    }
    return existing.connection;
  }

  const remoteAudioElement = createHiddenRemoteAudioElement();
  const connection = new RTCPeerConnection(RTC_CONFIG);
  const peerContext = createVoicePeerContext(connection, remoteAudioElement, targetLabel);
  peersRef.current.set(targetUserId, peerContext);
  incrementVoiceCounter("runtimePeers");
  incrementVoiceCounter("runtimeAudioElements");
  logVoiceDiagnostics("runtime peer created", {
    targetUserId,
    targetLabel
  });

  bindVoicePeerConnectionHandlers({
    connection,
    targetUserId,
    targetLabel,
    peersRef,
    sendWsEvent,
    rememberRequestTarget,
    pushCallLog,
    clearPeerReconnectTimer,
    startPeerStatsMonitor,
    updateCallStatus,
    retryRemoteAudioPlayback,
    scheduleReconnect,
    closePeer,
    setRemoteVideoStream,
    clearRemoteVideoStream,
    applyRemoteAudioOutput,
    syncPeerVoiceState,
    audioMuted,
    outputVolume
  });

  void applyRemoteAudioOutput(remoteAudioElement);
  return connection;
}
