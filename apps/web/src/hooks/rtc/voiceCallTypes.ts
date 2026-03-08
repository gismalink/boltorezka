import type { MutableRefObject } from "react";
import type { AudioQuality, PresenceMember } from "../../domain";
import type { CallStatus } from "../../services";

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

export type UseVoiceCallRuntimeArgs = {
  localUserId: string;
  roomSlug: string;
  allowVideoStreaming: boolean;
  videoStreamingEnabled: boolean;
  roomVoiceTargets: PresenceMember[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedVideoInputId: string;
  serverVideoResolution: "160x120" | "320x240" | "640x480";
  serverVideoFps: 10 | 15 | 24 | 30;
  serverVideoEffectType: ServerVideoEffectType;
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  micMuted: boolean;
  micTestLevel: number;
  audioMuted: boolean;
  outputVolume: number;
  serverAudioQuality: AudioQuality;
  t: (key: string) => string;
  pushToast: (message: string) => void;
  pushCallLog: (text: string) => void;
  sendWsEvent: WsSender;
  setCallStatus: (status: CallStatus) => void;
  setLastCallPeer: (peer: string) => void;
};

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
