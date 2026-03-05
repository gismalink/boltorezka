import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  incrementVoiceCounter: vi.fn(),
  decrementVoiceCounter: vi.fn(),
  logVoiceDiagnostics: vi.fn(),
  bindVoicePeerConnectionHandlers: vi.fn(),
  createHiddenRemoteAudioElement: vi.fn(() => ({ id: "audio-el" } as any)),
  disposeVoicePeerContext: vi.fn()
}));

vi.mock("../../utils/voiceDiagnostics", () => ({
  incrementVoiceCounter: mocks.incrementVoiceCounter,
  decrementVoiceCounter: mocks.decrementVoiceCounter,
  logVoiceDiagnostics: mocks.logVoiceDiagnostics
}));

vi.mock("./voiceCallPeerConnectionHandlers", () => ({
  bindVoicePeerConnectionHandlers: mocks.bindVoicePeerConnectionHandlers
}));

vi.mock("./voiceCallPeerLifecycle", () => ({
  createHiddenRemoteAudioElement: mocks.createHiddenRemoteAudioElement,
  createVoicePeerContext: vi.fn((connection: RTCPeerConnection, audioElement: HTMLAudioElement, targetLabel: string) => ({
    connection,
    audioElement,
    label: targetLabel,
    hasRemoteTrack: false,
    pendingRemoteCandidates: []
  })),
  disposeVoicePeerContext: mocks.disposeVoicePeerContext
}));

import {
  closePeerForRtc,
  deriveCallStatusForRtc,
  ensurePeerConnectionForRtc
} from "./voiceCallPeerRegistry";

describe("voiceCallPeerRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives active/connecting/idle statuses from peer map", () => {
    const peersRef = {
      current: new Map([
        ["u1", { connection: { connectionState: "connected" }, hasRemoteTrack: false }],
        ["u2", { connection: { connectionState: "new" }, hasRemoteTrack: false }],
        ["u3", { connection: { connectionState: "closed" }, hasRemoteTrack: true }]
      ])
    } as any;

    const result = deriveCallStatusForRtc(peersRef);
    expect(result.status).toBe("active");
    expect(result.connectedUserIds).toEqual(["u1", "u3"]);
    expect(result.connectingUserIds).toEqual(["u2"]);

    const connectingOnly = {
      current: new Map([
        ["u2", { connection: { connectionState: "connecting" }, hasRemoteTrack: false }]
      ])
    } as any;
    expect(deriveCallStatusForRtc(connectingOnly).status).toBe("connecting");

    const idleOnly = {
      current: new Map([
        ["u9", { connection: { connectionState: "closed" }, hasRemoteTrack: false }]
      ])
    } as any;
    expect(deriveCallStatusForRtc(idleOnly).status).toBe("idle");
  });

  it("closes and removes peer with cleanup side effects", () => {
    const peer = {
      connection: { connectionState: "connected" },
      label: "User Two",
      hasRemoteTrack: true
    } as any;

    const peersRef = { current: new Map([["u2", peer]]) } as any;
    const clearPeerReconnectTimer = vi.fn();
    const clearPeerStatsTimer = vi.fn();
    const clearRemoteVideoStream = vi.fn();
    const syncPeerVoiceState = vi.fn();
    const updateCallStatus = vi.fn();
    const pushCallLog = vi.fn();

    closePeerForRtc({
      targetUserId: "u2",
      peersRef,
      clearPeerReconnectTimer,
      clearPeerStatsTimer,
      clearRemoteVideoStream,
      syncPeerVoiceState,
      updateCallStatus,
      pushCallLog,
      reason: "manual close"
    });

    expect(clearPeerReconnectTimer).toHaveBeenCalledWith("u2");
    expect(clearPeerStatsTimer).toHaveBeenCalledWith("u2");
    expect(mocks.disposeVoicePeerContext).toHaveBeenCalledWith(peer);
    expect(peersRef.current.has("u2")).toBe(false);
    expect(clearRemoteVideoStream).toHaveBeenCalledWith("u2");
    expect(syncPeerVoiceState).toHaveBeenCalled();
    expect(updateCallStatus).toHaveBeenCalled();
    expect(pushCallLog).toHaveBeenCalledWith("manual close");
    expect(mocks.decrementVoiceCounter).toHaveBeenCalledWith("runtimePeers");
    expect(mocks.decrementVoiceCounter).toHaveBeenCalledWith("runtimeAudioElements");
  });

  it("creates and binds new peer connection when missing", () => {
    const fakeConnection = { connectionState: "new" } as any;
    const RTCPeerConnectionMock = vi.fn(() => fakeConnection);
    vi.stubGlobal("RTCPeerConnection", RTCPeerConnectionMock as any);

    const peersRef = { current: new Map() } as any;
    const applyRemoteAudioOutput = vi.fn(async () => undefined);

    const connection = ensurePeerConnectionForRtc({
      targetUserId: "u2",
      targetLabel: "User Two",
      peersRef,
      sendWsEvent: vi.fn(),
      rememberRequestTarget: vi.fn(),
      pushCallLog: vi.fn(),
      clearPeerReconnectTimer: vi.fn(),
      startPeerStatsMonitor: vi.fn(),
      updateCallStatus: vi.fn(),
      retryRemoteAudioPlayback: vi.fn(),
      scheduleReconnect: vi.fn(),
      closePeer: vi.fn(),
      setRemoteVideoStream: vi.fn(),
      clearRemoteVideoStream: vi.fn(),
      applyRemoteAudioOutput,
      syncPeerVoiceState: vi.fn(),
      audioMuted: false,
      outputVolume: 100
    });

    expect(connection).toBe(fakeConnection);
    expect(peersRef.current.has("u2")).toBe(true);
    expect(mocks.createHiddenRemoteAudioElement).toHaveBeenCalled();
    expect(mocks.bindVoicePeerConnectionHandlers).toHaveBeenCalled();
    expect(applyRemoteAudioOutput).toHaveBeenCalledWith({ id: "audio-el" });
    expect(mocks.incrementVoiceCounter).toHaveBeenCalledWith("runtimePeers");
    expect(mocks.incrementVoiceCounter).toHaveBeenCalledWith("runtimeAudioElements");
  });

  it("reuses existing peer connection and updates label", () => {
    const existingConnection = { connectionState: "connected" } as any;
    const existingPeer = {
      connection: existingConnection,
      label: "Old Name",
      hasRemoteTrack: false
    } as any;

    const peersRef = { current: new Map([["u2", existingPeer]]) } as any;

    const connection = ensurePeerConnectionForRtc({
      targetUserId: "u2",
      targetLabel: "New Name",
      peersRef,
      sendWsEvent: vi.fn(),
      rememberRequestTarget: vi.fn(),
      pushCallLog: vi.fn(),
      clearPeerReconnectTimer: vi.fn(),
      startPeerStatsMonitor: vi.fn(),
      updateCallStatus: vi.fn(),
      retryRemoteAudioPlayback: vi.fn(),
      scheduleReconnect: vi.fn(),
      closePeer: vi.fn(),
      setRemoteVideoStream: vi.fn(),
      clearRemoteVideoStream: vi.fn(),
      applyRemoteAudioOutput: vi.fn(async () => undefined),
      syncPeerVoiceState: vi.fn(),
      audioMuted: false,
      outputVolume: 100
    });

    expect(connection).toBe(existingConnection);
    expect(existingPeer.label).toBe("New Name");
    expect(mocks.bindVoicePeerConnectionHandlers).not.toHaveBeenCalled();
    expect(mocks.createHiddenRemoteAudioElement).not.toHaveBeenCalled();
  });
});
