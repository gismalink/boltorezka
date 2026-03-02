import type { MutableRefObject } from "react";
import type { AudioQuality, PresenceMember } from "../domain";
import type { CallStatus } from "../services";

export type WsSender = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

export type CallSignalPayload = {
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

export type CallNackPayload = {
  requestId: string;
  eventType: string;
  code: string;
  message: string;
};

export type UseVoiceCallRuntimeArgs = {
  localUserId: string;
  roomSlug: string;
  roomVoiceTargets: PresenceMember[];
  selectedInputId: string;
  selectedOutputId: string;
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
  pendingRemoteCandidates: RTCIceCandidateInit[];
};

export type VoicePeersRef = MutableRefObject<Map<string, VoicePeerContext>>;
