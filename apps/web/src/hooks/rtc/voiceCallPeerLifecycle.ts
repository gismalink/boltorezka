import { createNegotiationStateDefaults } from "./voiceCallNegotiationState";
import type { VoicePeerContext } from "./voiceCallTypes";

export function createHiddenRemoteAudioElement(): HTMLAudioElement {
  const remoteAudioElement = document.createElement("audio");
  remoteAudioElement.autoplay = true;
  remoteAudioElement.setAttribute("playsinline", "true");
  remoteAudioElement.style.position = "fixed";
  remoteAudioElement.style.width = "1px";
  remoteAudioElement.style.height = "1px";
  remoteAudioElement.style.opacity = "0";
  remoteAudioElement.style.pointerEvents = "none";
  remoteAudioElement.style.left = "-9999px";
  remoteAudioElement.style.top = "-9999px";
  remoteAudioElement.dataset.audioRoute = "element";
  document.body.appendChild(remoteAudioElement);
  return remoteAudioElement;
}

export function createVoicePeerContext(
  connection: RTCPeerConnection,
  audioElement: HTMLAudioElement,
  targetLabel: string
): VoicePeerContext {
  return {
    connection,
    audioElement,
    remoteStream: null,
    label: targetLabel,
    hasRemoteTrack: false,
    isRemoteMicMuted: false,
    isRemoteSpeaking: false,
    isRemoteAudioMuted: false,
    hasRemoteSpeakingSignal: false,
    speakingLastAboveAt: 0,
    speakingAudioContext: null,
    speakingSource: null,
    speakingAnimationFrameId: 0,
    speakingAnalyser: null,
    speakingData: null,
    speakingGain: null,
    statsTimer: null,
    lastInboundBytes: 0,
    lastOutboundBytes: 0,
    inboundStalledTicks: 0,
    inboundStalled: false,
    stallRecoveryAttempts: 0,
    reconnectAttempts: 0,
    reconnectTimer: null,
    ...createNegotiationStateDefaults(),
    pendingRemoteCandidates: []
  };
}

export function disposeVoicePeerContext(peer: VoicePeerContext): void {
  // Fully detach listeners and media graph before closing the connection.
  peer.connection.onicecandidate = null;
  peer.connection.onicecandidateerror = null;
  peer.connection.oniceconnectionstatechange = null;
  peer.connection.onicegatheringstatechange = null;
  peer.connection.onconnectionstatechange = null;
  peer.connection.ontrack = null;

  if (peer.speakingAnimationFrameId) {
    cancelAnimationFrame(peer.speakingAnimationFrameId);
    peer.speakingAnimationFrameId = 0;
  }

  if (peer.speakingAudioContext) {
    void peer.speakingAudioContext.close();
    peer.speakingAudioContext = null;
  }

  peer.speakingSource = null;
  peer.speakingGain = null;
  peer.speakingAnalyser = null;
  peer.speakingData = null;

  peer.connection.close();
  peer.audioElement.pause();
  peer.audioElement.srcObject = null;
  peer.audioElement.remove();
}
