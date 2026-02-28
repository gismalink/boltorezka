import { useCallback, useEffect, useRef, useState } from "react";
import type { CallStatus } from "../services";
import type { PresenceMember } from "../domain";
import {
  decrementVoiceCounter,
  incrementVoiceCounter,
  logVoiceDiagnostics
} from "../utils/voiceDiagnostics";

type WsSender = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

type CallSignalPayload = {
  fromUserId?: string;
  fromUserName?: string;
  signal?: Record<string, unknown>;
};

type CallTerminalPayload = {
  fromUserId?: string;
  fromUserName?: string;
  reason?: string | null;
};

type CallMicStatePayload = {
  fromUserId?: string;
  fromUserName?: string;
  muted?: boolean;
  speaking?: boolean;
  audioMuted?: boolean;
};

type UseVoiceCallRuntimeArgs = {
  localUserId: string;
  roomSlug: string;
  roomVoiceTargets: PresenceMember[];
  selectedInputId: string;
  selectedOutputId: string;
  micMuted: boolean;
  micTestLevel: number;
  audioMuted: boolean;
  outputVolume: number;
  t: (key: string) => string;
  pushToast: (message: string) => void;
  pushCallLog: (text: string) => void;
  sendWsEvent: WsSender;
  setCallStatus: (status: CallStatus) => void;
  setLastCallPeer: (peer: string) => void;
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

function normalizeIceServer(value: unknown): RTCIceServer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as {
    urls?: unknown;
    username?: unknown;
    credential?: unknown;
  };

  const urls =
    typeof source.urls === "string"
      ? source.urls
      : Array.isArray(source.urls)
        ? source.urls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : null;

  if (!urls || (Array.isArray(urls) && urls.length === 0)) {
    return null;
  }

  const server: RTCIceServer = { urls };
  if (typeof source.username === "string") {
    server.username = source.username;
  }
  if (typeof source.credential === "string") {
    server.credential = source.credential;
  }

  return server;
}

function readIceServersFromEnv(): RTCIceServer[] {
  const raw = String(import.meta.env.VITE_RTC_ICE_SERVERS_JSON || "").trim();
  if (!raw) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_ICE_SERVERS;
    }

    const normalized = parsed
      .map((item) => normalizeIceServer(item))
      .filter((item): item is RTCIceServer => Boolean(item));

    return normalized.length > 0 ? normalized : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

function readPositiveIntFromEnv(name: string, fallback: number): number {
  const raw = Number(import.meta.env[name as keyof ImportMetaEnv] || "");
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(0, Math.floor(raw));
}

const RTC_ICE_SERVERS = readIceServersFromEnv();
const RTC_ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  String(import.meta.env.VITE_RTC_ICE_TRANSPORT_POLICY || "").trim().toLowerCase() === "relay"
    ? "relay"
    : "all";
const RTC_RECONNECT_MAX_ATTEMPTS = readPositiveIntFromEnv("VITE_RTC_RECONNECT_MAX_ATTEMPTS", 3);
const RTC_RECONNECT_BASE_DELAY_MS = Math.max(300, readPositiveIntFromEnv("VITE_RTC_RECONNECT_BASE_DELAY_MS", 1000));
const RTC_RECONNECT_MAX_DELAY_MS = Math.max(
  RTC_RECONNECT_BASE_DELAY_MS,
  readPositiveIntFromEnv("VITE_RTC_RECONNECT_MAX_DELAY_MS", 8000)
);
const ERROR_TOAST_THROTTLE_MS = 12000;
const REMOTE_SPEAKING_ON_THRESHOLD = 0.055;
const REMOTE_SPEAKING_OFF_THRESHOLD = 0.025;
const REMOTE_SPEAKING_HOLD_MS = 450;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: RTC_ICE_SERVERS,
  iceTransportPolicy: RTC_ICE_TRANSPORT_POLICY
};

