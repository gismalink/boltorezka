import { describe, expect, it, vi } from "vitest";
import { bindVoicePeerConnectionHandlers } from "./voiceCallPeerConnectionHandlers";

type TestConnection = {
  connectionState: RTCPeerConnectionState;
  iceGatheringState: RTCIceGatheringState;
  iceConnectionState: RTCIceConnectionState;
  onicecandidate: ((event: any) => void) | null;
  onicegatheringstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  onicecandidateerror: ((event: any) => void) | null;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: any) => void) | null;
};

function createConnection(): TestConnection {
  return {
    connectionState: "new",
    iceGatheringState: "new",
    iceConnectionState: "new",
    onicecandidate: null,
    onicegatheringstatechange: null,
    oniceconnectionstatechange: null,
    onicecandidateerror: null,
    onconnectionstatechange: null,
    ontrack: null
  };
}

function createAudioElement() {
  return {
    srcObject: null as MediaStream | null,
    dataset: {} as Record<string, string>,
    muted: false,
    play: vi.fn(async () => undefined),
    pause: vi.fn()
  } as any;
}

describe("voiceCallPeerConnectionHandlers", () => {
  it("sends local ICE candidates and remembers request target", () => {
    const connection = createConnection();
    const audioElement = createAudioElement();
    const sendWsEvent = vi.fn(() => "req-ice-1");
    const rememberRequestTarget = vi.fn();
    const pushCallLog = vi.fn();

    const peersRef = {
      current: new Map([
        [
          "user-2",
          {
            connection,
            audioElement,
            pendingRemoteCandidates: [],
            reconnectAttempts: 2,
            remoteStream: null,
            hasRemoteTrack: false,
            speakingAudioContext: null,
            speakingAnalyser: null,
            speakingData: null,
            speakingGain: null,
            hasRemoteSpeakingSignal: false,
            isRemoteMicMuted: false,
            isRemoteSpeaking: false,
            speakingLastAboveAt: 0,
            speakingAnimationFrameId: 0
          }
        ]
      ])
    } as any;

    bindVoicePeerConnectionHandlers({
      connection: connection as any,
      targetUserId: "user-2",
      targetLabel: "User Two",
      peersRef,
      sendWsEvent,
      rememberRequestTarget,
      pushCallLog,
      clearPeerReconnectTimer: vi.fn(),
      startPeerStatsMonitor: vi.fn(),
      updateCallStatus: vi.fn(),
      retryRemoteAudioPlayback: vi.fn(),
      scheduleReconnect: vi.fn(),
      closePeer: vi.fn(),
      applyRemoteAudioOutput: vi.fn(async () => undefined),
      syncPeerVoiceState: vi.fn(),
      setRemoteVideoStream: vi.fn(),
      clearRemoteVideoStream: vi.fn(),
      audioMuted: false,
      outputVolume: 100
    });

    connection.onicecandidate?.({
      candidate: {
        candidate: "candidate:0 1 udp 2122260223 10.0.0.1 8998 typ host",
        toJSON: () => ({ candidate: "candidate:0 1 udp 2122260223 10.0.0.1 8998 typ host" })
      }
    });

    expect(sendWsEvent).toHaveBeenCalledWith(
      "call.ice",
      {
        targetUserId: "user-2",
        signal: { candidate: "candidate:0 1 udp 2122260223 10.0.0.1 8998 typ host" }
      },
      { trackAck: false, maxRetries: 0 }
    );
    expect(rememberRequestTarget).toHaveBeenCalledWith("req-ice-1", "call.ice", "user-2");
    expect(pushCallLog).toHaveBeenCalledWith(
      "call.ice local -> User Two typ=host transport=udp addr=10.0.0.1:8998"
    );
  });

  it("sends ICE even when peer context is temporarily missing", () => {
    const connection = createConnection();
    const sendWsEvent = vi.fn(() => "req-ice-race");
    const rememberRequestTarget = vi.fn();

    const peersRef = {
      current: new Map()
    } as any;

    bindVoicePeerConnectionHandlers({
      connection: connection as any,
      targetUserId: "user-2",
      targetLabel: "User Two",
      peersRef,
      sendWsEvent,
      rememberRequestTarget,
      pushCallLog: vi.fn(),
      clearPeerReconnectTimer: vi.fn(),
      startPeerStatsMonitor: vi.fn(),
      updateCallStatus: vi.fn(),
      retryRemoteAudioPlayback: vi.fn(),
      scheduleReconnect: vi.fn(),
      closePeer: vi.fn(),
      applyRemoteAudioOutput: vi.fn(async () => undefined),
      syncPeerVoiceState: vi.fn(),
      setRemoteVideoStream: vi.fn(),
      clearRemoteVideoStream: vi.fn(),
      audioMuted: false,
      outputVolume: 100
    });

    connection.onicecandidate?.({
      candidate: {
        candidate: "candidate:1 1 udp 2122260223 10.0.0.2 9000 typ host",
        toJSON: () => ({ candidate: "candidate:1 1 udp 2122260223 10.0.0.2 9000 typ host" })
      }
    });

    expect(sendWsEvent).toHaveBeenCalledWith(
      "call.ice",
      {
        targetUserId: "user-2",
        signal: { candidate: "candidate:1 1 udp 2122260223 10.0.0.2 9000 typ host" }
      },
      { trackAck: false, maxRetries: 0 }
    );
    expect(rememberRequestTarget).toHaveBeenCalledWith("req-ice-race", "call.ice", "user-2");
  });

  it("starts stats and clears reconnect state on connected", () => {
    const connection = createConnection();
    const clearPeerReconnectTimer = vi.fn();
    const startPeerStatsMonitor = vi.fn();
    const updateCallStatus = vi.fn();
    const retryRemoteAudioPlayback = vi.fn();

    const peer = {
      connection,
      audioElement: createAudioElement(),
      pendingRemoteCandidates: [],
      reconnectAttempts: 3,
      remoteStream: null,
      hasRemoteTrack: false,
      speakingAudioContext: null,
      speakingAnalyser: null,
      speakingData: null,
      speakingGain: null,
      hasRemoteSpeakingSignal: false,
      isRemoteMicMuted: false,
      isRemoteSpeaking: false,
      speakingLastAboveAt: 0,
      speakingAnimationFrameId: 0
    };

    const peersRef = { current: new Map([["user-2", peer]]) } as any;

    bindVoicePeerConnectionHandlers({
      connection: connection as any,
      targetUserId: "user-2",
      targetLabel: "User Two",
      peersRef,
      sendWsEvent: vi.fn(),
      rememberRequestTarget: vi.fn(),
      pushCallLog: vi.fn(),
      clearPeerReconnectTimer,
      startPeerStatsMonitor,
      updateCallStatus,
      retryRemoteAudioPlayback,
      scheduleReconnect: vi.fn(),
      closePeer: vi.fn(),
      applyRemoteAudioOutput: vi.fn(async () => undefined),
      syncPeerVoiceState: vi.fn(),
      setRemoteVideoStream: vi.fn(),
      clearRemoteVideoStream: vi.fn(),
      audioMuted: false,
      outputVolume: 100
    });

    connection.connectionState = "connected";
    connection.onconnectionstatechange?.();

    expect(clearPeerReconnectTimer).toHaveBeenCalledWith("user-2");
    expect(startPeerStatsMonitor).toHaveBeenCalledWith("user-2", "User Two");
    expect(updateCallStatus).toHaveBeenCalled();
    expect(retryRemoteAudioPlayback).toHaveBeenCalledWith("rtc-connected");
    expect(peer.reconnectAttempts).toBe(0);
  });

  it("schedules reconnect on failed/disconnected and closes peer on closed", () => {
    const connection = createConnection();
    const scheduleReconnect = vi.fn();
    const closePeer = vi.fn();

    const peersRef = {
      current: new Map([
        [
          "user-2",
          {
            connection,
            audioElement: createAudioElement(),
            pendingRemoteCandidates: [],
            reconnectAttempts: 0,
            remoteStream: null,
            hasRemoteTrack: false,
            speakingAudioContext: null,
            speakingAnalyser: null,
            speakingData: null,
            speakingGain: null,
            hasRemoteSpeakingSignal: false,
            isRemoteMicMuted: false,
            isRemoteSpeaking: false,
            speakingLastAboveAt: 0,
            speakingAnimationFrameId: 0
          }
        ]
      ])
    } as any;

    bindVoicePeerConnectionHandlers({
      connection: connection as any,
      targetUserId: "user-2",
      targetLabel: "User Two",
      peersRef,
      sendWsEvent: vi.fn(),
      rememberRequestTarget: vi.fn(),
      pushCallLog: vi.fn(),
      clearPeerReconnectTimer: vi.fn(),
      startPeerStatsMonitor: vi.fn(),
      updateCallStatus: vi.fn(),
      retryRemoteAudioPlayback: vi.fn(),
      scheduleReconnect,
      closePeer,
      applyRemoteAudioOutput: vi.fn(async () => undefined),
      syncPeerVoiceState: vi.fn(),
      setRemoteVideoStream: vi.fn(),
      clearRemoteVideoStream: vi.fn(),
      audioMuted: false,
      outputVolume: 100
    });

    connection.connectionState = "failed";
    connection.onconnectionstatechange?.();
    connection.connectionState = "disconnected";
    connection.onconnectionstatechange?.();
    connection.connectionState = "closed";
    connection.onconnectionstatechange?.();

    expect(scheduleReconnect).toHaveBeenCalledWith("user-2", "failed");
    expect(scheduleReconnect).toHaveBeenCalledWith("user-2", "disconnected");
    expect(closePeer).toHaveBeenCalledWith("user-2");
  });

  it("attaches remote stream and updates video/audio routing", async () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = { AudioContext: undefined, webkitAudioContext: undefined };

    const connection = createConnection();
    const applyRemoteAudioOutput = vi.fn(async () => undefined);
    const updateCallStatus = vi.fn();
    const setRemoteVideoStream = vi.fn();
    const clearRemoteVideoStream = vi.fn();
    const retryRemoteAudioPlayback = vi.fn();
    const pushCallLog = vi.fn();

    const audioElement = createAudioElement();
    const trackAudio: any = { id: "track-audio", kind: "audio", onmute: null, onunmute: null, onended: null };
    const trackVideo: any = { id: "track-video", kind: "video", onmute: null, onunmute: null, onended: null };

    const stream = {
      id: "stream-1",
      getTracks: () => [trackAudio, trackVideo],
      getVideoTracks: () => [trackVideo],
      addTrack: vi.fn()
    } as any;

    const peer = {
      connection,
      audioElement,
      pendingRemoteCandidates: [],
      reconnectAttempts: 0,
      remoteStream: null,
      hasRemoteTrack: false,
      speakingAudioContext: null,
      speakingAnalyser: null,
      speakingData: null,
      speakingGain: null,
      hasRemoteSpeakingSignal: false,
      isRemoteMicMuted: false,
      isRemoteSpeaking: false,
      speakingLastAboveAt: 0,
      speakingAnimationFrameId: 0
    };

    const peersRef = { current: new Map([["user-2", peer]]) } as any;

    bindVoicePeerConnectionHandlers({
      connection: connection as any,
      targetUserId: "user-2",
      targetLabel: "User Two",
      peersRef,
      sendWsEvent: vi.fn(),
      rememberRequestTarget: vi.fn(),
      pushCallLog,
      clearPeerReconnectTimer: vi.fn(),
      startPeerStatsMonitor: vi.fn(),
      updateCallStatus,
      retryRemoteAudioPlayback,
      scheduleReconnect: vi.fn(),
      closePeer: vi.fn(),
      applyRemoteAudioOutput,
      syncPeerVoiceState: vi.fn(),
      setRemoteVideoStream,
      clearRemoteVideoStream,
      audioMuted: false,
      outputVolume: 100
    });

    connection.ontrack?.({ streams: [stream], track: trackVideo });

    await Promise.resolve();

    expect(peer.remoteStream).toBe(stream);
    expect(peer.hasRemoteTrack).toBe(true);
    expect(audioElement.srcObject).toBe(stream);
    expect(setRemoteVideoStream).toHaveBeenCalledWith("user-2", stream);
    expect(applyRemoteAudioOutput).toHaveBeenCalledWith(audioElement);
    expect(updateCallStatus).toHaveBeenCalled();

    trackVideo.onmute?.();
    trackVideo.onunmute?.();
    trackVideo.onended?.();

    expect(clearRemoteVideoStream).toHaveBeenCalledWith("user-2");
    expect(retryRemoteAudioPlayback).toHaveBeenCalledWith("track-unmuted");

    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });
});
