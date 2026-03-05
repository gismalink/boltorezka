import { useCallback, useEffect, useRef, useState } from "react";
import type { PresenceMember } from "../../domain";
import {
  logVoiceDiagnostics
} from "../../utils/voiceDiagnostics";
import {
  ERROR_TOAST_THROTTLE_MS,
  REMOTE_SPEAKING_HOLD_MS,
  REMOTE_SPEAKING_OFF_THRESHOLD,
  REMOTE_SPEAKING_ON_THRESHOLD,
  RTC_RECONNECT_MAX_ATTEMPTS,
  TARGET_NOT_IN_ROOM_BLOCK_MS,
  TARGET_NOT_IN_ROOM_RESYNC_GRACE_MS
} from "./voiceCallConfig";
import {
  dispatchCallNackForRtc,
  dispatchIncomingMicStateForRtc,
  dispatchIncomingSignalForRtc,
  dispatchIncomingTerminalForRtc
} from "./voiceCallSignalDispatch";
import { flushQueuedRemoteCandidatesForPeer } from "./voiceCallCandidateQueue";
import {
  isDesignatedOfferer,
  type OfferReason,
  OFFER_VIDEO_SYNC_MIN_INTERVAL_MS,
  resolveOfferCadenceBucket,
  resolveOfferMinIntervalMs
} from "./voiceCallOfferPolicy";
import {
  getLastOfferAtForBucket,
  markMakingOffer,
  markOfferInFlight,
  markOfferSentNowForBucket
} from "./voiceCallNegotiationState";
import {
  applyAudioQualityToPeerConnection,
  attachLocalTracksForRtc,
  buildAudioConstraints,
  buildVideoConstraints,
  ensureLocalStreamForRtc,
  releaseLocalStreamForRtc
} from "./voiceCallLocalMedia";
import {
  clearPeerReconnectTimerForTarget,
  clearPeerStatsTimerForTarget,
  schedulePeerReconnectForTarget,
  startPeerStatsMonitorForTarget
} from "./voiceCallPeerRecovery";
import {
  clearRoomTargetsResyncTimerForRtc,
  scheduleRoomTargetsResyncForRtc,
  syncRoomTargetsForRtc
} from "./voiceCallTargetSync";
import {
  closePeerForRtc,
  deriveCallStatusForRtc,
  ensurePeerConnectionForRtc
} from "./voiceCallPeerRegistry";
import type {
  CallMicStatePayload,
  CallNackPayload,
  CallSignalPayload,
  CallTerminalPayload,
  CallVideoStatePayload,
  UseVoiceCallRuntimeArgs,
  VoicePeerContext
} from "./voiceCallTypes";
import { buildLocalDescriptionAfterIceGathering, findSenderByKind, normalizeRtcText } from "./voiceCallUtils";
import { useVoiceRuntimeMediaEffects } from "./useVoiceRuntimeMediaEffects";

const OFFER_TRACE_EVERY_N = 5;
const OFFER_TRACE_MIN_GAP_MS = 30000;

