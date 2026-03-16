import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalTracks,
  createLocalScreenTracks,
  type LocalAudioTrack,
  type ScreenShareCaptureOptions,
  Participant,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type VideoCaptureOptions,
  type RemoteAudioTrack,
  type TrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from "livekit-client";
import { api } from "../../api";
import type { AudioQuality } from "../../domain";
import type { PresenceMember } from "../../domain";
import type { CallStatus } from "../../services";
import { trackClientEvent } from "../../telemetry";
import { normalizeLivekitSignalUrl } from "../../transportRuntime";
import { RnnoiseAudioProcessor, type RnnoiseSuppressionLevel } from "./rnnoiseAudioProcessor";
import type {
  CallMicStatePayload,
  CallNackPayload,
  CallSignalPayload,
  ServerScreenShareResolution,
  ServerVideoResolution,
  CallTerminalPayload,
  CallVideoStatePayload,
  VoiceMediaStatusSummary
} from "./voiceCallTypes";

type UseLivekitVoiceRuntimeArgs = {
  token: string;
  localUserId: string;
  roomSlug: string;
  allowVideoStreaming: boolean;
  videoStreamingEnabled: boolean;
  videoResolution: ServerVideoResolution;
  videoFps: 10 | 15 | 24 | 30;
  screenShareResolution: ServerScreenShareResolution;
  audioQuality: AudioQuality;
  roomVoiceTargets: PresenceMember[];
  selectedInputId: string;
  selectedInputProfile: "noise_reduction" | "studio" | "custom";
  rnnoiseSuppressionLevel: RnnoiseSuppressionLevel;
  preRnnEchoCancellationEnabled: boolean;
  preRnnAutoGainControlEnabled: boolean;
  selectedOutputId: string;
  memberVolumeByUserId: Record<string, number>;
  selectedVideoInputId: string;
  micVolume: number;
  micMuted: boolean;
  audioMuted: boolean;
  outputVolume: number;
  pushToast: (message: string) => void;
  pushCallLog: (text: string) => void;
  onRnnoiseStatusChange?: (status: "inactive" | "active" | "unavailable" | "error") => void;
  onRnnoiseFallback?: (reason: "unavailable" | "error") => void;
  setCallStatus: (status: CallStatus) => void;
  setLastCallPeer: (peer: string) => void;
};

type LivekitRuntimeApi = {
  roomVoiceConnected: boolean;
  remoteAudioAutoplayBlocked: boolean;
  connectedPeerUserIds: string[];
  connectingPeerUserIds: string[];
  remoteMutedPeerUserIds: string[];
  remoteSpeakingPeerUserIds: string[];
  remoteAudioMutedPeerUserIds: string[];
  voiceMediaStatusByPeerUserId: Record<string, VoiceMediaStatusSummary>;
  localVoiceMediaStatusSummary: VoiceMediaStatusSummary;
  localVideoStream: MediaStream | null;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  localScreenShareStream: MediaStream | null;
  remoteScreenShareStreamsByUserId: Record<string, MediaStream>;
  isLocalScreenSharing: boolean;
  startLocalScreenShare: () => Promise<void>;
  stopLocalScreenShare: () => Promise<void>;
  connectRoom: () => Promise<void>;
  disconnectRoom: () => void;
  handleIncomingSignal: (payload: CallSignalPayload) => void;
  handleIncomingTerminal: (payload: CallTerminalPayload) => void;
  handleIncomingMicState: (payload: CallMicStatePayload) => void;
  handleIncomingVideoState: (payload: CallVideoStatePayload) => void;
  handleCallNack: (payload: CallNackPayload) => void;
};

const EMPTY_HANDLER = () => {};
type MediaTrackConstraintsWithVolume = MediaTrackConstraints & { volume?: number };
type EventEmitterLike = { setMaxListeners?: (count: number) => void };

function parseResolution(value: ServerVideoResolution): { width: number; height: number } {
  const [rawWidth, rawHeight] = String(value).split("x");
  const width = Math.max(1, Number(rawWidth) || 320);
  const height = Math.max(1, Number(rawHeight) || 240);
  return { width, height };
}

function parseScreenShareResolution(value: ServerScreenShareResolution): { width: number; height: number } | null {
  if (value === "hd") {
    return { width: 1280, height: 720 };
  }

  if (value === "fullhd") {
    return { width: 1920, height: 1080 };
  }

  return null;
}

const setEmitterMaxListeners = (candidate: unknown, count: number) => {
  if (!candidate || typeof candidate !== "object") {
    return;
  }

  const emitter = candidate as EventEmitterLike;
  if (typeof emitter.setMaxListeners === "function") {
    emitter.setMaxListeners(count);
  }
};

const relaxLivekitEmitterLimits = (room: Room, maxListeners = 64) => {
  const engine = room.engine as unknown as {
    client?: unknown;
    publisher?: unknown;
    subscriber?: unknown;
    pcManager?: unknown;
  };

  setEmitterMaxListeners(engine, maxListeners);
  setEmitterMaxListeners(engine.client, maxListeners);
  setEmitterMaxListeners(engine.publisher, maxListeners);
  setEmitterMaxListeners(engine.subscriber, maxListeners);
  setEmitterMaxListeners(engine.pcManager, maxListeners);
};

