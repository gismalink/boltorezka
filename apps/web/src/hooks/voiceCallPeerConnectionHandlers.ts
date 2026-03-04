import { logVoiceDiagnostics } from "../utils/voiceDiagnostics";
import {
  REMOTE_SPEAKING_HOLD_MS,
  REMOTE_SPEAKING_OFF_THRESHOLD,
  REMOTE_SPEAKING_ON_THRESHOLD
} from "./voiceCallConfig";
import { parseLocalCandidateMeta } from "./voiceCallUtils";
import type { VoicePeersRef, WsSender } from "./voiceCallTypes";

type BindVoicePeerConnectionHandlersArgs = {
  connection: RTCPeerConnection;
  targetUserId: string;
  targetLabel: string;
  peersRef: VoicePeersRef;
  sendWsEvent: WsSender;
  rememberRequestTarget: (requestId: string | null, eventType: string, targetUserId: string) => void;
  pushCallLog: (text: string) => void;
  clearPeerReconnectTimer: (targetUserId: string) => void;
  startPeerStatsMonitor: (targetUserId: string, targetLabel: string) => void;
  updateCallStatus: () => void;
  retryRemoteAudioPlayback: (reason: string) => void;
  scheduleReconnect: (targetUserId: string, trigger: string) => void;
  closePeer: (targetUserId: string) => void;
  applyRemoteAudioOutput: (element: HTMLAudioElement) => Promise<void>;
  syncPeerVoiceState: () => void;
  setRemoteVideoStream: (targetUserId: string, stream: MediaStream) => void;
  clearRemoteVideoStream: (targetUserId: string) => void;
  audioMuted: boolean;
  outputVolume: number;
};

export function bindVoicePeerConnectionHandlers({
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
  setRemoteVideoStream,
  clearRemoteVideoStream,
  audioMuted,
  outputVolume
}: BindVoicePeerConnectionHandlersArgs) {
  connection.onicecandidate = (event) => {
    const peer = peersRef.current.get(targetUserId);
    if (!peer || peer.connection !== connection || connection.connectionState === "closed") {
      return;
    }

    if (!event.candidate) {
      pushCallLog(`rtc ice gathering complete <- ${targetLabel || targetUserId}`);
      return;
    }

    const meta = parseLocalCandidateMeta(event.candidate.candidate);
    pushCallLog(
      `call.ice local -> ${targetLabel || targetUserId} typ=${meta.type} transport=${meta.transport} addr=${meta.address}:${meta.port}`
    );

    const requestId = sendWsEvent(
      "call.ice",
      {
        targetUserId,
        signal: event.candidate.toJSON()
      },
      { trackAck: false, maxRetries: 0 }
    );

    if (!requestId) {
      pushCallLog(`call.ice skipped: socket unavailable (${targetLabel || targetUserId})`);
    }

    rememberRequestTarget(requestId, "call.ice", targetUserId);
  };

  connection.onicegatheringstatechange = () => {
    pushCallLog(
      `rtc ice gathering state ${targetLabel || targetUserId}: ${connection.iceGatheringState}`
    );
  };

  connection.oniceconnectionstatechange = () => {
    pushCallLog(
      `rtc ice connection state ${targetLabel || targetUserId}: ${connection.iceConnectionState}`
    );
  };

  connection.onicecandidateerror = (event: RTCPeerConnectionIceErrorEvent) => {
    pushCallLog(
      `rtc ice candidate error ${targetLabel || targetUserId}: code=${event.errorCode || "n/a"} text=${event.errorText || ""} url=${event.url || ""} address=${event.address || ""} port=${event.port || ""}`
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
      startPeerStatsMonitor(targetUserId, targetLabel);
      updateCallStatus();
      retryRemoteAudioPlayback("rtc-connected");
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
    const [track] = event.track ? [event.track] : [];

    const peer = peersRef.current.get(targetUserId);
    if (!peer) {
      return;
    }

    const resolvedStream = stream || peer.remoteStream || new MediaStream();
    const hadSameStream = peer.remoteStream === resolvedStream;
    const knownTrackIdSet = new Set((peer.remoteStream?.getTracks() || []).map((item) => item.id));
    const isDuplicateTrackEvent = Boolean(track?.id && hadSameStream && knownTrackIdSet.has(track.id));

    if (!stream && track && !resolvedStream.getTracks().some((item) => item.id === track.id)) {
      resolvedStream.addTrack(track);
    }

    if (isDuplicateTrackEvent) {
      return;
    }

    if (track) {
      track.onmute = () => {
        pushCallLog(`remote track muted <- ${targetLabel || targetUserId}`);
        if (track.kind === "video") {
          clearRemoteVideoStream(targetUserId);
        }
      };
      track.onunmute = () => {
        pushCallLog(`remote track unmuted <- ${targetLabel || targetUserId}`);
        if (track.kind === "video") {
          const currentPeer = peersRef.current.get(targetUserId);
          if (currentPeer?.remoteStream) {
            setRemoteVideoStream(targetUserId, currentPeer.remoteStream);
          }
        }
        retryRemoteAudioPlayback("track-unmuted");
      };
      track.onended = () => {
        pushCallLog(`remote track ended <- ${targetLabel || targetUserId}`);
        if (track.kind === "video") {
          clearRemoteVideoStream(targetUserId);
        }
      };
    }

    pushCallLog(`remote track attached <- ${targetLabel || targetUserId}`);
    logVoiceDiagnostics("runtime remote track attached", {
      targetUserId,
      targetLabel,
      streamId: resolvedStream.id
    });

    peer.remoteStream = resolvedStream;
    if (resolvedStream.getVideoTracks().length > 0) {
      setRemoteVideoStream(targetUserId, resolvedStream);
    }

    const remoteAudioElement = peer.audioElement;
    if (remoteAudioElement.srcObject !== resolvedStream) {
      remoteAudioElement.srcObject = resolvedStream;
    }
    peer.hasRemoteTrack = true;
    startPeerStatsMonitor(targetUserId, targetLabel);

    if (!peer.speakingAudioContext) {
      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Context) {
        const speakingAudioContext = new Context();
        const speakingAnalyser = speakingAudioContext.createAnalyser();
        const speakingGain = speakingAudioContext.createGain();
        speakingAnalyser.fftSize = 512;
        speakingAnalyser.smoothingTimeConstant = 0.8;
        const source = speakingAudioContext.createMediaStreamSource(resolvedStream);
        source.connect(speakingAnalyser);
        source.connect(speakingGain);
        speakingGain.connect(speakingAudioContext.destination);
        speakingGain.gain.value = audioMuted ? 0 : Math.max(0, Math.min(1, outputVolume / 100));

        void speakingAudioContext.resume().catch(() => {
          pushCallLog(`audio context resume deferred <- ${targetLabel || targetUserId}`);
        });
        remoteAudioElement.dataset.audioRoute = "context";
        remoteAudioElement.muted = true;
        pushCallLog(`audio route fallback: context <- ${targetLabel || targetUserId}`);

        peer.speakingAudioContext = speakingAudioContext;
        peer.speakingSource = source;
        peer.speakingAnalyser = speakingAnalyser;
        peer.speakingData = new Uint8Array(new ArrayBuffer(speakingAnalyser.fftSize));
        peer.speakingGain = speakingGain;

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
        retryRemoteAudioPlayback("ontrack-failed");
      });
  };
}
