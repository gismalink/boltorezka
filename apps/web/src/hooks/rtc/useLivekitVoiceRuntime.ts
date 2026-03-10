import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalTracks,
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

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<Map<Track.Source, LocalTrack>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const prevRoomSlugRef = useRef(roomSlug);
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const disconnectRequestedRef = useRef(false);

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

  const cleanupRoom = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
    }

    roomRef.current = null;

    localTracksRef.current.forEach((track) => {
      track.stop();
    });
    localTracksRef.current.clear();

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
    setRemoteVideoStreamsByUserId({});
    setCallStatus("idle");
    setLastCallPeer("");
  }, [setCallStatus, setLastCallPeer]);

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
            upsertRemoteVideoStream(participantId, track.mediaStreamTrack);
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
            removeRemoteVideoStream(participantId);
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
          audio: {
            ...(selectedInputId && selectedInputId !== "default"
              ? { deviceId: { exact: selectedInputId } }
              : {})
          },
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
          if (micMuted) {
            await localAudioTrack.mute();
          } else {
            await localAudioTrack.unmute();
          }
        }

        const localVideoTrack = localTracksRef.current.get(Track.Source.Camera);
        setLocalVideoStream(localVideoTrack ? new MediaStream([localVideoTrack.mediaStreamTrack]) : null);

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
    selectedInputId,
    selectedVideoInputId,
    setCallStatus,
    setLastCallPeer,
    token,
    videoStreamingEnabled,
    detachRemoteAudioTrack,
    removeRemoteVideoStream,
    attachRemoteAudioTrack,
    upsertRemoteVideoStream
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

    const desiredDeviceId = selectedInputId && selectedInputId !== "default"
      ? selectedInputId
      : "default";

    try {
      const audioTrackWithDeviceSwitch = currentAudioTrack as LocalTrack & {
        setDeviceId?: (deviceId: string) => Promise<boolean>;
      };

      if (typeof audioTrackWithDeviceSwitch.setDeviceId === "function") {
        await audioTrackWithDeviceSwitch.setDeviceId(desiredDeviceId);
        return;
      }

      const replacementTracks = await createLocalTracks({
        audio: desiredDeviceId !== "default"
          ? { deviceId: { exact: desiredDeviceId } }
          : true,
        video: false
      });
      const replacementAudioTrack = replacementTracks.find((track) => track.kind === Track.Kind.Audio);
      if (!replacementAudioTrack) {
        replacementTracks.forEach((track) => track.stop());
        return;
      }

      room.localParticipant.unpublishTrack(currentAudioTrack);
      currentAudioTrack.stop();
      await room.localParticipant.publishTrack(replacementAudioTrack);
      localTracksRef.current.set(Track.Source.Microphone, replacementAudioTrack);

      if (micMuted) {
        await replacementAudioTrack.mute();
      }
    } catch (error) {
      pushCallLog(`livekit mic device switch failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }, [micMuted, pushCallLog, roomVoiceConnected, selectedInputId]);

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
    connectRoom,
    disconnectRoom,
    handleIncomingSignal: noopSignal,
    handleIncomingTerminal: noopTerminal,
    handleIncomingMicState: noopMicState,
    handleIncomingVideoState: noopVideoState,
    handleCallNack: noopNack
  };
}
