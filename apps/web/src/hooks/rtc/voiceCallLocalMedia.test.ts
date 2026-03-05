import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachLocalTracksForRtc,
  buildAudioConstraints,
  buildVideoConstraints,
  ensureLocalStreamForRtc,
  releaseLocalStreamForRtc
} from "./voiceCallLocalMedia";

function createTrack(kind: "audio" | "video") {
  return {
    kind,
    enabled: true,
    stop: vi.fn()
  } as any;
}

function createStream(audioTrack?: any, videoTrack?: any) {
  const audio = audioTrack ? [audioTrack] : [];
  const video = videoTrack ? [videoTrack] : [];
  return {
    getAudioTracks: () => audio,
    getVideoTracks: () => video,
    getTracks: () => [...audio, ...video]
  } as any;
}

describe("voiceCallLocalMedia", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds audio constraints with exact device id for non-default input", () => {
    const constraints = buildAudioConstraints({
      selectedInputId: "mic-42",
      serverAudioQuality: "high"
    });

    expect(constraints.deviceId).toEqual({ exact: "mic-42" });
    expect(constraints.channelCount).toEqual({ ideal: 2 });
    expect(constraints.sampleRate).toEqual({ ideal: 48000 });
  });

  it("returns false video constraints when video streaming is disabled", () => {
    const constraints = buildVideoConstraints({
      allowVideoStreaming: true,
      videoStreamingEnabled: false,
      selectedVideoInputId: "default",
      serverVideoResolution: "640x480",
      serverVideoFps: 24
    });

    expect(constraints).toBe(false);
  });

  it("applies fallback microphone when exact device is unavailable", async () => {
    const audioTrack = createTrack("audio");
    const stream = createStream(audioTrack);
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce({ name: "OverconstrainedError" })
      .mockResolvedValueOnce(stream);

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia
      }
    });

    const localStreamRef = { current: null as MediaStream | null };
    const pushCallLog = vi.fn();
    const setLocalVideoStream = vi.fn();

    const acquired = await ensureLocalStreamForRtc({
      localStreamRef,
      getAudioConstraints: () => ({ deviceId: { exact: "missing-device" }, sampleRate: { ideal: 24000 } }),
      getVideoConstraints: () => false,
      micMuted: true,
      t: (key) => key,
      pushToastThrottled: vi.fn(),
      selectedInputId: "missing-device",
      allowVideoStreaming: false,
      videoStreamingEnabled: false,
      setLocalVideoStream,
      pushCallLog
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0]).toEqual({
      audio: { sampleRate: { ideal: 24000 } },
      video: false
    });
    expect(audioTrack.enabled).toBe(false);
    expect(pushCallLog).toHaveBeenCalledWith("input device fallback applied: default microphone");
    expect(setLocalVideoStream).toHaveBeenCalledWith(null);
    expect(acquired).toBe(stream);
    expect(localStreamRef.current).toBe(stream);
  });

  it("adds tracks and sendrecv transceiver for video when needed", async () => {
    const audioTrack = createTrack("audio");
    const videoTrack = createTrack("video");
    const stream = createStream(audioTrack, videoTrack);

    const audioSender = {
      replaceTrack: vi.fn(async () => undefined)
    } as unknown as RTCRtpSender;

    const connection = {
      addTrack: vi.fn(),
      addTransceiver: vi.fn()
    } as any;

    const findSenderByKind = vi.fn((_: RTCPeerConnection, kind: "audio" | "video"): RTCRtpSender | undefined => {
      if (kind === "audio") {
        return audioSender;
      }
      return undefined;
    });

    const applyAudioQualityToConnection = vi.fn(async () => undefined);

    await attachLocalTracksForRtc({
      connection,
      ensureLocalStream: vi.fn(async () => stream),
      allowVideoStreaming: true,
      findSenderByKind,
      applyAudioQualityToConnection
    });

    expect(audioSender.replaceTrack).toHaveBeenCalledWith(audioTrack);
    expect(connection.addTrack).toHaveBeenCalledWith(videoTrack, stream);
    expect(connection.addTransceiver).toHaveBeenCalledWith("video", { direction: "sendrecv" });
    expect(applyAudioQualityToConnection).toHaveBeenCalledWith(connection, "peer");
  });

  it("releases local stream and stops all tracks", () => {
    const audioTrack = createTrack("audio");
    const videoTrack = createTrack("video");
    const stream = createStream(audioTrack, videoTrack);
    const localStreamRef = { current: stream as MediaStream | null };
    const setLocalVideoStream = vi.fn();

    releaseLocalStreamForRtc({
      localStreamRef,
      setLocalVideoStream
    });

    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(localStreamRef.current).toBe(null);
    expect(setLocalVideoStream).toHaveBeenCalledWith(null);
  });
});
