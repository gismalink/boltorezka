import type { MutableRefObject } from "react";

export type WsSender = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

export type CallSignalPayload = {
  requestId?: string;
  sessionId?: string;
  traceId?: string;
  fromUserId?: string;
  fromUserName?: string;
  signal?: Record<string, unknown>;
};

export type CallTerminalPayload = {
  fromUserId?: string;
  fromUserName?: string;
  reason?: string | null;
};

export type CallMicStatePayload = {
  fromUserId?: string;
  fromUserName?: string;
  muted?: boolean;
  speaking?: boolean;
  audioMuted?: boolean;
};

export type CallVideoStatePayload = {
  fromUserId?: string;
  fromUserName?: string;
  roomSlug?: string;
  settings?: Record<string, unknown>;
};

export type CallNackPayload = {
  requestId: string;
  eventType: string;
  code: string;
  message: string;
};

export type ServerVideoEffectType = "none" | "pixel8" | "ascii";

export type VoiceMediaStatusSummary = "idle" | "connecting" | "signaling" | "media" | "stalled" | "disconnected";

export type VoicePeerContext = {
  connection: RTCPeerConnection;
  audioElement: HTMLAudioElement;
  remoteStream: MediaStream | null;
  label: string;
  hasRemoteTrack: boolean;
  isRemoteMicMuted: boolean;
  isRemoteSpeaking: boolean;
  isRemoteAudioMuted: boolean;
  hasRemoteSpeakingSignal: boolean;
  speakingLastAboveAt: number;
  speakingAudioContext: AudioContext | null;
  speakingSource: MediaStreamAudioSourceNode | null;
  speakingAnimationFrameId: number;
  speakingAnalyser: AnalyserNode | null;
  speakingData: Uint8Array<ArrayBuffer> | null;
  speakingGain: GainNode | null;
  statsTimer: number | null;
  lastInboundBytes: number;
  lastOutboundBytes: number;
  inboundStalledTicks: number;
  inboundStalled: boolean;
  stallRecoveryAttempts: number;
  reconnectAttempts: number;
  reconnectTimer: number | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  offerInFlight: boolean;
  lastOfferAt: number;
  lastOfferAtByBucket: Partial<Record<"manual" | "video-sync" | "ice-restart", number>>;
  pendingRemoteCandidates: RTCIceCandidateInit[];
};

export type VoicePeersRef = MutableRefObject<Map<string, VoicePeerContext>>;
