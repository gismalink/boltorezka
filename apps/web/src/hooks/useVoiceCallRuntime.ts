import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioQuality, PresenceMember } from "../domain";
import {
  decrementVoiceCounter,
  incrementVoiceCounter,
  logVoiceDiagnostics
} from "../utils/voiceDiagnostics";
import {
  ERROR_TOAST_THROTTLE_MS,
  REMOTE_SPEAKING_HOLD_MS,
  REMOTE_SPEAKING_OFF_THRESHOLD,
  REMOTE_SPEAKING_ON_THRESHOLD,
  RTC_CONFIG,
  RTC_INBOUND_STALL_TICKS,
  RTC_RECONNECT_BASE_DELAY_MS,
  RTC_RECONNECT_MAX_ATTEMPTS,
  RTC_RECONNECT_MAX_DELAY_MS,
  RTC_STATS_POLL_MS,
  TARGET_NOT_IN_ROOM_BLOCK_MS,
  TARGET_NOT_IN_ROOM_RESYNC_GRACE_MS
} from "./voiceCallConfig";
import { bindVoicePeerConnectionHandlers } from "./voiceCallPeerConnectionHandlers";
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
  UseVoiceCallRuntimeArgs,
  VoicePeerContext
} from "./voiceCallTypes";
import { buildLocalDescriptionAfterIceGathering } from "./voiceCallUtils";
import { useVoiceRuntimeMediaEffects } from "./useVoiceRuntimeMediaEffects";

const AUDIO_QUALITY_MAX_BITRATE: Record<AudioQuality, number> = {
  low: 24000,
  standard: 40000,
  high: 64000
};