export function useVoiceCallRuntime({
  localUserId,
  roomSlug,
  roomVoiceTargets,
  selectedInputId,
  selectedOutputId,
  micMuted,
  micTestLevel,
  audioMuted,
  outputVolume,
  t,
  pushToast,
  pushCallLog,
  sendWsEvent,
  setCallStatus,
  setLastCallPeer
}: UseVoiceCallRuntimeArgs) {
  const [roomVoiceConnected, setRoomVoiceConnected] = useState(false);
  const [connectedPeerUserIds, setConnectedPeerUserIds] = useState<string[]>([]);
  const [remoteMutedPeerUserIds, setRemoteMutedPeerUserIds] = useState<string[]>([]);
  const [remoteSpeakingPeerUserIds, setRemoteSpeakingPeerUserIds] = useState<string[]>([]);
  const [remoteAudioMutedPeerUserIds, setRemoteAudioMutedPeerUserIds] = useState<string[]>([]);
  const roomVoiceConnectedRef = useRef(false);
  const roomVoiceTargetsRef = useRef<PresenceMember[]>(roomVoiceTargets);
  const peersRef = useRef<Map<string, {
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
    speakingAnimationFrameId: number;
    speakingAnalyser: AnalyserNode | null;
    speakingData: Uint8Array<ArrayBuffer> | null;
    reconnectAttempts: number;
    reconnectTimer: number | null;
  }>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const ensurePeerConnectionRef = useRef<((targetUserId: string, targetLabel: string) => RTCPeerConnection) | null>(null);
  const startOfferRef = useRef<((targetUserId: string, targetLabel: string) => Promise<void>) | null>(null);
  const lastToastRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const localSpeakingRef = useRef(false);
  const localSpeakingLastAboveAtRef = useRef(0);
  const lastSentMicStateRef = useRef<{ muted: boolean; speaking: boolean; audioMuted: boolean } | null>(null);

  const pushToastThrottled = useCallback((key: string, message: string) => {
    const now = Date.now();
    const isSameError = lastToastRef.current.key === key;
    const isInThrottleWindow = now - lastToastRef.current.at < ERROR_TOAST_THROTTLE_MS;

    if (isSameError && isInThrottleWindow) {
      return;
    }

    lastToastRef.current = { key, at: now };
    pushToast(message);
  }, [pushToast]);

  const syncPeerVoiceState = useCallback(() => {
    const mutedIds: string[] = [];
    const speakingIds: string[] = [];
    const audioMutedIds: string[] = [];

    for (const [userId, peer] of peersRef.current.entries()) {
      if (peer.isRemoteMicMuted) {
        mutedIds.push(userId);
      }
      if (peer.isRemoteSpeaking) {
        speakingIds.push(userId);
      }
      if (peer.isRemoteAudioMuted) {
        audioMutedIds.push(userId);
      }
    }

    setRemoteMutedPeerUserIds(mutedIds);
    setRemoteSpeakingPeerUserIds(speakingIds);
    setRemoteAudioMutedPeerUserIds(audioMutedIds);
  }, []);

  const shouldInitiateOffer = useCallback((targetUserId: string) => {
    const local = String(localUserId || "").trim();
    const target = String(targetUserId || "").trim();
    if (!target) {
      return false;
    }
    if (!local) {
      return true;
    }
    return local.localeCompare(target) < 0;
  }, [localUserId]);

  const getAudioConstraints = useCallback((): MediaTrackConstraints | boolean => {
    return selectedInputId && selectedInputId !== "default"
      ? { deviceId: { exact: selectedInputId } }
      : true;
  }, [selectedInputId]);

  const applyRemoteAudioOutput = useCallback(async (element: HTMLAudioElement) => {
    element.muted = audioMuted;
    element.volume = Math.max(0, Math.min(1, outputVolume / 100));

    const sinkId = selectedOutputId && selectedOutputId !== "default" ? selectedOutputId : "";
    const withSink = element as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
      sinkId?: string;
    };

    if (typeof withSink.setSinkId === "function") {
      try {
        const currentSink = String(withSink.sinkId || "");
        if (currentSink !== sinkId) {
          await withSink.setSinkId(sinkId);
        }
      } catch (error) {
        pushCallLog(`audio output switch failed: ${(error as Error).message}`);
      }
    }
  }, [audioMuted, outputVolume, selectedOutputId, pushCallLog]);

  const updateCallStatus = useCallback(() => {
    const peers = Array.from(peersRef.current.values());
    const connectedUserIds = Array.from(peersRef.current.entries())
      .filter(([, peer]) => peer.connection.connectionState === "connected" || peer.hasRemoteTrack)
      .map(([userId]) => userId);
    setConnectedPeerUserIds(connectedUserIds);

    const anyConnected = peers.some((peer) => peer.connection.connectionState === "connected" || peer.hasRemoteTrack);
    if (anyConnected) {
      setCallStatus("active");
      return;
    }

    const anyConnecting = peers.some((peer) => {
      const state = peer.connection.connectionState;
      return state === "connecting" || state === "new";
    });
    if (anyConnecting) {
      setCallStatus("connecting");
      return;
    }

    setCallStatus("idle");
  }, [setCallStatus]);

  const clearPeerReconnectTimer = useCallback((targetUserId: string) => {
    const peer = peersRef.current.get(targetUserId);
    if (!peer || peer.reconnectTimer === null) {
      return;
    }

    window.clearTimeout(peer.reconnectTimer);
    peer.reconnectTimer = null;
    decrementVoiceCounter("runtimeReconnectTimers");
    logVoiceDiagnostics("runtime reconnect timer cleared", { targetUserId });
  }, []);

  const releaseLocalStream = useCallback(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    decrementVoiceCounter("runtimeLocalStreams");
    logVoiceDiagnostics("runtime local stream released");
  }, []);

  const closePeer = useCallback((targetUserId: string, reason?: string) => {
    const peer = peersRef.current.get(targetUserId);
    if (!peer) {
      return;
    }

    clearPeerReconnectTimer(targetUserId);
    peer.connection.onicecandidate = null;
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
    peer.speakingAnalyser = null;
    peer.speakingData = null;
    peer.connection.close();
    peer.audioElement.pause();
    peer.audioElement.srcObject = null;
    peer.audioElement.remove();
    peersRef.current.delete(targetUserId);
    decrementVoiceCounter("runtimePeers");
    decrementVoiceCounter("runtimeAudioElements");
    logVoiceDiagnostics("runtime peer closed", { targetUserId, label: peer.label });
    syncPeerVoiceState();

    if (reason) {
      pushCallLog(reason);
    }

    updateCallStatus();
  }, [clearPeerReconnectTimer, pushCallLog, updateCallStatus, syncPeerVoiceState]);

  const teardownRoom = useCallback((reason?: string) => {
    const peerIds = Array.from(peersRef.current.keys());
    peerIds.forEach((targetUserId) => {
      closePeer(targetUserId);
    });
    releaseLocalStream();
    roomVoiceConnectedRef.current = false;
    setRoomVoiceConnected(false);
    setConnectedPeerUserIds([]);
    setRemoteMutedPeerUserIds([]);
    setRemoteSpeakingPeerUserIds([]);
    setRemoteAudioMutedPeerUserIds([]);
    setLastCallPeer("");
    setCallStatus("idle");

    if (reason) {
      pushCallLog(reason);
    }
  }, [closePeer, releaseLocalStream, setCallStatus, setLastCallPeer, pushCallLog]);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      pushToastThrottled("browser-unsupported", t("settings.browserUnsupported"));
      throw new Error("MediaDevicesUnsupported");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioConstraints(),
      video: false
    });

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !micMuted;
    });

    localStreamRef.current = stream;
    incrementVoiceCounter("runtimeLocalStreams");
    logVoiceDiagnostics("runtime local stream acquired", {
      selectedInputId: selectedInputId || "default"
    });
    return stream;
  }, [getAudioConstraints, micMuted, t, pushToastThrottled, selectedInputId]);

  const attachLocalTracks = useCallback(async (connection: RTCPeerConnection) => {
    const stream = await ensureLocalStream();
    const existingTrackIds = new Set(connection.getSenders().map((sender) => sender.track?.id).filter(Boolean));
    stream.getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        connection.addTrack(track, stream);
      }
    });
  }, [ensureLocalStream]);

  const scheduleReconnect = useCallback((targetUserId: string, trigger: string) => {
    if (!roomVoiceConnectedRef.current) {
      return;
    }

    if (!shouldInitiateOffer(targetUserId)) {
      closePeer(targetUserId, `rtc ${trigger}, waiting remote re-offer`);
      return;
    }

    const peer = peersRef.current.get(targetUserId);
    if (!peer) {
      return;
    }

    if (peer.reconnectTimer !== null) {
      return;
    }

    if (peer.reconnectAttempts >= RTC_RECONNECT_MAX_ATTEMPTS) {
      closePeer(targetUserId, `rtc ${trigger}, reconnect exhausted: ${peer.label}`);
      return;
    }

    const attempt = peer.reconnectAttempts + 1;
    peer.reconnectAttempts = attempt;
    const delay = Math.min(
      RTC_RECONNECT_MAX_DELAY_MS,
      RTC_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1)
    );

    updateCallStatus();
    pushCallLog(`rtc ${trigger}, reconnect ${peer.label} in ${delay}ms (${attempt}/${RTC_RECONNECT_MAX_ATTEMPTS})`);

    peer.reconnectTimer = window.setTimeout(async () => {
      const current = peersRef.current.get(targetUserId);
      if (current) {
        current.reconnectTimer = null;
        decrementVoiceCounter("runtimeReconnectTimers");
      }

      try {
        const label = peersRef.current.get(targetUserId)?.label || targetUserId;
        await startOfferRef.current?.(targetUserId, label);
      } catch (error) {
        pushCallLog(`reconnect attempt failed: ${(error as Error).message}`);
      }
    }, delay);
    incrementVoiceCounter("runtimeReconnectTimers");
    logVoiceDiagnostics("runtime reconnect timer scheduled", {
      targetUserId,
      trigger,
      delay,
      attempt
    });
  }, [closePeer, pushCallLog, updateCallStatus, shouldInitiateOffer]);

  const ensurePeerConnection = useCallback((targetUserId: string, targetLabel: string) => {
    const existing = peersRef.current.get(targetUserId);
    if (existing) {
      if (existing.label !== targetLabel) {
        existing.label = targetLabel;
      }
      return existing.connection;
    }

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
    document.body.appendChild(remoteAudioElement);

    const connection = new RTCPeerConnection(RTC_CONFIG);
    const peerContext = {
      connection,
      audioElement: remoteAudioElement,
      label: targetLabel,
      hasRemoteTrack: false,
      isRemoteMicMuted: false,
      isRemoteSpeaking: false,
      isRemoteAudioMuted: false,
      hasRemoteSpeakingSignal: false,
      speakingLastAboveAt: 0,
      speakingAudioContext: null as AudioContext | null,
      speakingAnimationFrameId: 0,
      speakingAnalyser: null as AnalyserNode | null,
      speakingData: null as Uint8Array<ArrayBuffer> | null,
      reconnectAttempts: 0,
      reconnectTimer: null as number | null
    };
    peersRef.current.set(targetUserId, peerContext);
    incrementVoiceCounter("runtimePeers");
    incrementVoiceCounter("runtimeAudioElements");
    logVoiceDiagnostics("runtime peer created", {
      targetUserId,
      targetLabel
    });

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      sendWsEvent(
        "call.ice",
        {
          targetUserId,
          signal: event.candidate.toJSON()
        },
        { maxRetries: 1 }
      );
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      pushCallLog(`rtc state ${targetLabel || targetUserId}: ${state}`);
      logVoiceDiagnostics("runtime peer connection state", {
        targetUserId,
        targetLabel,
        state
      });
      if (state === "connected") {
        const peer = peersRef.current.get(targetUserId);
        if (peer) {
          clearPeerReconnectTimer(targetUserId);
          peer.reconnectAttempts = 0;
        }
        updateCallStatus();
      } else if (state === "failed" || state === "disconnected") {
        scheduleReconnect(targetUserId, state);
      } else if (state === "closed") {
        closePeer(targetUserId);
      } else {
        updateCallStatus();
      }
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        pushCallLog(`remote track missing stream <- ${targetLabel || targetUserId}`);
        return;
      }

      pushCallLog(`remote track attached <- ${targetLabel || targetUserId}`);
      logVoiceDiagnostics("runtime remote track attached", {
        targetUserId,
        targetLabel,
        streamId: stream.id
      });
      remoteAudioElement.srcObject = stream;
      const peer = peersRef.current.get(targetUserId);
      if (peer) {
        peer.hasRemoteTrack = true;

        if (!peer.speakingAudioContext) {
          const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Context) {
            const speakingAudioContext = new Context();
            const speakingAnalyser = speakingAudioContext.createAnalyser();
            speakingAnalyser.fftSize = 512;
            speakingAnalyser.smoothingTimeConstant = 0.8;
            const source = speakingAudioContext.createMediaStreamSource(stream);
            source.connect(speakingAnalyser);

            peer.speakingAudioContext = speakingAudioContext;
            peer.speakingAnalyser = speakingAnalyser;
            peer.speakingData = new Uint8Array(new ArrayBuffer(speakingAnalyser.fftSize));

            const tickSpeaking = () => {
              const current = peersRef.current.get(targetUserId);
              if (!current || !current.speakingAnalyser || !current.speakingData) {
                return;
              }

              current.speakingAnalyser.getByteTimeDomainData(current.speakingData);
              let sum = 0;
              for (let index = 0; index < current.speakingData.length; index += 1) {
                const normalized = (current.speakingData[index] - 128) / 128;
                sum += normalized * normalized;
              }

              const rms = Math.sqrt(sum / current.speakingData.length);
              const now = Date.now();

              if (current.hasRemoteSpeakingSignal) {
                current.speakingAnimationFrameId = requestAnimationFrame(tickSpeaking);
                return;
              }

              if (rms >= REMOTE_SPEAKING_ON_THRESHOLD) {
                current.speakingLastAboveAt = now;
                if (!current.isRemoteMicMuted && !current.isRemoteSpeaking) {
                  current.isRemoteSpeaking = true;
                  syncPeerVoiceState();
                }
              } else if (
                current.isRemoteSpeaking
                && (current.isRemoteMicMuted || (rms <= REMOTE_SPEAKING_OFF_THRESHOLD && now - current.speakingLastAboveAt > REMOTE_SPEAKING_HOLD_MS))
              ) {
                current.isRemoteSpeaking = false;
                syncPeerVoiceState();
              }

              current.speakingAnimationFrameId = requestAnimationFrame(tickSpeaking);
            };

            peer.speakingAnimationFrameId = requestAnimationFrame(tickSpeaking);
          }
        }
      }
      void applyRemoteAudioOutput(remoteAudioElement);
      updateCallStatus();
      void remoteAudioElement.play()
        .then(() => {
          pushCallLog(`remote audio playing <- ${targetLabel || targetUserId}`);
          logVoiceDiagnostics("runtime remote audio playing", {
            targetUserId,
            targetLabel
          });
        })
        .catch((error) => {
          pushCallLog(`remote audio play failed (${targetLabel || targetUserId}): ${(error as Error).message}`);
          logVoiceDiagnostics("runtime remote audio play failed", {
            targetUserId,
            targetLabel,
            message: (error as Error).message
          });
        });
    };

    void applyRemoteAudioOutput(remoteAudioElement);
    return connection;
  }, [sendWsEvent, applyRemoteAudioOutput, clearPeerReconnectTimer, closePeer, scheduleReconnect, updateCallStatus, syncPeerVoiceState]);

  ensurePeerConnectionRef.current = ensurePeerConnection;

  const startOffer = useCallback(async (targetUserId: string, targetLabel: string) => {
    const normalizedTarget = targetUserId.trim();
    if (!normalizedTarget || !roomVoiceConnectedRef.current) {
      return;
    }

    try {
      const connection = ensurePeerConnection(normalizedTarget, targetLabel);
      await attachLocalTracks(connection);
      const offer = await connection.createOffer({ offerToReceiveAudio: true });
      await connection.setLocalDescription(offer);

      const signal: RTCSessionDescriptionInit = {
        type: offer.type,
        sdp: offer.sdp || ""
      };

      const requestId = sendWsEvent(
        "call.offer",
        {
          targetUserId: normalizedTarget,
          signal
        },
        { maxRetries: 1 }
      );

      if (!requestId) {
        pushCallLog("call.offer skipped: socket unavailable");
        return;
      }

      setLastCallPeer(targetLabel || normalizedTarget);
      updateCallStatus();
      pushCallLog(`call.offer sent -> ${targetLabel || normalizedTarget}`);
    } catch (error) {
      const errorName = (error as { name?: string })?.name || "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        pushToastThrottled("media-denied", t("settings.mediaDenied"));
      } else {
        pushToastThrottled("devices-load-failed", t("settings.devicesLoadFailed"));
      }
      pushCallLog(`call.offer failed (${targetLabel || normalizedTarget}): ${(error as Error).message}`);
      closePeer(normalizedTarget);
    }
  }, [roomVoiceConnectedRef, ensurePeerConnection, attachLocalTracks, sendWsEvent, setLastCallPeer, updateCallStatus, pushCallLog, t, pushToastThrottled, closePeer]);

  startOfferRef.current = startOffer;

  const syncRoomTargets = useCallback(async () => {
    if (!roomVoiceConnectedRef.current) {
      return;
    }

    const targetsById = new Map(
      roomVoiceTargetsRef.current
        .map((member) => ({
          userId: String(member.userId || "").trim(),
          userName: String(member.userName || member.userId || "").trim()
        }))
        .filter((member) => member.userId)
        .map((member) => [member.userId, member.userName || member.userId])
    );

    const toDisconnect = Array.from(peersRef.current.keys()).filter((userId) => !targetsById.has(userId));
    toDisconnect.forEach((userId) => {
      sendWsEvent("call.hangup", { targetUserId: userId, reason: "left_room" }, { maxRetries: 1 });
      closePeer(userId, `peer left room: ${userId}`);
    });

    for (const [userId, userName] of targetsById) {
      const exists = peersRef.current.has(userId);
      if (!exists) {
        if (shouldInitiateOffer(userId)) {
          await startOffer(userId, userName);
        } else {
          pushCallLog(`voice room awaiting offer <- ${userName}`);
        }
      }
    }

    updateCallStatus();
  }, [sendWsEvent, closePeer, startOffer, updateCallStatus, shouldInitiateOffer, pushCallLog]);

  const connectRoom = useCallback(async () => {
    roomVoiceConnectedRef.current = true;
    setRoomVoiceConnected(true);
    pushCallLog("voice room connect requested");
    sendWsEvent("call.mic_state", {
      muted: micMuted,
      speaking: !micMuted && localSpeakingRef.current,
      audioMuted
    }, { maxRetries: 1 });

    if (roomVoiceTargetsRef.current.length === 0) {
      pushCallLog("voice room waiting for participants");
      setCallStatus("idle");
      return;
    }

    await syncRoomTargets();
  }, [pushCallLog, setCallStatus, syncRoomTargets, sendWsEvent, micMuted, audioMuted]);

  const disconnectRoom = useCallback(() => {
    const peerIds = Array.from(peersRef.current.keys());
    peerIds.forEach((userId) => {
      sendWsEvent("call.hangup", { targetUserId: userId, reason: "manual" }, { maxRetries: 1 });
      closePeer(userId);
    });

    releaseLocalStream();
    roomVoiceConnectedRef.current = false;
    setRoomVoiceConnected(false);
    setConnectedPeerUserIds([]);
    setRemoteMutedPeerUserIds([]);
    setRemoteSpeakingPeerUserIds([]);
    setRemoteAudioMutedPeerUserIds([]);
    setLastCallPeer("");
    setCallStatus("idle");
    pushCallLog("voice room disconnected");
  }, [sendWsEvent, closePeer, releaseLocalStream, setLastCallPeer, setCallStatus, pushCallLog]);

  const handleIncomingSignal = useCallback(async (
    eventType: "call.offer" | "call.answer" | "call.ice",
    payload: CallSignalPayload
  ) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    const fromUserName = String(payload.fromUserName || fromUserId || "unknown").trim();
    const signal = payload.signal;
    if (!fromUserId || !signal || typeof signal !== "object") {
      pushCallLog(`${eventType} ignored: invalid payload`);
      logVoiceDiagnostics("runtime signal ignored", {
        eventType,
        fromUserId,
        hasSignalObject: Boolean(signal && typeof signal === "object")
      });
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
        const connection = ensurePeerConnection(fromUserId, fromUserName);
        const peer = peersRef.current.get(fromUserId);
        if (peer) {
          clearPeerReconnectTimer(fromUserId);
          peer.reconnectAttempts = 0;
        }

        await attachLocalTracks(connection);
        await connection.setRemoteDescription(new RTCSessionDescription(signal as unknown as RTCSessionDescriptionInit));

        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);

        const answerSignal: RTCSessionDescriptionInit = {
          type: answer.type,
          sdp: answer.sdp || ""
        };

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
        const connection = ensurePeerConnection(fromUserId, fromUserName);
        const peer = peersRef.current.get(fromUserId);
        if (peer) {
          clearPeerReconnectTimer(fromUserId);
          peer.reconnectAttempts = 0;
        }

        await connection.setRemoteDescription(new RTCSessionDescription(signal as unknown as RTCSessionDescriptionInit));
        setLastCallPeer(fromUserName);
        updateCallStatus();
        pushCallLog(`call answered by ${fromUserName}`);
      } catch (error) {
        pushCallLog(`call.answer handling failed: ${(error as Error).message}`);
      }

      return;
    }

    if (eventType === "call.ice") {
      try {
        const connection = ensurePeerConnection(fromUserId, fromUserName);
        const candidate = (signal as { candidate?: RTCIceCandidateInit }).candidate
          ? (signal as { candidate: RTCIceCandidateInit }).candidate
          : (signal as RTCIceCandidateInit);

        if (!candidate || typeof candidate.candidate !== "string") {
          return;
        }

        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        pushCallLog(`call.ice handling failed: ${(error as Error).message}`);
      }
    }
  }, [sendWsEvent, ensurePeerConnection, clearPeerReconnectTimer, attachLocalTracks, setLastCallPeer, updateCallStatus, pushCallLog, closePeer]);

  const handleIncomingTerminal = useCallback((eventType: "call.reject" | "call.hangup", payload: CallTerminalPayload) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    const fromUserName = String(payload.fromUserName || fromUserId || "unknown").trim();
    const reason = String(payload.reason || "").trim();
    if (fromUserId) {
      closePeer(fromUserId, `${eventType} from ${fromUserName}${reason ? ` (${reason})` : ""}`);
      return;
    }

    updateCallStatus();
  }, [closePeer, updateCallStatus]);

  const handleIncomingMicState = useCallback((payload: CallMicStatePayload) => {
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
  }, [syncPeerVoiceState]);

  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !micMuted;
    });
  }, [micMuted]);

  useEffect(() => {
    peersRef.current.forEach((peer) => {
      void applyRemoteAudioOutput(peer.audioElement);
    });
  }, [applyRemoteAudioOutput]);

  useEffect(() => {
    const connections = Array.from(peersRef.current.values()).map((item) => item.connection);
    if (connections.length === 0 || !localStreamRef.current) {
      return;
    }

    let cancelled = false;

    const replaceAudioTrack = async () => {
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });

        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const nextTrack = nextStream.getAudioTracks()[0];
        if (!nextTrack) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextTrack.enabled = !micMuted;

        await Promise.all(
          connections.map(async (connection) => {
            const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
            if (sender) {
              await sender.replaceTrack(nextTrack);
            }
          })
        );

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = nextStream;
        pushCallLog("input device switched for active call");
        logVoiceDiagnostics("runtime input track replaced", {
          selectedInputId: selectedInputId || "default"
        });
      } catch (error) {
        if (!cancelled) {
          pushToastThrottled("devices-load-failed", t("settings.devicesLoadFailed"));
          pushCallLog(`input device switch failed: ${(error as Error).message}`);
        }
      }
    };

    void replaceAudioTrack();

    return () => {
      cancelled = true;
    };
  }, [selectedInputId, getAudioConstraints, micMuted, t, pushToastThrottled, pushCallLog]);

  useEffect(() => {
    logVoiceDiagnostics("runtime mount", { roomSlug });
    return () => {
      logVoiceDiagnostics("runtime unmount", { roomSlug });
    };
  }, [roomSlug]);

  useEffect(() => {
    return () => {
      teardownRoom();
    };
  }, [teardownRoom]);

  useEffect(() => {
    roomVoiceTargetsRef.current = roomVoiceTargets;
  }, [roomVoiceTargets]);

  useEffect(() => {
    if (!roomVoiceConnectedRef.current) {
      return;
    }

    void syncRoomTargets();
  }, [roomVoiceTargets, syncRoomTargets]);

  useEffect(() => {
    const now = Date.now();

    if (!micMuted && micTestLevel >= REMOTE_SPEAKING_ON_THRESHOLD) {
      localSpeakingRef.current = true;
      localSpeakingLastAboveAtRef.current = now;
    } else if (
      localSpeakingRef.current
      && (micMuted || (micTestLevel <= REMOTE_SPEAKING_OFF_THRESHOLD && now - localSpeakingLastAboveAtRef.current > REMOTE_SPEAKING_HOLD_MS))
    ) {
      localSpeakingRef.current = false;
    }

    if (!roomVoiceConnectedRef.current) {
      return;
    }

    const nextPayload = {
      muted: micMuted,
      speaking: !micMuted && localSpeakingRef.current,
      audioMuted
    };

    const lastPayload = lastSentMicStateRef.current;
    const changed = !lastPayload
      || lastPayload.muted !== nextPayload.muted
      || lastPayload.speaking !== nextPayload.speaking
      || lastPayload.audioMuted !== nextPayload.audioMuted;

    if (!changed) {
      return;
    }

    lastSentMicStateRef.current = nextPayload;
    sendWsEvent("call.mic_state", nextPayload, { maxRetries: 1 });
  }, [micMuted, micTestLevel, audioMuted, sendWsEvent]);

  useEffect(() => {
    teardownRoom();
  }, [roomSlug, teardownRoom]);

  return {
    roomVoiceConnected,
    connectedPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal,
    handleIncomingTerminal,
    handleIncomingMicState
  };
}
