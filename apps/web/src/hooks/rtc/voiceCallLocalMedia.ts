import type { MutableRefObject } from "react";
import type { AudioQuality } from "../../domain";
import {
  decrementVoiceCounter,
  incrementVoiceCounter,
  logVoiceDiagnostics
} from "../../utils/voiceDiagnostics";

const AUDIO_QUALITY_MAX_BITRATE: Record<AudioQuality, number> = {
  retro: 12000,
  low: 24000,
  standard: 40000,
  high: 64000
};

const AUDIO_QUALITY_SAMPLE_RATE: Record<AudioQuality, number> = {
  retro: 12000,
  low: 16000,
  standard: 24000,
  high: 48000
};

export function buildAudioConstraints(args: {
  selectedInputId: string;
  serverAudioQuality: AudioQuality;
}): MediaTrackConstraints {
  const { selectedInputId, serverAudioQuality } = args;
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
}

export function buildVideoConstraints(args: {
  allowVideoStreaming: boolean;
  videoStreamingEnabled: boolean;
  selectedVideoInputId: string;
  serverVideoResolution: string;
  serverVideoFps: number;
}): MediaTrackConstraints | false {
  const {
    allowVideoStreaming,
    videoStreamingEnabled,
    selectedVideoInputId,
    serverVideoResolution,
    serverVideoFps
  } = args;

  if (!allowVideoStreaming || !videoStreamingEnabled) {
    return false;
  }

  const [width, height] = serverVideoResolution.split("x").map((item) => Number(item));

  if (selectedVideoInputId && selectedVideoInputId !== "default") {
    return {
      width: { ideal: width || 320 },
      height: { ideal: height || 240 },
      frameRate: { ideal: serverVideoFps, max: serverVideoFps },
      deviceId: { exact: selectedVideoInputId }
    };
  }

  return {
    width: { ideal: width || 320 },
    height: { ideal: height || 240 },
    frameRate: { ideal: serverVideoFps, max: serverVideoFps }
  };
}

export async function applyAudioQualityToPeerConnection(args: {
  connection: RTCPeerConnection;
  targetLabel: string;
  serverAudioQuality: AudioQuality;
  pushCallLog: (text: string) => void;
}): Promise<void> {
  const { connection, targetLabel, serverAudioQuality, pushCallLog } = args;
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
}

export async function ensureLocalStreamForRtc(args: {
  localStreamRef: MutableRefObject<MediaStream | null>;
  getAudioConstraints: () => MediaTrackConstraints;
  getVideoConstraints: () => MediaTrackConstraints | false;
  micMuted: boolean;
  t: (key: string) => string;
  pushToastThrottled: (key: string, message: string) => void;
  selectedInputId: string;
  allowVideoStreaming: boolean;
  videoStreamingEnabled: boolean;
  setLocalVideoStream: (stream: MediaStream | null) => void;
  pushCallLog: (text: string) => void;
}): Promise<MediaStream> {
  const {
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
  } = args;

  if (localStreamRef.current) {
    return localStreamRef.current;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    pushToastThrottled("browser-unsupported", t("settings.browserUnsupported"));
    throw new Error("MediaDevicesUnsupported");
  }

  const audioConstraints = getAudioConstraints();
  let stream: MediaStream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: getVideoConstraints()
    });
  } catch (error) {
    const errorName = (error as { name?: string })?.name || "";
    const hasExactDeviceId = typeof audioConstraints === "object"
      && audioConstraints !== null
      && Object.prototype.hasOwnProperty.call(audioConstraints, "deviceId");

    if (!hasExactDeviceId || (errorName !== "NotFoundError" && errorName !== "OverconstrainedError")) {
      throw error;
    }

    const fallbackConstraints = { ...(audioConstraints as MediaTrackConstraints) };
    delete (fallbackConstraints as { deviceId?: unknown }).deviceId;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: fallbackConstraints,
      video: getVideoConstraints()
    });
    pushCallLog("input device fallback applied: default microphone");
  }

  stream.getAudioTracks().forEach((track) => {
    track.enabled = !micMuted;
  });

  if (allowVideoStreaming && videoStreamingEnabled) {
    setLocalVideoStream(stream.getVideoTracks().length > 0 ? stream : null);
  } else {
    stream.getVideoTracks().forEach((track) => track.stop());
    setLocalVideoStream(null);
  }

  localStreamRef.current = stream;
  incrementVoiceCounter("runtimeLocalStreams");
  logVoiceDiagnostics("runtime local stream acquired", {
    selectedInputId: selectedInputId || "default"
  });
  return stream;
}

export async function attachLocalTracksForRtc(args: {
  connection: RTCPeerConnection;
  ensureLocalStream: () => Promise<MediaStream>;
  allowVideoStreaming: boolean;
  findSenderByKind: (connection: RTCPeerConnection, kind: "audio" | "video") => RTCRtpSender | undefined;
  applyAudioQualityToConnection: (connection: RTCPeerConnection, targetLabel: string) => Promise<void>;
}): Promise<void> {
  const {
    connection,
    ensureLocalStream,
    allowVideoStreaming,
    findSenderByKind,
    applyAudioQualityToConnection
  } = args;

  const stream = await ensureLocalStream();
  const nextAudioTrack = stream.getAudioTracks()[0] || null;
  const nextVideoTrack = stream.getVideoTracks()[0] || null;

  if (nextAudioTrack) {
    const audioSender = findSenderByKind(connection, "audio");
    if (audioSender) {
      await audioSender.replaceTrack(nextAudioTrack);
    } else {
      connection.addTrack(nextAudioTrack, stream);
    }
  }

  if (allowVideoStreaming) {
    const videoSender = findSenderByKind(connection, "video");
    if (videoSender) {
      await videoSender.replaceTrack(nextVideoTrack);
    } else if (nextVideoTrack) {
      connection.addTrack(nextVideoTrack, stream);
    }
  }

  if (allowVideoStreaming) {
    const hasVideoSender = Boolean(findSenderByKind(connection, "video"));
    if (!hasVideoSender) {
      connection.addTransceiver("video", { direction: "sendrecv" });
    }
  }

  await applyAudioQualityToConnection(connection, "peer");
}

export function releaseLocalStreamForRtc(args: {
  localStreamRef: MutableRefObject<MediaStream | null>;
  setLocalVideoStream: (stream: MediaStream | null) => void;
}): void {
  const { localStreamRef, setLocalVideoStream } = args;

  if (!localStreamRef.current) {
    return;
  }

  localStreamRef.current.getTracks().forEach((track) => track.stop());
  localStreamRef.current = null;
  setLocalVideoStream(null);
  decrementVoiceCounter("runtimeLocalStreams");
  logVoiceDiagnostics("runtime local stream released");
}