const AUDIO_QUALITY_SAMPLE_RATE: Record<AudioQuality, number> = {
  low: 16000,
  standard: 24000,
  high: 48000
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
  serverAudioQuality,
  t,
  pushToast,
  pushCallLog,
  sendWsEvent,
  setCallStatus,
  setLastCallPeer
}: UseVoiceCallRuntimeArgs) {
  const [roomVoiceConnected, setRoomVoiceConnected] = useState(false);
  const [connectedPeerUserIds, setConnectedPeerUserIds] = useState<string[]>([]);
  const [connectingPeerUserIds, setConnectingPeerUserIds] = useState<string[]>([]);
  const [remoteMutedPeerUserIds, setRemoteMutedPeerUserIds] = useState<string[]>([]);
  const [remoteSpeakingPeerUserIds, setRemoteSpeakingPeerUserIds] = useState<string[]>([]);
  const [remoteAudioMutedPeerUserIds, setRemoteAudioMutedPeerUserIds] = useState<string[]>([]);
  const roomVoiceConnectedRef = useRef(false);
  const roomVoiceTargetsRef = useRef<PresenceMember[]>(roomVoiceTargets);
  const peersRef = useRef<Map<string, VoicePeerContext>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const ensurePeerConnectionRef = useRef<((targetUserId: string, targetLabel: string) => RTCPeerConnection) | null>(null);
  const startOfferRef = useRef<((
    targetUserId: string,
    targetLabel: string,
    options?: { iceRestart?: boolean; reason?: string }
  ) => Promise<void>) | null>(null);
  const syncRoomTargetsRef = useRef<(() => Promise<void>) | null>(null);
  const requestTargetByIdRef = useRef<Map<string, { targetUserId: string; eventType: string }>>(new Map());
  const blockedTargetUntilRef = useRef<Map<string, number>>(new Map());
  const roomTargetsResyncTimerRef = useRef<number | null>(null);
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

  const isTargetTemporarilyBlocked = useCallback((targetUserId: string) => {
    const until = blockedTargetUntilRef.current.get(targetUserId) || 0;
    if (until <= Date.now()) {
      blockedTargetUntilRef.current.delete(targetUserId);
      return false;
    }
    return true;
  }, []);

  const rememberRequestTarget = useCallback((requestId: string | null, eventType: string, targetUserId: string) => {
    const normalizedRequestId = String(requestId || "").trim();
    const normalizedTarget = String(targetUserId || "").trim();
    if (!normalizedRequestId || !normalizedTarget) {
      return;
    }

    requestTargetByIdRef.current.set(normalizedRequestId, {
      targetUserId: normalizedTarget,
      eventType
    });
  }, []);

  const clearRoomTargetsResyncTimer = useCallback(() => {
    if (roomTargetsResyncTimerRef.current !== null) {
      window.clearTimeout(roomTargetsResyncTimerRef.current);
      roomTargetsResyncTimerRef.current = null;
    }
  }, []);

  const scheduleRoomTargetsResync = useCallback((delayMs: number) => {
    clearRoomTargetsResyncTimer();
    roomTargetsResyncTimerRef.current = window.setTimeout(() => {
      roomTargetsResyncTimerRef.current = null;
      if (!roomVoiceConnectedRef.current) {
        return;
      }
      const sync = syncRoomTargetsRef.current;
      if (sync) {
        void sync();
      }
    }, Math.max(0, delayMs));
  }, [clearRoomTargetsResyncTimer]);

  const getAudioConstraints = useCallback((): MediaTrackConstraints => {
    const sampleRate = AUDIO_QUALITY_SAMPLE_RATE[serverAudioQuality] || AUDIO_QUALITY_SAMPLE_RATE.standard;
    const base: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: sampleRate },
      channelCount: { ideal: serverAudioQuality === "high" ? 2 : 1 }
    };

    if (selectedInputId && selectedInputId !== "default") {
      return {
        ...base,
        deviceId: { exact: selectedInputId }
      };
    }

    return base;
  }, [selectedInputId, serverAudioQuality]);

  const applyAudioQualityToConnection = useCallback(async (
    connection: RTCPeerConnection,
    targetLabel: string
  ) => {
    const maxBitrate = AUDIO_QUALITY_MAX_BITRATE[serverAudioQuality] || AUDIO_QUALITY_MAX_BITRATE.standard;
    const audioSenders = connection
      .getSenders()
      .filter((sender) => sender.track?.kind === "audio");

    await Promise.all(
      audioSenders.map(async (sender) => {
        try {
          const params = sender.getParameters();
          const encodings = Array.isArray(params.encodings) && params.encodings.length > 0
            ? params.encodings
            : [{}];

          encodings[0] = {
            ...encodings[0],
            maxBitrate
          };

          params.encodings = encodings;
          await sender.setParameters(params);
        } catch (error) {
          pushCallLog(`audio quality apply skipped (${targetLabel}): ${(error as Error).message}`);
        }
      })
    );
  }, [serverAudioQuality, pushCallLog]);

  const applyRemoteAudioOutput = useCallback(async (element: HTMLAudioElement) => {
    const route = String(element.dataset.audioRoute || "element");
    element.muted = route === "context" ? true : audioMuted;
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
        try {
          await withSink.setSinkId("");
          pushCallLog("audio output fallback applied: default sink");
        } catch (fallbackError) {
          pushCallLog(`audio output fallback failed: ${(fallbackError as Error).message}`);
        }
      }
    }

    if (route === "context") {
      return;
    }

    if (!element.paused || audioMuted || !element.srcObject) {
      return;
    }

    try {
      await element.play();
    } catch (error) {
      pushCallLog(`audio play retry failed: ${(error as Error).message}`);
    }
  }, [audioMuted, outputVolume, selectedOutputId, pushCallLog]);

  const retryRemoteAudioPlayback = useCallback((reason: string) => {
    if (audioMuted) {
      return;
    }

    peersRef.current.forEach((peer, userId) => {
      const element = peer.audioElement;
      if (!element.srcObject || !element.paused) {
        return;
      }

      void applyRemoteAudioOutput(element);
      void element.play()
        .then(() => {
          pushCallLog(`remote audio resumed (${reason}) <- ${peer.label || userId}`);
        })
        .catch((error) => {
          pushCallLog(`remote audio resume failed (${reason}, ${peer.label || userId}): ${(error as Error).message}`);
        });
    });
  }, [audioMuted, applyRemoteAudioOutput, pushCallLog]);

  const updateCallStatus = useCallback(() => {
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
    setConnectedPeerUserIds(connectedUserIds);
    setConnectingPeerUserIds(connectingUserIds);

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

  const clearPeerStatsTimer = useCallback((targetUserId: string) => {
    const peer = peersRef.current.get(targetUserId);
    if (!peer || peer.statsTimer === null) {
      return;
    }

    window.clearInterval(peer.statsTimer);
    peer.statsTimer = null;
  }, []);

  const startPeerStatsMonitor = useCallback((targetUserId: string, targetLabel: string) => {
    const peer = peersRef.current.get(targetUserId);
    if (!peer || peer.statsTimer !== null) {
      return;
    }

    peer.statsTimer = window.setInterval(() => {
      const current = peersRef.current.get(targetUserId);
      if (!current) {
        return;
      }

      const state = current.connection.connectionState;
      if (state !== "connected" && !current.hasRemoteTrack) {
        return;
      }

      void current.connection.getStats()
        .then((report) => {
          let inboundBytes = 0;
          let outboundBytes = 0;
          report.forEach((item) => {
            if (item.type === "inbound-rtp") {
              const mediaType = (item as RTCInboundRtpStreamStats & { mediaType?: string }).mediaType;
              const kind = (item as RTCInboundRtpStreamStats & { kind?: string }).kind;
              const isAudio = mediaType === "audio" || kind === "audio";
              if (!isAudio) {
                return;
              }

              inboundBytes += Number((item as RTCInboundRtpStreamStats).bytesReceived || 0);
              return;
            }

            if (item.type === "outbound-rtp") {
              const mediaType = (item as RTCOutboundRtpStreamStats & { mediaType?: string }).mediaType;
              const kind = (item as RTCOutboundRtpStreamStats & { kind?: string }).kind;
              const isAudio = mediaType === "audio" || kind === "audio";
              if (!isAudio) {
                return;
              }

              outboundBytes += Number((item as RTCOutboundRtpStreamStats).bytesSent || 0);
            }
          });

          const inboundDelta = inboundBytes - current.lastInboundBytes;
          const outboundDelta = outboundBytes - current.lastOutboundBytes;
          current.lastInboundBytes = inboundBytes;
          current.lastOutboundBytes = outboundBytes;

          if (inboundDelta > 0) {
            if (current.inboundStalled) {
              current.inboundStalled = false;
              current.inboundStalledTicks = 0;
              current.stallRecoveryAttempts = 0;
              pushCallLog(`remote inbound audio resumed <- ${targetLabel || targetUserId}`);
            }

            if (!audioMuted && current.audioElement.paused && current.audioElement.srcObject) {
              void applyRemoteAudioOutput(current.audioElement);
              void current.audioElement.play()
                .then(() => {
                  pushCallLog(`remote audio resumed (stats-flow) <- ${targetLabel || targetUserId}`);
                })
                .catch((error) => {
                  pushCallLog(`remote audio resume failed (stats-flow, ${targetLabel || targetUserId}): ${(error as Error).message}`);
                });
            }
            return;
          }

          current.inboundStalledTicks += 1;
          if (!current.inboundStalled && current.inboundStalledTicks >= RTC_INBOUND_STALL_TICKS) {
            current.inboundStalled = true;
            pushCallLog(`remote inbound audio stalled <- ${targetLabel || targetUserId} (in:${inboundDelta} out:${outboundDelta})`);

            if (shouldInitiateOffer(targetUserId) && current.stallRecoveryAttempts < 2 && current.connection.connectionState === "connected") {
              current.stallRecoveryAttempts += 1;
              pushCallLog(`rtc stall recovery offer -> ${targetLabel || targetUserId}`);
              void startOfferRef.current?.(targetUserId, targetLabel || targetUserId, {
                iceRestart: true,
                reason: "inbound-stalled"
              });
            }
          }
        })
        .catch((error) => {
          pushCallLog(`rtc stats failed (${targetLabel || targetUserId}): ${(error as Error).message}`);
        });
    }, RTC_STATS_POLL_MS);
  }, [audioMuted, applyRemoteAudioOutput, pushCallLog, shouldInitiateOffer]);

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
    clearPeerStatsTimer(targetUserId);
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
    peersRef.current.delete(targetUserId);
    decrementVoiceCounter("runtimePeers");
    decrementVoiceCounter("runtimeAudioElements");
    logVoiceDiagnostics("runtime peer closed", { targetUserId, label: peer.label });
    syncPeerVoiceState();

    if (reason) {
      pushCallLog(reason);
    }

    updateCallStatus();
  }, [clearPeerReconnectTimer, clearPeerStatsTimer, pushCallLog, updateCallStatus, syncPeerVoiceState]);

  const resetRoomState = useCallback((options?: { clearRequestState?: boolean }) => {
    const shouldClearRequestState = Boolean(options?.clearRequestState);

    releaseLocalStream();
    roomVoiceConnectedRef.current = false;
    setRoomVoiceConnected(false);
    setConnectedPeerUserIds([]);
    setConnectingPeerUserIds([]);
    setRemoteMutedPeerUserIds([]);
    setRemoteSpeakingPeerUserIds([]);
    setRemoteAudioMutedPeerUserIds([]);
    if (shouldClearRequestState) {
      requestTargetByIdRef.current.clear();
      blockedTargetUntilRef.current.clear();
    }
    clearRoomTargetsResyncTimer();
    setLastCallPeer("");
    setCallStatus("idle");
  }, [releaseLocalStream, clearRoomTargetsResyncTimer, setLastCallPeer, setCallStatus]);

  const teardownRoom = useCallback((reason?: string) => {
    const peerIds = Array.from(peersRef.current.keys());
    peerIds.forEach((targetUserId) => {
      closePeer(targetUserId);
    });
    resetRoomState({ clearRequestState: true });

    if (reason) {
      pushCallLog(reason);
    }
  }, [closePeer, resetRoomState, pushCallLog]);

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
    await applyAudioQualityToConnection(connection, "peer");
  }, [ensureLocalStream, applyAudioQualityToConnection]);

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

  const flushPendingRemoteCandidates = useCallback(async (targetUserId: string, targetLabel: string) => {
    const peer = peersRef.current.get(targetUserId);
    if (!peer) {
      return;
    }

    if (!peer.connection.remoteDescription || peer.pendingRemoteCandidates.length === 0) {
      return;
    }

    const pending = peer.pendingRemoteCandidates.splice(0, peer.pendingRemoteCandidates.length);
    for (const candidate of pending) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        pushCallLog(`call.ice queued handling failed (${targetLabel || targetUserId}): ${(error as Error).message}`);
      }
    }

    pushCallLog(`call.ice queued flushed <- ${targetLabel || targetUserId} (${pending.length})`);
  }, [pushCallLog]);

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
    remoteAudioElement.dataset.audioRoute = "element";
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
      speakingSource: null as MediaStreamAudioSourceNode | null,
      speakingAnimationFrameId: 0,
      speakingAnalyser: null as AnalyserNode | null,
      speakingData: null as Uint8Array<ArrayBuffer> | null,
      speakingGain: null as GainNode | null,
      statsTimer: null as number | null,
      lastInboundBytes: 0,
      lastOutboundBytes: 0,
      inboundStalledTicks: 0,
      inboundStalled: false,
      stallRecoveryAttempts: 0,
      reconnectAttempts: 0,
      reconnectTimer: null as number | null,
      pendingRemoteCandidates: [] as RTCIceCandidateInit[]
    };
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
      applyRemoteAudioOutput,
      syncPeerVoiceState,
      audioMuted,
      outputVolume
    });

    void applyRemoteAudioOutput(remoteAudioElement);
    return connection;
  }, [sendWsEvent, applyRemoteAudioOutput, clearPeerReconnectTimer, closePeer, scheduleReconnect, updateCallStatus, syncPeerVoiceState, retryRemoteAudioPlayback, startPeerStatsMonitor, rememberRequestTarget, audioMuted, outputVolume]);

  ensurePeerConnectionRef.current = ensurePeerConnection;

  const startOffer = useCallback(async (
    targetUserId: string,
    targetLabel: string,
    options?: { iceRestart?: boolean; reason?: string }
  ) => {
    const normalizedTarget = targetUserId.trim();
    if (!normalizedTarget || !roomVoiceConnectedRef.current) {
      return;
    }

    if (isTargetTemporarilyBlocked(normalizedTarget)) {
      return;
    }

    try {
      const connection = ensurePeerConnection(normalizedTarget, targetLabel);
      await attachLocalTracks(connection);
      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
        iceRestart: Boolean(options?.iceRestart)
      });
      await connection.setLocalDescription(offer);

      const { signal, settledBy } = await buildLocalDescriptionAfterIceGathering(connection);
      if (settledBy === "timeout") {
        pushCallLog(`rtc ice gathering timeout before offer -> ${targetLabel || normalizedTarget}`);
      }

      const requestId = sendWsEvent(
        "call.offer",
        {
          targetUserId: normalizedTarget,
          signal
        },
        { maxRetries: 1 }
      );
      rememberRequestTarget(requestId, "call.offer", normalizedTarget);

      if (!requestId) {
        pushCallLog("call.offer skipped: socket unavailable");
        return;
      }

      setLastCallPeer(targetLabel || normalizedTarget);
      updateCallStatus();
      if (options?.iceRestart) {
        pushCallLog(`call.offer ice-restart -> ${targetLabel || normalizedTarget}${options.reason ? ` (${options.reason})` : ""}`);
      }
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
  }, [roomVoiceConnectedRef, ensurePeerConnection, attachLocalTracks, sendWsEvent, setLastCallPeer, updateCallStatus, pushCallLog, t, pushToastThrottled, closePeer, rememberRequestTarget, isTargetTemporarilyBlocked]);

  startOfferRef.current = startOffer;

  useEffect(() => {
    const peers = Array.from(peersRef.current.entries());
    peers.forEach(([userId, peer]) => {
      void applyAudioQualityToConnection(peer.connection, peer.label || userId);
    });
  }, [serverAudioQuality, applyAudioQualityToConnection]);

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
      closePeer(userId, `peer left room: ${userId}`);
    });

    for (const [userId, userName] of targetsById) {
      if (isTargetTemporarilyBlocked(userId)) {
        continue;
      }

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
  }, [closePeer, startOffer, updateCallStatus, shouldInitiateOffer, pushCallLog, isTargetTemporarilyBlocked]);

  syncRoomTargetsRef.current = syncRoomTargets;

  const connectRoom = useCallback(async () => {
    roomVoiceConnectedRef.current = true;
    setRoomVoiceConnected(true);
    pushCallLog("voice room connect requested");

    if (roomVoiceTargetsRef.current.length === 0) {
      pushCallLog("voice room waiting for participants");
      setCallStatus("idle");
      return;
    }

    await syncRoomTargets();
  }, [pushCallLog, setCallStatus, syncRoomTargets]);

  const disconnectRoom = useCallback(() => {
    const activeTargetIds = new Set(
      roomVoiceTargetsRef.current
        .map((member) => String(member.userId || "").trim())
        .filter((userId) => userId.length > 0)
    );

    const peerIds = Array.from(peersRef.current.keys());
    peerIds.forEach((userId) => {
      if (activeTargetIds.has(userId)) {
        const requestId = sendWsEvent("call.hangup", { targetUserId: userId, reason: "manual" }, { maxRetries: 1 });
        rememberRequestTarget(requestId, "call.hangup", userId);
      }
      closePeer(userId);
    });

    resetRoomState();
    pushCallLog("voice room disconnected");
  }, [sendWsEvent, closePeer, pushCallLog, rememberRequestTarget, resetRoomState]);

  const handleIncomingSignal = useCallback(async (
    eventType: "call.offer" | "call.answer" | "call.ice",
    payload: CallSignalPayload
  ) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    const signal = payload.signal;
    if (!fromUserId || !signal || typeof signal !== "object") {
      pushCallLog(`${eventType} ignored: invalid payload`);
      logInvalidSignalPayload({
        eventType,
        fromUserId,
        signal,
        logVoiceDiagnostics
      });
      return;
    }

    await handleIncomingSignalEvent({
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
    });
  }, [sendWsEvent, ensurePeerConnection, clearPeerReconnectTimer, attachLocalTracks, flushPendingRemoteCandidates, setLastCallPeer, updateCallStatus, pushCallLog, closePeer]);

  const handleIncomingTerminal = useCallback((eventType: "call.reject" | "call.hangup", payload: CallTerminalPayload) => {
    handleIncomingTerminalEvent({
      eventType,
      payload,
      closePeer,
      updateCallStatus
    });
  }, [closePeer, updateCallStatus]);

  const handleIncomingMicState = useCallback((payload: CallMicStatePayload) => {
    handleIncomingMicStateEvent({
      payload,
      peersRef,
      syncPeerVoiceState
    });
  }, [syncPeerVoiceState]);

  const handleCallNack = useCallback((payload: CallNackPayload) => {
    handleCallNackEvent({
      payload,
      requestTargetByIdRef,
      blockedTargetUntilRef,
      targetNotInRoomBlockMs: TARGET_NOT_IN_ROOM_BLOCK_MS,
      targetNotInRoomResyncGraceMs: TARGET_NOT_IN_ROOM_RESYNC_GRACE_MS,
      closePeer,
      scheduleRoomTargetsResync
    });
  }, [closePeer, scheduleRoomTargetsResync]);

  useVoiceRuntimeMediaEffects({
    localStreamRef,
    peersRef,
    selectedInputId,
    micMuted,
    audioMuted,
    outputVolume,
    getAudioConstraints,
    applyRemoteAudioOutput,
    retryRemoteAudioPlayback,
    pushCallLog,
    pushToastThrottled,
    t
  });

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

    if (peersRef.current.size === 0) {
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
    connectingPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal,
    handleIncomingTerminal,
    handleIncomingMicState,
    handleCallNack
  };
}