export function useVoiceCallRuntime({
  localUserId,
  roomSlug,
  allowVideoStreaming,
  videoStreamingEnabled,
  roomVoiceTargets,
  selectedInputId,
  selectedOutputId,
  selectedVideoInputId,
  serverVideoResolution,
  serverVideoFps,
  serverVideoEffectType,
  serverVideoPixelFxStrength,
  serverVideoPixelFxPixelSize,
  serverVideoPixelFxGridThickness,
  serverVideoAsciiCellSize,
  serverVideoAsciiContrast,
  serverVideoAsciiColor,
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
  type StartOfferOptions = { iceRestart?: boolean; reason?: OfferReason };
  type StartOfferContext = {
    normalizedTarget: string;
    targetLabel: string;
    reason: OfferReason;
    iceRestart: boolean;
    cadenceBucket: "manual" | "video-sync" | "ice-restart";
  };

  // Core WebRTC orchestration for room calls: peer lifecycle, signaling, reconnects and media sync.
  const [roomVoiceConnected, setRoomVoiceConnected] = useState(false);
  const [connectedPeerUserIds, setConnectedPeerUserIds] = useState<string[]>([]);
  const [connectingPeerUserIds, setConnectingPeerUserIds] = useState<string[]>([]);
  const [remoteMutedPeerUserIds, setRemoteMutedPeerUserIds] = useState<string[]>([]);
  const [remoteSpeakingPeerUserIds, setRemoteSpeakingPeerUserIds] = useState<string[]>([]);
  const [remoteAudioMutedPeerUserIds, setRemoteAudioMutedPeerUserIds] = useState<string[]>([]);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreamsByUserId, setRemoteVideoStreamsByUserId] = useState<Record<string, MediaStream>>({});
  const roomVoiceConnectedRef = useRef(false);
  const roomVoiceTargetsRef = useRef<PresenceMember[]>(roomVoiceTargets);
  const peersRef = useRef<Map<string, VoicePeerContext>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const ensurePeerConnectionRef = useRef<((targetUserId: string, targetLabel: string) => RTCPeerConnection) | null>(null);
  const startOfferRef = useRef<((
    targetUserId: string,
    targetLabel: string,
    options?: StartOfferOptions
  ) => Promise<void>) | null>(null);
  const syncRoomTargetsRef = useRef<(() => Promise<void>) | null>(null);
  const requestTargetByIdRef = useRef<Map<string, { targetUserId: string; eventType: string }>>(new Map());
  const blockedTargetUntilRef = useRef<Map<string, number>>(new Map());
  const roomTargetsResyncTimerRef = useRef<number | null>(null);
  const lastVideoSyncOfferAtRef = useRef(0);
  const offerTraceStateRef = useRef<Map<string, { count: number; lastLoggedAt: number }>>(new Map());
  const lastToastRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const localSpeakingRef = useRef(false);
  const localSpeakingLastAboveAtRef = useRef(0);
  const lastSentMicStateRef = useRef<{ muted: boolean; speaking: boolean; audioMuted: boolean } | null>(null);
  const lastSentVideoStateRef = useRef<boolean | null>(null);
  const remoteMicStateByUserIdRef = useRef<Record<string, { muted: boolean; speaking: boolean; audioMuted: boolean }>>({});

  const setRemoteVideoStream = useCallback((targetUserId: string, stream: MediaStream) => {
    setRemoteVideoStreamsByUserId((prev) => {
      if (prev[targetUserId] === stream) {
        return prev;
      }

      return {
        ...prev,
        [targetUserId]: stream
      };
    });
  }, []);

  const clearRemoteVideoStream = useCallback((targetUserId: string) => {
    setRemoteVideoStreamsByUserId((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, targetUserId)) {
        return prev;
      }

      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
  }, []);

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
    const mutedIds = new Set<string>();
    const speakingIds = new Set<string>();
    const audioMutedIds = new Set<string>();

    for (const [userId, peer] of peersRef.current.entries()) {
      if (peer.isRemoteMicMuted) {
        mutedIds.add(userId);
      }
      if (peer.isRemoteSpeaking) {
        speakingIds.add(userId);
      }
      if (peer.isRemoteAudioMuted) {
        audioMutedIds.add(userId);
      }
    }

    Object.entries(remoteMicStateByUserIdRef.current).forEach(([userId, state]) => {
      const normalized = normalizeRtcText(userId);
      if (!normalized) {
        return;
      }

      if (state.muted) {
        mutedIds.add(normalized);
        speakingIds.delete(normalized);
      } else {
        mutedIds.delete(normalized);
        if (state.speaking) {
          speakingIds.add(normalized);
        } else {
          speakingIds.delete(normalized);
        }
      }

      if (state.audioMuted) {
        audioMutedIds.add(normalized);
      } else {
        audioMutedIds.delete(normalized);
      }
    });

    setRemoteMutedPeerUserIds(Array.from(mutedIds));
    setRemoteSpeakingPeerUserIds(Array.from(speakingIds));
    setRemoteAudioMutedPeerUserIds(Array.from(audioMutedIds));
  }, []);

  const shouldInitiateOffer = useCallback((targetUserId: string) => {
    // Deterministic single-offerer policy per peer pair to avoid glare.
    return isDesignatedOfferer(localUserId, targetUserId);
  }, [localUserId]);

  const isTargetTemporarilyBlocked = useCallback((targetUserId: string) => {
    const until = blockedTargetUntilRef.current.get(targetUserId) || 0;
    if (until <= Date.now()) {
      blockedTargetUntilRef.current.delete(targetUserId);
      return false;
    }
    return true;
  }, []);

  const traceOfferEvent = useCallback((
    event: string,
    targetUserId: string,
    targetLabel: string,
    reason: string,
    extra: Record<string, unknown> = {}
  ) => {
    const normalizedReason = String(reason || "unspecified");
    const key = `${event}:${targetUserId}:${normalizedReason}`;
    const now = Date.now();
    const state = offerTraceStateRef.current.get(key) || { count: 0, lastLoggedAt: 0 };
    const nextCount = state.count + 1;
    const shouldLog = nextCount === 1
      || nextCount % OFFER_TRACE_EVERY_N === 0
      || now - state.lastLoggedAt >= OFFER_TRACE_MIN_GAP_MS;

    offerTraceStateRef.current.set(key, {
      count: nextCount,
      lastLoggedAt: shouldLog ? now : state.lastLoggedAt
    });

    if (!shouldLog) {
      return;
    }

    logVoiceDiagnostics(`runtime ${event}`, {
      targetUserId,
      targetLabel: targetLabel || targetUserId,
      reason: normalizedReason,
      count: nextCount,
      ...extra
    });
  }, []);

  const traceOfferLifecycle = useCallback((args: {
    stage: "created" | "sent" | "settled" | "failed";
    targetUserId: string;
    targetLabel: string;
    reason: string;
    iceRestart: boolean;
    cadenceBucket: "manual" | "video-sync" | "ice-restart";
    settledBy?: "complete" | "timeout" | "already-complete";
    message?: string;
  }) => {
    const {
      stage,
      targetUserId,
      targetLabel,
      reason,
      iceRestart,
      cadenceBucket,
      settledBy,
      message
    } = args;

    logVoiceDiagnostics("runtime offer lifecycle", {
      stage,
      targetUserId,
      targetLabel: targetLabel || targetUserId,
      reason,
      iceRestart,
      cadenceBucket,
      settledBy,
      message
    });
  }, []);

  const rememberRequestTarget = useCallback((requestId: string | null, eventType: string, targetUserId: string) => {
    const normalizedRequestId = normalizeRtcText(requestId);
    const normalizedTarget = normalizeRtcText(targetUserId);
    if (!normalizedRequestId || !normalizedTarget) {
      return;
    }

    requestTargetByIdRef.current.set(normalizedRequestId, {
      targetUserId: normalizedTarget,
      eventType
    });
  }, []);

  const clearRoomTargetsResyncTimer = useCallback(() => {
    clearRoomTargetsResyncTimerForRtc(roomTargetsResyncTimerRef);
  }, []);

  const scheduleRoomTargetsResync = useCallback((delayMs: number) => {
    scheduleRoomTargetsResyncForRtc({
      timerRef: roomTargetsResyncTimerRef,
      roomVoiceConnectedRef,
      syncRoomTargetsRef,
      delayMs
    });
  }, []);

  const getAudioConstraints = useCallback((): MediaTrackConstraints => {
    return buildAudioConstraints({
      selectedInputId,
      serverAudioQuality
    });
  }, [selectedInputId, serverAudioQuality]);

  const getVideoConstraints = useCallback((): MediaTrackConstraints | false => {
    return buildVideoConstraints({
      allowVideoStreaming,
      videoStreamingEnabled,
      selectedVideoInputId,
      serverVideoResolution,
      serverVideoFps
    });
  }, [allowVideoStreaming, videoStreamingEnabled, selectedVideoInputId, serverVideoResolution, serverVideoFps]);

  const applyAudioQualityToConnection = useCallback(async (
    connection: RTCPeerConnection,
    targetLabel: string
  ) => {
    await applyAudioQualityToPeerConnection({
      connection,
      targetLabel,
      serverAudioQuality,
      pushCallLog
    });
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
    const snapshot = deriveCallStatusForRtc(peersRef);
    setConnectedPeerUserIds(snapshot.connectedUserIds);
    setConnectingPeerUserIds(snapshot.connectingUserIds);
    setCallStatus(snapshot.status);
  }, [setCallStatus]);

  const clearPeerReconnectTimer = useCallback((targetUserId: string) => {
    clearPeerReconnectTimerForTarget(peersRef, targetUserId);
  }, []);

  const clearPeerStatsTimer = useCallback((targetUserId: string) => {
    clearPeerStatsTimerForTarget(peersRef, targetUserId);
  }, []);

  const startPeerStatsMonitor = useCallback((targetUserId: string, targetLabel: string) => {
    startPeerStatsMonitorForTarget({
      peersRef,
      targetUserId,
      targetLabel,
      audioMuted,
      applyRemoteAudioOutput,
      pushCallLog,
      shouldInitiateOffer,
      startOffer: startOfferRef.current
    });
  }, [audioMuted, applyRemoteAudioOutput, pushCallLog, shouldInitiateOffer]);

  const releaseLocalStream = useCallback(() => {
    releaseLocalStreamForRtc({
      localStreamRef,
      setLocalVideoStream
    });
  }, []);

  const closePeer = useCallback((targetUserId: string, reason?: string) => {
    closePeerForRtc({
      targetUserId,
      peersRef,
      clearPeerReconnectTimer,
      clearPeerStatsTimer,
      clearRemoteVideoStream,
      syncPeerVoiceState,
      updateCallStatus,
      pushCallLog,
      reason
    });
  }, [clearPeerReconnectTimer, clearPeerStatsTimer, pushCallLog, updateCallStatus, syncPeerVoiceState, clearRemoteVideoStream]);

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
    setRemoteVideoStreamsByUserId({});
    if (shouldClearRequestState) {
      requestTargetByIdRef.current.clear();
      blockedTargetUntilRef.current.clear();
    }
    remoteMicStateByUserIdRef.current = {};
    lastSentMicStateRef.current = null;
    lastSentVideoStateRef.current = null;
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
    return ensureLocalStreamForRtc({
      localStreamRef,
      getAudioConstraints,
      getVideoConstraints,
      micMuted,
      t,
      pushToastThrottled,
      selectedInputId,
      allowVideoStreaming,
      videoStreamingEnabled,
      setLocalVideoStream,
      pushCallLog
    });
  }, [getAudioConstraints, getVideoConstraints, micMuted, t, pushToastThrottled, selectedInputId, allowVideoStreaming, videoStreamingEnabled, pushCallLog]);

  const attachLocalTracks = useCallback(async (connection: RTCPeerConnection) => {
    await attachLocalTracksForRtc({
      connection,
      ensureLocalStream,
      allowVideoStreaming,
      findSenderByKind,
      applyAudioQualityToConnection
    });
  }, [ensureLocalStream, applyAudioQualityToConnection, allowVideoStreaming]);

  const scheduleReconnect = useCallback((targetUserId: string, trigger: string) => {
    schedulePeerReconnectForTarget({
      roomVoiceConnectedRef,
      peersRef,
      targetUserId,
      trigger,
      shouldInitiateOffer,
      closePeer,
      updateCallStatus,
      pushCallLog,
      startOffer: startOfferRef.current
    });
  }, [closePeer, pushCallLog, updateCallStatus, shouldInitiateOffer]);

  const flushPendingRemoteCandidates = useCallback(async (targetUserId: string, targetLabel: string) => {
    await flushQueuedRemoteCandidatesForPeer({
      peer: peersRef.current.get(targetUserId),
      targetUserId,
      targetLabel,
      pushCallLog
    });
  }, [pushCallLog]);

  const ensurePeerConnection = useCallback((targetUserId: string, targetLabel: string) => {
    return ensurePeerConnectionForRtc({
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
  }, [sendWsEvent, applyRemoteAudioOutput, clearPeerReconnectTimer, closePeer, scheduleReconnect, updateCallStatus, syncPeerVoiceState, retryRemoteAudioPlayback, startPeerStatsMonitor, rememberRequestTarget, audioMuted, outputVolume, setRemoteVideoStream, clearRemoteVideoStream]);

  ensurePeerConnectionRef.current = ensurePeerConnection;

  const runStartOfferPreflight = useCallback((
    targetUserId: string,
    targetLabel: string,
    options?: StartOfferOptions
  ): StartOfferContext | null => {
    const normalizedTarget = normalizeRtcText(targetUserId);
    if (!normalizedTarget || !roomVoiceConnectedRef.current) {
      return null;
    }

    const reason = (options?.reason || "manual") as OfferReason;
    if (isTargetTemporarilyBlocked(normalizedTarget)) {
      traceOfferEvent("offer skipped", normalizedTarget, targetLabel, reason, { skip: "target-blocked" });
      return null;
    }

    const existingPeer = peersRef.current.get(normalizedTarget);
    if (existingPeer?.offerInFlight || existingPeer?.makingOffer) {
      traceOfferEvent("offer skipped", normalizedTarget, targetLabel, reason, { skip: "in-flight" });
      return null;
    }

    const minIntervalMs = resolveOfferMinIntervalMs(reason, Boolean(options?.iceRestart));
    const cadenceBucket = resolveOfferCadenceBucket(reason, Boolean(options?.iceRestart));
    const now = Date.now();
    const lastOfferAtForBucket = getLastOfferAtForBucket(existingPeer, cadenceBucket);
    if (existingPeer && now - lastOfferAtForBucket < minIntervalMs) {
      traceOfferEvent("offer skipped", normalizedTarget, targetLabel, reason, {
        skip: "min-interval",
        elapsedMs: now - lastOfferAtForBucket,
        minIntervalMs
      });
      return null;
    }

    if (existingPeer && existingPeer.connection.signalingState !== "stable") {
      traceOfferEvent("offer skipped", normalizedTarget, targetLabel, reason, {
        skip: "signaling-not-stable",
        signalingState: existingPeer.connection.signalingState
      });
      return null;
    }

    return {
      normalizedTarget,
      targetLabel,
      reason,
      iceRestart: Boolean(options?.iceRestart),
      cadenceBucket
    };
  }, [isTargetTemporarilyBlocked, traceOfferEvent]);

  const sendStartOfferSignal = useCallback(async (context: StartOfferContext): Promise<boolean> => {
    const { normalizedTarget, targetLabel, reason, iceRestart, cadenceBucket } = context;

    const connection = ensurePeerConnection(normalizedTarget, targetLabel);
    const peer = peersRef.current.get(normalizedTarget);
    if (peer && peer.connection.signalingState !== "stable") {
      traceOfferEvent("offer skipped", normalizedTarget, targetLabel, reason, {
        skip: "post-ensure-signaling-not-stable",
        signalingState: peer.connection.signalingState
      });
      return false;
    }

    await attachLocalTracks(connection);
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: allowVideoStreaming,
      iceRestart
    });
    await connection.setLocalDescription(offer);

    const { signal, settledBy } = await buildLocalDescriptionAfterIceGathering(connection);
    traceOfferLifecycle({
      stage: "settled",
      targetUserId: normalizedTarget,
      targetLabel,
      reason,
      iceRestart,
      cadenceBucket,
      settledBy
    });

    if (settledBy === "timeout") {
      pushCallLog(`rtc ice gathering timeout before offer -> ${targetLabel || normalizedTarget}`);
    }

    const requestId = sendWsEvent(
      "call.offer",
      {
        targetUserId: normalizedTarget,
        signal
      },
      { trackAck: false, maxRetries: 0 }
    );
    rememberRequestTarget(requestId, "call.offer", normalizedTarget);

    if (!requestId) {
      traceOfferEvent("offer skipped", normalizedTarget, targetLabel, reason, {
        skip: "socket-unavailable"
      });
      traceOfferLifecycle({
        stage: "failed",
        targetUserId: normalizedTarget,
        targetLabel,
        reason,
        iceRestart,
        cadenceBucket,
        message: "socket-unavailable"
      });
      pushCallLog("call.offer skipped: socket unavailable");
      return false;
    }

    return true;
  }, [ensurePeerConnection, attachLocalTracks, allowVideoStreaming, pushCallLog, sendWsEvent, rememberRequestTarget, traceOfferEvent, traceOfferLifecycle]);

  const commitStartOfferSuccess = useCallback((context: StartOfferContext): void => {
    const { normalizedTarget, targetLabel, reason, iceRestart, cadenceBucket } = context;
    setLastCallPeer(targetLabel || normalizedTarget);
    updateCallStatus();
    markOfferSentNowForBucket(peersRef.current.get(normalizedTarget), cadenceBucket);
    if (iceRestart) {
      pushCallLog(`call.offer ice-restart -> ${targetLabel || normalizedTarget}${reason ? ` (${reason})` : ""}`);
    }
    pushCallLog(`call.offer sent -> ${targetLabel || normalizedTarget}`);
    traceOfferEvent("offer sent", normalizedTarget, targetLabel, reason, {
      iceRestart
    });
    traceOfferLifecycle({
      stage: "sent",
      targetUserId: normalizedTarget,
      targetLabel,
      reason,
      iceRestart,
      cadenceBucket
    });
  }, [setLastCallPeer, updateCallStatus, pushCallLog, traceOfferEvent, traceOfferLifecycle]);

  const startOffer = useCallback(async (
    targetUserId: string,
    targetLabel: string,
    options?: StartOfferOptions
  ) => {
    const context = runStartOfferPreflight(targetUserId, targetLabel, options);
    if (!context) {
      return;
    }

    const {
      normalizedTarget,
      targetLabel: resolvedTargetLabel,
      reason,
      iceRestart,
      cadenceBucket
    } = context;
    const existingPeer = peersRef.current.get(normalizedTarget);

    traceOfferLifecycle({
      stage: "created",
      targetUserId: normalizedTarget,
      targetLabel: resolvedTargetLabel,
      reason,
      iceRestart,
      cadenceBucket
    });

    markOfferInFlight(existingPeer, true);
    markMakingOffer(existingPeer, true);

    try {
      const sent = await sendStartOfferSignal(context);
      if (!sent) {
        return;
      }

      commitStartOfferSuccess(context);
    } catch (error) {
      const errorName = (error as { name?: string })?.name || "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        pushToastThrottled("media-denied", t("settings.mediaDenied"));
      } else {
        pushToastThrottled("devices-load-failed", t("settings.devicesLoadFailed"));
      }
      pushCallLog(`call.offer failed (${targetLabel || normalizedTarget}): ${(error as Error).message}`);
      traceOfferLifecycle({
        stage: "failed",
        targetUserId: normalizedTarget,
        targetLabel: resolvedTargetLabel,
        reason,
        iceRestart,
        cadenceBucket,
        message: (error as Error).message
      });
      closePeer(normalizedTarget);
    } finally {
      const activePeer = peersRef.current.get(normalizedTarget);
      markMakingOffer(activePeer, false);
      markOfferInFlight(activePeer, false);
    }
  }, [runStartOfferPreflight, commitStartOfferSuccess, sendStartOfferSignal, pushCallLog, t, pushToastThrottled, closePeer, traceOfferLifecycle]);

  startOfferRef.current = startOffer;

  useEffect(() => {
    const peers = Array.from(peersRef.current.entries());
    peers.forEach(([userId, peer]) => {
      void applyAudioQualityToConnection(peer.connection, peer.label || userId);
    });
  }, [serverAudioQuality, applyAudioQualityToConnection]);

  const syncRoomTargets = useCallback(async () => {
    await syncRoomTargetsForRtc({
      roomVoiceConnectedRef,
      roomVoiceTargetsRef,
      peersRef,
      isTargetTemporarilyBlocked,
      shouldInitiateOffer,
      startOffer,
      closePeer,
      updateCallStatus,
      pushCallLog
    });
  }, [closePeer, startOffer, updateCallStatus, shouldInitiateOffer, pushCallLog, isTargetTemporarilyBlocked]);

  syncRoomTargetsRef.current = syncRoomTargets;

  const connectRoom = useCallback(async () => {
    roomVoiceConnectedRef.current = true;
    setRoomVoiceConnected(true);
    pushCallLog("voice room connect requested");

    if (roomVoiceTargetsRef.current.length === 0) {
      if (allowVideoStreaming && videoStreamingEnabled) {
        try {
          await ensureLocalStream();
          pushCallLog("voice room local video preview enabled");
        } catch (error) {
          pushCallLog(`voice room local preview failed: ${(error as Error).message}`);
        }
      }
      pushCallLog("voice room waiting for participants");
      setCallStatus("idle");
      return;
    }

    await syncRoomTargets();
  }, [pushCallLog, setCallStatus, syncRoomTargets, allowVideoStreaming, videoStreamingEnabled, ensureLocalStream]);

  const disconnectRoom = useCallback(() => {
    const activeTargetIds = new Set(
      roomVoiceTargetsRef.current
        .map((member) => String(member.userId || "").trim())
        .filter((userId) => userId.length > 0)
    );

    const peerIds = Array.from(peersRef.current.keys());
    peerIds.forEach((userId) => {
      if (activeTargetIds.has(userId)) {
        const requestId = sendWsEvent(
          "call.hangup",
          { targetUserId: userId, reason: "manual" },
          { trackAck: false, maxRetries: 0 }
        );
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
    await dispatchIncomingSignalForRtc({
      eventType,
      payload,
      roomVoiceConnectedRef,
      peersRef,
      sendWsEvent,
      rememberRequestTarget,
      ensurePeerConnection,
      clearPeerReconnectTimer,
      attachLocalTracks,
      flushPendingRemoteCandidates,
      setLastCallPeer,
      updateCallStatus,
      pushCallLog,
      closePeer,
      shouldInitiateOffer,
      logVoiceDiagnostics
    });
  }, [sendWsEvent, rememberRequestTarget, ensurePeerConnection, clearPeerReconnectTimer, attachLocalTracks, flushPendingRemoteCandidates, setLastCallPeer, updateCallStatus, pushCallLog, closePeer, shouldInitiateOffer]);

  const handleIncomingTerminal = useCallback((eventType: "call.reject" | "call.hangup", payload: CallTerminalPayload) => {
    dispatchIncomingTerminalForRtc({
      eventType,
      payload,
      closePeer,
      updateCallStatus
    });
  }, [closePeer, updateCallStatus]);

  const handleIncomingMicState = useCallback((payload: CallMicStatePayload) => {
    dispatchIncomingMicStateForRtc({
      payload,
      peersRef,
      remoteMicStateByUserIdRef,
      syncPeerVoiceState
    });
  }, [syncPeerVoiceState]);

  const handleIncomingVideoState = useCallback((payload: CallVideoStatePayload) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    if (!fromUserId || !roomVoiceConnectedRef.current) {
      return;
    }

    const settings = payload.settings;
    const remoteVideoEnabled = typeof settings?.localVideoEnabled === "boolean"
      ? settings.localVideoEnabled
      : null;
    if (remoteVideoEnabled === null) {
      return;
    }

    if (!remoteVideoEnabled) {
      // Keep UI/state consistent even when offer ownership is on the other side.
      clearRemoteVideoStream(fromUserId);
    }

    if (!shouldInitiateOffer(fromUserId)) {
      return;
    }

    const peer = peersRef.current.get(fromUserId);
    const targetLabel = String(payload.fromUserName || peer?.label || fromUserId).trim();
    void startOfferRef.current?.(fromUserId, targetLabel || fromUserId, {
      reason: `video-sync:remote-video-state:${remoteVideoEnabled ? "on" : "off"}`
    });
  }, [shouldInitiateOffer, clearRemoteVideoStream]);

  const handleCallNack = useCallback((payload: CallNackPayload) => {
    dispatchCallNackForRtc({
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
    roomVoiceConnected,
    allowVideoStreaming,
    videoStreamingEnabled,
    serverVideoEffectType,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    selectedInputId,
    selectedVideoInputId,
    micMuted,
    audioMuted,
    outputVolume,
    getAudioConstraints,
    getVideoConstraints,
    setLocalVideoStream,
    applyRemoteAudioOutput,
    retryRemoteAudioPlayback,
    onVideoTrackSyncNeeded: (reason) => {
      if (!roomVoiceConnectedRef.current) {
        logVoiceDiagnostics("runtime video-sync trigger ignored", {
          reason,
          skip: "room-not-connected"
        });
        return;
      }

      if (reason.startsWith("watchdog-")) {
        logVoiceDiagnostics("runtime video-sync trigger ignored", {
          reason,
          skip: "watchdog-local-resync-only"
        });
        return;
      }

      const now = Date.now();
      if (now - lastVideoSyncOfferAtRef.current < OFFER_VIDEO_SYNC_MIN_INTERVAL_MS) {
        logVoiceDiagnostics("runtime video-sync trigger ignored", {
          reason,
          skip: "global-video-sync-cooldown",
          elapsedMs: now - lastVideoSyncOfferAtRef.current,
          minIntervalMs: OFFER_VIDEO_SYNC_MIN_INTERVAL_MS
        });
        return;
      }
      lastVideoSyncOfferAtRef.current = now;

      logVoiceDiagnostics("runtime video-sync trigger", {
        reason,
        peers: peersRef.current.size
      });

      for (const [targetUserId, peer] of peersRef.current.entries()) {
        if (!shouldInitiateOffer(targetUserId)) {
          logVoiceDiagnostics("runtime video-sync target skipped", {
            reason,
            targetUserId,
            targetLabel: peer.label || targetUserId,
            skip: "offer-ordering"
          });
          continue;
        }

        void startOfferRef.current?.(targetUserId, peer.label || targetUserId, {
          reason: `video-sync:${reason}`
        });
      }
    },
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
    if (!roomVoiceConnected) {
      return;
    }
    if (!allowVideoStreaming || !videoStreamingEnabled) {
      return;
    }
    if (localStreamRef.current) {
      return;
    }

    void ensureLocalStream().catch((error) => {
      pushCallLog(`local camera preview failed: ${(error as Error).message}`);
    });
  }, [roomVoiceConnected, allowVideoStreaming, videoStreamingEnabled, ensureLocalStream, pushCallLog]);

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
    if (!roomVoiceConnectedRef.current || !allowVideoStreaming) {
      return;
    }

    const localVideoEnabled = Boolean(videoStreamingEnabled);
    if (lastSentVideoStateRef.current === localVideoEnabled) {
      return;
    }

    lastSentVideoStateRef.current = localVideoEnabled;
    sendWsEvent("call.video_state", {
      settings: {
        localVideoEnabled
      }
    }, { maxRetries: 1 });
  }, [roomVoiceConnected, allowVideoStreaming, videoStreamingEnabled, sendWsEvent]);

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
    localVideoStream,
    remoteVideoStreamsByUserId,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal,
    handleIncomingTerminal,
    handleIncomingMicState,
    handleIncomingVideoState,
    handleCallNack
  };
}