const isExpectedDisconnectError = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error || "");
  const normalized = text.toLowerCase();
  return normalized.includes("client initiated disconnect")
    || normalized.includes("abort handler called")
    || normalized.includes("aborterror");
};

  const isAutoplayBlockedError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") {
      return false;
    }
    const maybeName = "name" in error ? String((error as { name?: unknown }).name || "") : "";
    return maybeName === "NotAllowedError";
  };

function buildRemoteMicMutedSet(room: Room): Set<string> {
  const muted = new Set<string>();
  room.remoteParticipants.forEach((participant, participantId) => {
    const hasMutedMic = Array.from(participant.trackPublications.values()).some(
      (publication) => publication.source === Track.Source.Microphone && publication.isMuted === true
    );
    if (hasMutedMic) {
      muted.add(participantId);
    }
  });
  return muted;
}

export function useLivekitVoiceRuntime({
  token,
  localUserId,
  roomSlug,
  allowVideoStreaming,
  videoStreamingEnabled,
  videoResolution,
  videoFps,
  screenShareResolution,
  audioQuality,
  roomVoiceTargets,
  selectedInputId,
  selectedInputProfile,
  rnnoiseSuppressionLevel,
  preRnnEchoCancellationEnabled,
  preRnnAutoGainControlEnabled,
  selectedOutputId,
  memberVolumeByUserId,
  selectedVideoInputId,
  micVolume,
  micMuted,
  audioMuted,
  outputVolume,
  pushToast,
  pushCallLog,
  onRnnoiseStatusChange,
  onRnnoiseFallback,
  setCallStatus,
  setLastCallPeer
}: UseLivekitVoiceRuntimeArgs): LivekitRuntimeApi {
  const [roomVoiceConnected, setRoomVoiceConnected] = useState(false);
  const [remoteAudioAutoplayBlocked, setRemoteAudioAutoplayBlocked] = useState(false);
  const [connectedPeerUserIds, setConnectedPeerUserIds] = useState<string[]>([]);
  const [connectingPeerUserIds, setConnectingPeerUserIds] = useState<string[]>([]);
  const [remoteMutedPeerUserIds, setRemoteMutedPeerUserIds] = useState<string[]>([]);
  const [remoteSpeakingPeerUserIds, setRemoteSpeakingPeerUserIds] = useState<string[]>([]);
  const [remoteAudioMutedPeerUserIds, setRemoteAudioMutedPeerUserIds] = useState<string[]>([]);
  const [voiceMediaStatusByPeerUserId, setVoiceMediaStatusByPeerUserId] = useState<Record<string, VoiceMediaStatusSummary>>({});
  const [localVoiceMediaStatusSummary, setLocalVoiceMediaStatusSummary] = useState<VoiceMediaStatusSummary>("idle");
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreamsByUserId, setRemoteVideoStreamsByUserId] = useState<Record<string, MediaStream>>({});
  const [localScreenShareStream, setLocalScreenShareStream] = useState<MediaStream | null>(null);
  const [remoteScreenShareStreamsByUserId, setRemoteScreenShareStreamsByUserId] = useState<Record<string, MediaStream>>({});
  const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<Map<Track.Source, LocalTrack>>(new Map());
  const rnnoiseProcessorRef = useRef<RnnoiseAudioProcessor | null>(null);
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteAudioBlockedByAutoplayRef = useRef<Set<string>>(new Set());
  const hasUserInteractionRef = useRef(false);
  const prevRoomSlugRef = useRef(roomSlug);
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const disconnectRequestedRef = useRef(false);
  const lastAppliedMicConfigRef = useRef("");
  const lastRnnoiseTelemetryStatusRef = useRef("");

  const trackRnnoiseStatus = useCallback((
    status: "inactive" | "active" | "unavailable" | "error",
    reason?: string
  ) => {
    const telemetryKey = `${status}:${reason || ""}:${selectedInputProfile}:${rnnoiseSuppressionLevel}`;
    if (telemetryKey === lastRnnoiseTelemetryStatusRef.current) {
      return;
    }
    lastRnnoiseTelemetryStatusRef.current = telemetryKey;
    trackClientEvent(
      "rnnoise_status",
      {
        status,
        reason: reason || null,
        selectedInputProfile,
        rnnoiseSuppressionLevel
      },
      token || undefined
    );
  }, [rnnoiseSuppressionLevel, selectedInputProfile, token]);

  const buildAudioConstraints = useCallback((): true | MediaTrackConstraints => {
    const base: MediaTrackConstraints = {
      ...(selectedInputId && selectedInputId !== "default"
        ? { deviceId: { exact: selectedInputId } }
        : {})
    };

    const qualityHint: MediaTrackConstraints =
      audioQuality === "retro"
        ? { sampleRate: 16000, channelCount: 1 }
        : audioQuality === "low"
          ? { sampleRate: 24000, channelCount: 1 }
          : audioQuality === "standard"
            ? { sampleRate: 48000, channelCount: 1 }
            : { sampleRate: 48000, channelCount: 2 };
    const inputVolume = Math.max(0, Math.min(1, Number(micVolume) / 100));

    if (selectedInputProfile === "noise_reduction") {
      return {
        ...base,
        ...qualityHint,
        volume: inputVolume,
        echoCancellation: preRnnEchoCancellationEnabled,
        noiseSuppression: false,
        autoGainControl: preRnnAutoGainControlEnabled,
        channelCount: 1
      } as MediaTrackConstraintsWithVolume;
    }

    if (selectedInputProfile === "studio") {
      return {
        ...base,
        ...qualityHint,
        volume: inputVolume,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } as MediaTrackConstraintsWithVolume;
    }

    const constraints: MediaTrackConstraintsWithVolume = {
      ...base,
      ...qualityHint,
      volume: inputVolume
    };
    return Object.keys(constraints).length > 0 ? constraints : true;
  }, [audioQuality, micVolume, preRnnAutoGainControlEnabled, preRnnEchoCancellationEnabled, selectedInputId, selectedInputProfile]);

  const buildCameraVideoOptions = useCallback((): VideoCaptureOptions => {
    const { width, height } = parseResolution(videoResolution);
    return {
      resolution: {
        width,
        height,
        frameRate: videoFps
      },
      frameRate: videoFps,
      ...(selectedVideoInputId && selectedVideoInputId !== "default"
        ? { deviceId: { exact: selectedVideoInputId } }
        : {})
    };
  }, [selectedVideoInputId, videoFps, videoResolution]);

  const buildCameraApplyConstraints = useCallback((): MediaTrackConstraints => {
    const { width, height } = parseResolution(videoResolution);
    return {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: videoFps }
    };
  }, [videoFps, videoResolution]);

  const buildScreenShareOptions = useCallback((): ScreenShareCaptureOptions => {
    const targetResolution = parseScreenShareResolution(screenShareResolution);
    const resolution = targetResolution
      ? {
        width: targetResolution.width,
        height: targetResolution.height,
        frameRate: videoFps
      }
      : undefined;

    return {
      audio: false,
      video: true,
      ...(resolution ? { resolution } : {})
    };
  }, [screenShareResolution, videoFps]);

  const buildScreenShareApplyConstraints = useCallback((): MediaTrackConstraints => {
    const targetResolution = parseScreenShareResolution(screenShareResolution);
    if (!targetResolution) {
      return {
        frameRate: { ideal: videoFps }
      };
    }

    return {
      width: { ideal: targetResolution.width },
      height: { ideal: targetResolution.height },
      frameRate: { ideal: videoFps }
    };
  }, [screenShareResolution, videoFps]);

  const buildMicConfigKey = useCallback(() => {
    const deviceId = selectedInputId && selectedInputId !== "default" ? selectedInputId : "default";
    return `${deviceId}:${selectedInputProfile}:${audioQuality}:${preRnnEchoCancellationEnabled ? "ec1" : "ec0"}:${preRnnAutoGainControlEnabled ? "agc1" : "agc0"}`;
  }, [audioQuality, preRnnAutoGainControlEnabled, preRnnEchoCancellationEnabled, selectedInputId, selectedInputProfile]);

    const tryPlayRemoteAudioElement = useCallback((participantId: string, element: HTMLAudioElement) => {
      if (!hasUserInteractionRef.current) {
        remoteAudioBlockedByAutoplayRef.current.add(participantId);
        setRemoteAudioAutoplayBlocked(true);
        return;
      }

      const playPromise = element.play();
      if (!playPromise || typeof playPromise.then !== "function") {
        remoteAudioBlockedByAutoplayRef.current.delete(participantId);
        if (remoteAudioBlockedByAutoplayRef.current.size === 0) {
          setRemoteAudioAutoplayBlocked(false);
        }
        return;
      }

      void playPromise
        .then(() => {
          remoteAudioBlockedByAutoplayRef.current.delete(participantId);
          if (remoteAudioBlockedByAutoplayRef.current.size === 0) {
            setRemoteAudioAutoplayBlocked(false);
          }
        })
        .catch((error) => {
          if (isAutoplayBlockedError(error)) {
            remoteAudioBlockedByAutoplayRef.current.add(participantId);
            setRemoteAudioAutoplayBlocked(true);
            pushCallLog(`remote audio autoplay blocked for ${participantId}; waiting for user interaction`);
            return;
          }

          pushCallLog(`remote audio play failed for ${participantId}: ${error instanceof Error ? error.message : "unknown error"}`);
        });
    }, [pushCallLog]);

    const applyAudioOutputSettings = useCallback(() => {
    remoteAudioElementsRef.current.forEach((element, participantId) => {
      const peerVolume = Math.max(0, Math.min(100, Number(memberVolumeByUserId[participantId] ?? 100)));
      const mixedVolume = (Math.max(0, Math.min(100, outputVolume)) / 100) * (peerVolume / 100);
      const canPlayAudibly = hasUserInteractionRef.current;
      element.muted = audioMuted || !canPlayAudibly;
      element.volume = Math.max(0, Math.min(1, mixedVolume));
        if (!audioMuted && canPlayAudibly) {
          tryPlayRemoteAudioElement(participantId, element);
        }
      if (
        selectedOutputId
        && selectedOutputId !== "default"
        && typeof element.setSinkId === "function"
      ) {
        void element.setSinkId(selectedOutputId).catch(() => {
          // Browsers can reject device switching without explicit permissions.
        });
      }
    });
  }, [audioMuted, memberVolumeByUserId, outputVolume, selectedOutputId, tryPlayRemoteAudioElement]);

    const attachRemoteAudioTrack = useCallback((participantId: string, track: RemoteAudioTrack) => {
    const existing = remoteAudioElementsRef.current.get(participantId);
    if (existing) {
      existing.remove();
      remoteAudioElementsRef.current.delete(participantId);
    }

    const element = document.createElement("audio");
    element.autoplay = false;
    element.setAttribute("playsinline", "");
    element.muted = true;
    track.attach(element);
    element.style.display = "none";
    document.body.appendChild(element);
    remoteAudioElementsRef.current.set(participantId, element);
    applyAudioOutputSettings();
      if (!audioMuted) {
        tryPlayRemoteAudioElement(participantId, element);
      }
    }, [applyAudioOutputSettings, audioMuted, tryPlayRemoteAudioElement]);

  const detachRemoteAudioTrack = useCallback((participantId: string) => {
    const element = remoteAudioElementsRef.current.get(participantId);
    if (!element) {
      return;
    }

    element.srcObject = null;
    element.remove();
    remoteAudioElementsRef.current.delete(participantId);
      remoteAudioBlockedByAutoplayRef.current.delete(participantId);
      if (remoteAudioBlockedByAutoplayRef.current.size === 0) {
        setRemoteAudioAutoplayBlocked(false);
      }
  }, []);

    const retryBlockedRemoteAudioPlayback = useCallback(() => {
      if (remoteAudioBlockedByAutoplayRef.current.size === 0) {
        return;
      }

      remoteAudioBlockedByAutoplayRef.current.forEach((participantId) => {
        const element = remoteAudioElementsRef.current.get(participantId);
        if (!element) {
          remoteAudioBlockedByAutoplayRef.current.delete(participantId);
          return;
        }

        if (!audioMuted) {
          tryPlayRemoteAudioElement(participantId, element);
        }
      });
    }, [audioMuted, tryPlayRemoteAudioElement]);

  const upsertRemoteVideoStream = useCallback((participantId: string, track: MediaStreamTrack) => {
    setRemoteVideoStreamsByUserId((prev) => {
      const currentStream = prev[participantId] || new MediaStream();
      currentStream.getVideoTracks().forEach((existingTrack) => currentStream.removeTrack(existingTrack));
      currentStream.addTrack(track);
      return {
        ...prev,
        [participantId]: currentStream
      };
    });
  }, []);

  const removeRemoteVideoStream = useCallback((participantId: string) => {
    setRemoteVideoStreamsByUserId((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, participantId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[participantId];
      return next;
    });
  }, []);

  const upsertRemoteScreenShareStream = useCallback((participantId: string, track: MediaStreamTrack) => {
    setRemoteScreenShareStreamsByUserId((prev) => {
      const currentStream = prev[participantId] || new MediaStream();
      currentStream.getVideoTracks().forEach((existingTrack) => currentStream.removeTrack(existingTrack));
      currentStream.addTrack(track);
      return {
        ...prev,
        [participantId]: currentStream
      };
    });
  }, []);

  const removeRemoteScreenShareStream = useCallback((participantId: string) => {
    setRemoteScreenShareStreamsByUserId((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, participantId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[participantId];
      return next;
    });
  }, []);

  const refreshRemoteStates = useCallback((room: Room | null) => {
    if (!room) {
      setConnectedPeerUserIds([]);
      setConnectingPeerUserIds([]);
      setRemoteMutedPeerUserIds([]);
      setRemoteAudioMutedPeerUserIds([]);
      setVoiceMediaStatusByPeerUserId({});
      return;
    }

    const participants = Array.from(room.remoteParticipants.values());
    const connectedIds = participants
      .map((participant) => String(participant.identity || "").trim())
      .filter((identity) => identity.length > 0);

    const mutedSet = buildRemoteMicMutedSet(room);
    const nextStatus: Record<string, VoiceMediaStatusSummary> = {};
    participants.forEach((participant) => {
      const participantId = String(participant.identity || "").trim();
      if (!participantId) {
        return;
      }
      const hasMedia = Array.from(participant.trackPublications.values()).some(
        (publication) => publication.track !== null
      );
      nextStatus[participantId] = hasMedia ? "media" : "connecting";
    });

    setConnectedPeerUserIds(connectedIds);
    setConnectingPeerUserIds([]);
    setRemoteMutedPeerUserIds(Array.from(mutedSet));
    // LiveKit does not expose remote output mute state; keep it independent from mic mute.
    setRemoteAudioMutedPeerUserIds([]);
    setVoiceMediaStatusByPeerUserId(nextStatus);
  }, []);

  const releaseRnnoiseProcessor = useCallback(async () => {
    const processor = rnnoiseProcessorRef.current;
    rnnoiseProcessorRef.current = null;
    if (processor) {
      await processor.destroy().catch(() => undefined);
    }
  }, []);

  const applyNoiseSuppressionProcessor = useCallback(async (audioTrack: LocalAudioTrack) => {
    if (selectedInputProfile !== "noise_reduction") {
      trackRnnoiseStatus("inactive", "profile_not_noise_reduction");
      onRnnoiseStatusChange?.("inactive");
      await audioTrack.stopProcessor().catch(() => undefined);
      await releaseRnnoiseProcessor();
      return;
    }

    if (rnnoiseSuppressionLevel === "none") {
      trackRnnoiseStatus("inactive", "suppression_none");
      onRnnoiseStatusChange?.("inactive");
      await audioTrack.stopProcessor().catch(() => undefined);
      await releaseRnnoiseProcessor();
      return;
    }

    if (typeof AudioContext === "undefined") {
      pushCallLog("rnnoise unavailable: AudioContext is not supported");
      trackRnnoiseStatus("unavailable", "audio_context_unsupported");
      onRnnoiseStatusChange?.("unavailable");
      onRnnoiseFallback?.("unavailable");
      return;
    }

    try {
      const processor = new RnnoiseAudioProcessor(rnnoiseSuppressionLevel);
      const startedAt = performance.now();
      await audioTrack.setProcessor(processor);
      const setupMs = performance.now() - startedAt;
      if (Number.isFinite(setupMs) && setupMs >= 0) {
        trackClientEvent(
          "rnnoise_processor_apply_ms",
          {
            ms: Number(setupMs.toFixed(3)),
            selectedInputProfile,
            rnnoiseSuppressionLevel
          },
          token || undefined
        );
      }

      const previousProcessor = rnnoiseProcessorRef.current;
      rnnoiseProcessorRef.current = processor;
      if (previousProcessor) {
        await previousProcessor.destroy().catch(() => undefined);
      }

      trackRnnoiseStatus("active", "processor_attached");
      onRnnoiseStatusChange?.("active");
    } catch (error) {
      pushCallLog(`rnnoise processor failed: ${error instanceof Error ? error.message : "unknown error"}`);
      trackRnnoiseStatus("error", error instanceof Error ? error.message : "unknown_error");
      onRnnoiseStatusChange?.("error");
      onRnnoiseFallback?.("error");
      await audioTrack.stopProcessor().catch(() => undefined);
      await releaseRnnoiseProcessor();
    }
  }, [onRnnoiseFallback, onRnnoiseStatusChange, pushCallLog, releaseRnnoiseProcessor, rnnoiseSuppressionLevel, selectedInputProfile, token, trackRnnoiseStatus]);

  const cleanupRoom = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
    }

    roomRef.current = null;

    localTracksRef.current.forEach((track) => {
      if (track.kind === Track.Kind.Audio) {
        void (track as LocalAudioTrack).stopProcessor().catch(() => undefined);
      }
      track.stop();
    });
    localTracksRef.current.clear();
    void releaseRnnoiseProcessor();

    remoteAudioElementsRef.current.forEach((element) => {
      element.srcObject = null;
      element.remove();
    });
    remoteAudioElementsRef.current.clear();
    remoteAudioBlockedByAutoplayRef.current.clear();
    setRemoteAudioAutoplayBlocked(false);

    setRoomVoiceConnected(false);
    setConnectedPeerUserIds([]);
    setConnectingPeerUserIds([]);
    setRemoteMutedPeerUserIds([]);
    setRemoteSpeakingPeerUserIds([]);
    setRemoteAudioMutedPeerUserIds([]);
    setVoiceMediaStatusByPeerUserId({});
    setLocalVoiceMediaStatusSummary("disconnected");
    setLocalVideoStream(null);
    setLocalScreenShareStream(null);
    setIsLocalScreenSharing(false);
    setRemoteVideoStreamsByUserId({});
    setRemoteScreenShareStreamsByUserId({});
    setCallStatus("idle");
    setLastCallPeer("");
    lastAppliedMicConfigRef.current = "";
  }, [releaseRnnoiseProcessor, setCallStatus, setLastCallPeer]);

  const publishMissingVideoTrack = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.state || !allowVideoStreaming || !videoStreamingEnabled) {
      return;
    }

    const hasPublishedVideo = Array.from(localTracksRef.current.values()).some((track) => track.source === Track.Source.Camera);
    if (hasPublishedVideo) {
      return;
    }

    const tracks = await createLocalTracks({
      audio: false,
      video: buildCameraVideoOptions()
    });

    const localVideoTrack = tracks.find((track) => track.kind === Track.Kind.Video);
    if (!localVideoTrack) {
      tracks.forEach((track) => track.stop());
      return;
    }

    await room.localParticipant.publishTrack(localVideoTrack);
    localTracksRef.current.set(Track.Source.Camera, localVideoTrack);
    setLocalVideoStream(new MediaStream([localVideoTrack.mediaStreamTrack]));
  }, [allowVideoStreaming, buildCameraVideoOptions, videoStreamingEnabled]);

  const unpublishVideoTrack = useCallback(() => {
    const room = roomRef.current;
    const localVideoTrack = localTracksRef.current.get(Track.Source.Camera);
    if (!localVideoTrack) {
      setLocalVideoStream(null);
      return;
    }

    room?.localParticipant.unpublishTrack(localVideoTrack);
    localVideoTrack.stop();
    localTracksRef.current.delete(Track.Source.Camera);
    setLocalVideoStream(null);
  }, []);

  const stopLocalScreenShare = useCallback(async () => {
    const room = roomRef.current;
    const localScreenTrack = localTracksRef.current.get(Track.Source.ScreenShare);
    if (!localScreenTrack) {
      setLocalScreenShareStream(null);
      setIsLocalScreenSharing(false);
      return;
    }

    room?.localParticipant.unpublishTrack(localScreenTrack);
    localScreenTrack.stop();
    localTracksRef.current.delete(Track.Source.ScreenShare);
    setLocalScreenShareStream(null);
    setIsLocalScreenSharing(false);
  }, []);

  const startLocalScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") {
      throw new Error("room_not_connected");
    }

    const existingTrack = localTracksRef.current.get(Track.Source.ScreenShare);
    if (existingTrack) {
      return;
    }

    const tracks = await createLocalScreenTracks(buildScreenShareOptions());

    const localScreenTrack = tracks.find((track) => track.kind === Track.Kind.Video);
    if (!localScreenTrack) {
      tracks.forEach((track) => track.stop());
      throw new Error("screen_share_track_missing");
    }

    await room.localParticipant.publishTrack(localScreenTrack);
    localTracksRef.current.set(Track.Source.ScreenShare, localScreenTrack);
    setLocalScreenShareStream(new MediaStream([localScreenTrack.mediaStreamTrack]));
    setIsLocalScreenSharing(true);
  }, [buildScreenShareOptions]);

  const connectRoom = useCallback(async () => {
    if (!token || !localUserId || !roomSlug) {
      return;
    }

    if (connectInFlightRef.current) {
      return connectInFlightRef.current;
    }

    if (roomRef.current && (
      roomRef.current.state === "connected"
      || roomRef.current.state === "connecting"
      || roomRef.current.state === "reconnecting"
    )) {
      return;
    }

    disconnectRequestedRef.current = false;

    const peerIds = roomVoiceTargets
      .map((member) => String(member.userId || "").trim())
      .filter((userId) => userId.length > 0);
    setConnectingPeerUserIds(peerIds);
    setLocalVoiceMediaStatusSummary("connecting");
    setCallStatus("connecting");
    pushCallLog(`livekit connect start for ${roomSlug}`);

    const connectPromise = (async () => {
      try {
        const livekit = await api.livekitToken(token, {
          roomSlug,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true
        });

        const room = new Room({
          // Overlay renders remote tracks via custom MediaStream plumbing; keep adaptive off to avoid track pausing/freezes.
          adaptiveStream: false,
          dynacast: true
        });

  // LiveKit may attach many internal listeners during long-lived reconnect/video sessions.
  relaxLivekitEmitterLimits(room);

        roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setRoomVoiceConnected(true);
        setLocalVoiceMediaStatusSummary("media");
        setCallStatus("active");
        refreshRemoteStates(room);
      });

      room.on(RoomEvent.Disconnected, () => {
        cleanupRoom();
      });

      room.on(RoomEvent.Reconnecting, () => {
        setLocalVoiceMediaStatusSummary("connecting");
        setCallStatus("connecting");
      });

      room.on(RoomEvent.Reconnected, () => {
        setLocalVoiceMediaStatusSummary("media");
        setCallStatus("active");
        refreshRemoteStates(room);
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        const participantId = String(participant.identity || "").trim();
        setLastCallPeer(participantId || participant.sid);
        refreshRemoteStates(room);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        const participantId = String(participant.identity || "").trim() || participant.sid;
        detachRemoteAudioTrack(participantId);
        removeRemoteVideoStream(participantId);
        removeRemoteScreenShareStream(participantId);
        refreshRemoteStates(room);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const speakerIds = speakers
          .map((speaker) => String(speaker.identity || "").trim())
          .filter((speakerId) => speakerId.length > 0 && speakerId !== localUserId);
        setRemoteSpeakingPeerUserIds(speakerIds);
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          const participantId = String(participant.identity || "").trim() || participant.sid;

          if (track.kind === Track.Kind.Audio) {
            attachRemoteAudioTrack(participantId, track as RemoteAudioTrack);
          }

          if (track.kind === Track.Kind.Video) {
            if (publication.source === Track.Source.ScreenShare) {
              upsertRemoteScreenShareStream(participantId, track.mediaStreamTrack);
            } else {
              upsertRemoteVideoStream(participantId, track.mediaStreamTrack);
            }
          }

          const nextStatus = publication.isMuted ? "connecting" : "media";
          setVoiceMediaStatusByPeerUserId((prev) => ({
            ...prev,
            [participantId]: nextStatus
          }));
          refreshRemoteStates(room);
        }
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          const participantId = String(participant.identity || "").trim() || participant.sid;
          if (track.kind === Track.Kind.Audio) {
            detachRemoteAudioTrack(participantId);
          }
          if (track.kind === Track.Kind.Video) {
            if (_publication.source === Track.Source.ScreenShare) {
              removeRemoteScreenShareStream(participantId);
            } else {
              removeRemoteVideoStream(participantId);
            }
          }
          refreshRemoteStates(room);
        }
      );

      room.on(RoomEvent.TrackMuted, (_publication: TrackPublication, participant: Participant) => {
        const participantId = String(participant.identity || "").trim() || participant.sid;
        setRemoteMutedPeerUserIds((prev) => (prev.includes(participantId) ? prev : [...prev, participantId]));
      });

      room.on(RoomEvent.TrackUnmuted, (_publication: TrackPublication, participant: Participant) => {
        const participantId = String(participant.identity || "").trim() || participant.sid;
        setRemoteMutedPeerUserIds((prev) => prev.filter((id) => id !== participantId));
      });

        const rawSignalUrl = String(livekit.url || "").trim();
        const signalUrl = normalizeLivekitSignalUrl(rawSignalUrl);
        pushCallLog(`livekit token trace=${String(livekit.traceId || "").trim() || "n/a"}`);
        pushCallLog(`livekit signal raw=${rawSignalUrl || "n/a"}`);
        if (rawSignalUrl !== signalUrl) {
          pushCallLog(`livekit signal resolved=${signalUrl}`);
        }
        await room.connect(signalUrl, livekit.token);

        const tracks = await createLocalTracks({
          audio: buildAudioConstraints(),
          video: allowVideoStreaming && videoStreamingEnabled
            ? buildCameraVideoOptions()
            : false
        });

        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
          localTracksRef.current.set(track.source, track);
        }

        const localAudioTrack = localTracksRef.current.get(Track.Source.Microphone);
        if (localAudioTrack) {
          await applyNoiseSuppressionProcessor(localAudioTrack as LocalAudioTrack);
          if (micMuted) {
            await localAudioTrack.mute();
          } else {
            await localAudioTrack.unmute();
          }
        }

        const localVideoTrack = localTracksRef.current.get(Track.Source.Camera);
        setLocalVideoStream(localVideoTrack ? new MediaStream([localVideoTrack.mediaStreamTrack]) : null);
        lastAppliedMicConfigRef.current = buildMicConfigKey();

        refreshRemoteStates(room);
        applyAudioOutputSettings();
        pushCallLog(`livekit connected to ${livekit.roomId}`);
      } catch (error) {
        cleanupRoom();
        setLocalVoiceMediaStatusSummary("disconnected");
        setCallStatus("idle");

        if (!disconnectRequestedRef.current && !isExpectedDisconnectError(error)) {
          pushToast(`LiveKit connect failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        pushCallLog(`livekit connect failed for ${roomSlug}`);
      } finally {
        connectInFlightRef.current = null;
        setConnectingPeerUserIds([]);
      }
    })();

    connectInFlightRef.current = connectPromise;
    return connectPromise;
  }, [
    allowVideoStreaming,
    applyAudioOutputSettings,
    audioMuted,
    cleanupRoom,
    localUserId,
    micMuted,
    pushCallLog,
    pushToast,
    refreshRemoteStates,
    roomVoiceTargets,
    roomSlug,
    buildAudioConstraints,
    buildCameraVideoOptions,
    buildMicConfigKey,
    selectedInputId,
    selectedInputProfile,
    setCallStatus,
    setLastCallPeer,
    token,
    videoStreamingEnabled,
    detachRemoteAudioTrack,
    removeRemoteVideoStream,
    removeRemoteScreenShareStream,
    attachRemoteAudioTrack,
    applyNoiseSuppressionProcessor,
    upsertRemoteVideoStream,
    upsertRemoteScreenShareStream
  ]);

  const disconnectRoom = useCallback(() => {
    const hasActiveSession = roomRef.current !== null || localTracksRef.current.size > 0 || roomVoiceConnected;
    if (!hasActiveSession) {
      return;
    }
    disconnectRequestedRef.current = true;
    cleanupRoom();
  }, [cleanupRoom, roomVoiceConnected]);

  useEffect(() => {
    applyAudioOutputSettings();
  }, [applyAudioOutputSettings]);

    useEffect(() => {
      const unlockPlayback = () => {
        if (hasUserInteractionRef.current) {
          return;
        }
        hasUserInteractionRef.current = true;
        applyAudioOutputSettings();
        retryBlockedRemoteAudioPlayback();
      };

      window.addEventListener("pointerdown", unlockPlayback, { passive: true });
      window.addEventListener("keydown", unlockPlayback, { passive: true });
      window.addEventListener("touchstart", unlockPlayback, { passive: true });

      return () => {
        window.removeEventListener("pointerdown", unlockPlayback);
        window.removeEventListener("keydown", unlockPlayback);
        window.removeEventListener("touchstart", unlockPlayback);
      };
    }, [applyAudioOutputSettings, retryBlockedRemoteAudioPlayback]);

  useEffect(() => {
    const localAudioTrack = localTracksRef.current.get(Track.Source.Microphone);
    if (!localAudioTrack) {
      return;
    }

    void (async () => {
      if (micMuted) {
        await localAudioTrack.mute();
      } else {
        await localAudioTrack.unmute();
      }
    })();
  }, [micMuted]);

  useEffect(() => {
    if (!roomVoiceConnected) {
      return;
    }

    const localAudioTrack = localTracksRef.current.get(Track.Source.Microphone);
    const mediaTrack = localAudioTrack?.mediaStreamTrack;
    if (!mediaTrack) {
      return;
    }

    const normalizedVolume = Math.max(0, Math.min(1, Number(micVolume) / 100));
    const constraints: MediaTrackConstraintsWithVolume = { volume: normalizedVolume };
    void mediaTrack.applyConstraints(constraints).catch((error) => {
      pushCallLog(`livekit mic volume apply failed: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }, [micVolume, pushCallLog, roomVoiceConnected]);

  const switchMicrophoneInput = useCallback(async () => {
    if (!roomVoiceConnected) {
      return;
    }

    const room = roomRef.current;
    const currentAudioTrack = localTracksRef.current.get(Track.Source.Microphone);
    if (!room || !currentAudioTrack) {
      return;
    }

    const nextMicConfigKey = buildMicConfigKey();
    if (lastAppliedMicConfigRef.current === nextMicConfigKey) {
      return;
    }

    try {
      const replacementTracks = await createLocalTracks({
        audio: buildAudioConstraints(),
        video: false
      });
      const replacementAudioTrack = replacementTracks.find((track) => track.kind === Track.Kind.Audio);
      if (!replacementAudioTrack) {
        replacementTracks.forEach((track) => track.stop());
        return;
      }

      room.localParticipant.unpublishTrack(currentAudioTrack);
      await (currentAudioTrack as LocalAudioTrack).stopProcessor().catch(() => undefined);
      currentAudioTrack.stop();
      await room.localParticipant.publishTrack(replacementAudioTrack);
      localTracksRef.current.set(Track.Source.Microphone, replacementAudioTrack);
      await applyNoiseSuppressionProcessor(replacementAudioTrack as LocalAudioTrack);

      if (micMuted) {
        await replacementAudioTrack.mute();
      }
      lastAppliedMicConfigRef.current = nextMicConfigKey;
    } catch (error) {
      pushCallLog(`livekit mic device switch failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }, [applyNoiseSuppressionProcessor, buildAudioConstraints, buildMicConfigKey, micMuted, pushCallLog, roomVoiceConnected]);

  useEffect(() => {
    void switchMicrophoneInput();
  }, [switchMicrophoneInput]);

  useEffect(() => {
    if (!roomVoiceConnected || !allowVideoStreaming || !videoStreamingEnabled) {
      return;
    }

    const localVideoTrack = localTracksRef.current.get(Track.Source.Camera);
    const mediaTrack = localVideoTrack?.mediaStreamTrack;
    if (!mediaTrack) {
      return;
    }

    const constraints = buildCameraApplyConstraints();
    void mediaTrack.applyConstraints({
      width: constraints.width,
      height: constraints.height,
      frameRate: constraints.frameRate
    }).catch((error) => {
      pushCallLog(`livekit camera constraints update failed: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }, [allowVideoStreaming, buildCameraApplyConstraints, pushCallLog, roomVoiceConnected, videoStreamingEnabled]);

  useEffect(() => {
    if (!roomVoiceConnected || !isLocalScreenSharing) {
      return;
    }

    const localScreenTrack = localTracksRef.current.get(Track.Source.ScreenShare);
    const mediaTrack = localScreenTrack?.mediaStreamTrack;
    if (!mediaTrack) {
      return;
    }

    const constraints = buildScreenShareApplyConstraints();
    void mediaTrack.applyConstraints(constraints).catch((error) => {
      pushCallLog(`livekit screen-share constraints update failed: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }, [buildScreenShareApplyConstraints, isLocalScreenSharing, pushCallLog, roomVoiceConnected]);

  useEffect(() => {
    if (!roomVoiceConnected) {
      return;
    }

    if (allowVideoStreaming && videoStreamingEnabled) {
      void publishMissingVideoTrack();
      return;
    }

    unpublishVideoTrack();
  }, [allowVideoStreaming, publishMissingVideoTrack, roomVoiceConnected, unpublishVideoTrack, videoStreamingEnabled]);

  useEffect(() => {
    if (prevRoomSlugRef.current === roomSlug) {
      return;
    }
    prevRoomSlugRef.current = roomSlug;
    disconnectRoom();
  }, [disconnectRoom, roomSlug]);

  useEffect(() => () => {
    cleanupRoom();
  }, [cleanupRoom]);

  useEffect(() => {
    setRemoteSpeakingPeerUserIds((prev) => prev.filter((peerId) => roomVoiceTargets.some((member) => member.userId === peerId)));
  }, [roomVoiceTargets]);

  const noopSignal = useCallback((_payload: CallSignalPayload) => {
    EMPTY_HANDLER();
  }, []);

  const noopTerminal = useCallback((_payload: CallTerminalPayload) => {
    EMPTY_HANDLER();
  }, []);

  const noopMicState = useCallback((_payload: CallMicStatePayload) => {
    EMPTY_HANDLER();
  }, []);

  const noopVideoState = useCallback((_payload: CallVideoStatePayload) => {
    EMPTY_HANDLER();
  }, []);

  const noopNack = useCallback((_payload: CallNackPayload) => {
    EMPTY_HANDLER();
  }, []);

  return {
    roomVoiceConnected,
    remoteAudioAutoplayBlocked,
    connectedPeerUserIds,
    connectingPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    voiceMediaStatusByPeerUserId,
    localVoiceMediaStatusSummary,
    localVideoStream,
    remoteVideoStreamsByUserId,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    isLocalScreenSharing,
    startLocalScreenShare,
    stopLocalScreenShare,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal: noopSignal,
    handleIncomingTerminal: noopTerminal,
    handleIncomingMicState: noopMicState,
    handleIncomingVideoState: noopVideoState,
    handleCallNack: noopNack
  };
}
