import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalTracks,
  createLocalScreenTracks,
  type LocalAudioTrack,
  Participant,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteAudioTrack,
  type TrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from "livekit-client";
import { api } from "../../api";
import type { PresenceMember } from "../../domain";
import type { CallStatus } from "../../services";
import { RnnoiseAudioProcessor } from "./rnnoiseAudioProcessor";
import type {
  CallMicStatePayload,
  CallNackPayload,
  CallSignalPayload,
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
  roomVoiceTargets: PresenceMember[];
  selectedInputId: string;
  selectedInputProfile: "noise_reduction" | "studio" | "custom";
  selectedOutputId: string;
  selectedVideoInputId: string;
  micMuted: boolean;
  audioMuted: boolean;
  outputVolume: number;
  pushToast: (message: string) => void;
  pushCallLog: (text: string) => void;
  setCallStatus: (status: CallStatus) => void;
  setLastCallPeer: (peer: string) => void;
};

type LivekitRuntimeApi = {
  roomVoiceConnected: boolean;
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

const normalizeLivekitSignalUrl = (rawUrl: string): string => {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const isHttpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
    if (isHttpsPage && parsed.protocol === "ws:") {
      parsed.protocol = "wss:";
      if (parsed.port === "7880") {
        parsed.port = "7881";
      }
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return value;
  }
};

const isExpectedDisconnectError = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error || "");
  const normalized = text.toLowerCase();
  return normalized.includes("client initiated disconnect")
    || normalized.includes("abort handler called")
    || normalized.includes("aborterror");
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
  roomVoiceTargets,
  selectedInputId,
  selectedInputProfile,
  selectedOutputId,
  selectedVideoInputId,
  micMuted,
  audioMuted,
  outputVolume,
  pushToast,
  pushCallLog,
  setCallStatus,
  setLastCallPeer
}: UseLivekitVoiceRuntimeArgs): LivekitRuntimeApi {
  const [roomVoiceConnected, setRoomVoiceConnected] = useState(false);
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const rnnoiseProcessorRef = useRef<RnnoiseAudioProcessor | null>(null);
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const prevRoomSlugRef = useRef(roomSlug);
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const disconnectRequestedRef = useRef(false);
  const lastAppliedMicConfigRef = useRef("");

  const buildAudioConstraints = useCallback((): true | MediaTrackConstraints => {
    const base: MediaTrackConstraints = {
      ...(selectedInputId && selectedInputId !== "default"
        ? { deviceId: { exact: selectedInputId } }
        : {})
    };

    if (selectedInputProfile === "noise_reduction") {
      return {
        ...base,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1
      };
    }

    if (selectedInputProfile === "studio") {
      return {
        ...base,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      };
    }

    return Object.keys(base).length > 0 ? base : true;
  }, [selectedInputId, selectedInputProfile]);

  const buildMicConfigKey = useCallback(() => {
    const deviceId = selectedInputId && selectedInputId !== "default" ? selectedInputId : "default";
    return `${deviceId}:${selectedInputProfile}`;
  }, [selectedInputId, selectedInputProfile]);

  const applyAudioOutputSettings = useCallback(() => {
    remoteAudioElementsRef.current.forEach((element) => {
      element.muted = audioMuted;
      element.volume = Math.max(0, Math.min(1, outputVolume / 100));
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
  }, [audioMuted, outputVolume, selectedOutputId]);

  const attachRemoteAudioTrack = useCallback((participantId: string, track: RemoteAudioTrack) => {
    const existing = remoteAudioElementsRef.current.get(participantId);
    if (existing) {
      existing.remove();
      remoteAudioElementsRef.current.delete(participantId);
    }

    const element = track.attach();
    element.autoplay = true;
    element.style.display = "none";
    document.body.appendChild(element);
    remoteAudioElementsRef.current.set(participantId, element);
    applyAudioOutputSettings();
  }, [applyAudioOutputSettings]);

  const detachRemoteAudioTrack = useCallback((participantId: string) => {
    const element = remoteAudioElementsRef.current.get(participantId);
    if (!element) {
      return;
    }

    element.srcObject = null;
    element.remove();
    remoteAudioElementsRef.current.delete(participantId);
  }, []);

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
    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const applyNoiseSuppressionProcessor = useCallback(async (audioTrack: LocalAudioTrack) => {
    if (selectedInputProfile !== "noise_reduction") {
      await audioTrack.stopProcessor().catch(() => undefined);
      await releaseRnnoiseProcessor();
      return;
    }

    if (typeof AudioContext === "undefined") {
      pushCallLog("rnnoise unavailable: AudioContext is not supported");
      return;
    }

    const audioContext = audioContextRef.current ?? new AudioContext({ sampleRate: 48000 });
    if (audioContext.state === "suspended") {
      await audioContext.resume().catch(() => undefined);
    }
    audioContextRef.current = audioContext;

    const processor = new RnnoiseAudioProcessor();
    await audioTrack.setAudioContext(audioContext);
    await audioTrack.setProcessor(processor);

    const previousProcessor = rnnoiseProcessorRef.current;
    rnnoiseProcessorRef.current = processor;
    if (previousProcessor) {
      await previousProcessor.destroy().catch(() => undefined);
    }
  }, [pushCallLog, releaseRnnoiseProcessor, selectedInputProfile]);

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
      video: {
        ...(selectedVideoInputId && selectedVideoInputId !== "default"
          ? { deviceId: { exact: selectedVideoInputId } }
          : {})
      }
    });

    const localVideoTrack = tracks.find((track) => track.kind === Track.Kind.Video);
    if (!localVideoTrack) {
      tracks.forEach((track) => track.stop());
      return;
    }

    await room.localParticipant.publishTrack(localVideoTrack);
    localTracksRef.current.set(Track.Source.Camera, localVideoTrack);
    setLocalVideoStream(new MediaStream([localVideoTrack.mediaStreamTrack]));
  }, [allowVideoStreaming, selectedVideoInputId, videoStreamingEnabled]);

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
    if (!room || !roomVoiceConnected) {
      throw new Error("room_not_connected");
    }

    const existingTrack = localTracksRef.current.get(Track.Source.ScreenShare);
    if (existingTrack) {
      return;
    }

    const tracks = await createLocalScreenTracks({
      audio: false,
      video: true
    });

    const localScreenTrack = tracks.find((track) => track.kind === Track.Kind.Video);
    if (!localScreenTrack) {
      tracks.forEach((track) => track.stop());
      throw new Error("screen_share_track_missing");
    }

    await room.localParticipant.publishTrack(localScreenTrack);
    localTracksRef.current.set(Track.Source.ScreenShare, localScreenTrack);
    setLocalScreenShareStream(new MediaStream([localScreenTrack.mediaStreamTrack]));
    setIsLocalScreenSharing(true);
  }, [roomVoiceConnected]);

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

        const signalUrl = normalizeLivekitSignalUrl(livekit.url);
        await room.connect(signalUrl, livekit.token);

        const tracks = await createLocalTracks({
          audio: buildAudioConstraints(),
          video: allowVideoStreaming && videoStreamingEnabled
            ? {
              ...(selectedVideoInputId && selectedVideoInputId !== "default"
                ? { deviceId: { exact: selectedVideoInputId } }
                : {})
            }
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
    buildMicConfigKey,
    selectedInputId,
    selectedInputProfile,
    selectedVideoInputId,
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
