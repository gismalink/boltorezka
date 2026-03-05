import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useRef: vi.fn((initial: unknown) => ({ current: initial })),
  useCallback: vi.fn((fn: unknown) => fn)
}));

vi.mock("react", () => ({
  useEffect: reactMocks.useEffect,
  useRef: reactMocks.useRef,
  useCallback: reactMocks.useCallback
}));

vi.mock("../../utils/voiceDiagnostics", () => ({
  logVoiceDiagnostics: vi.fn()
}));

vi.mock("../../utils/videoPixelPipeline", () => ({
  createProcessedVideoTrack: vi.fn(),
  extractTrackConstraints: vi.fn(() => ({ width: 320, height: 240, fps: 15 }))
}));

import { useVoiceRuntimeMediaEffects } from "./useVoiceRuntimeMediaEffects";

function createBaseArgs(overrides: Record<string, unknown> = {}) {
  const audioTrack = { enabled: true } as MediaStreamTrack;
  const localStream = {
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [],
    getTracks: () => [audioTrack]
  } as unknown as MediaStream;

  const peer = {
    audioElement: { id: "remote-audio" } as unknown as HTMLAudioElement,
    connection: { getSenders: () => [], getTransceivers: () => [] },
    speakingGain: null,
    speakingAudioContext: null
  };

  return {
    audioTrack,
    args: {
      localStreamRef: { current: localStream },
      peersRef: { current: new Map([["u2", peer]]) },
      roomVoiceConnected: false,
      allowVideoStreaming: false,
      videoStreamingEnabled: false,
      serverVideoEffectType: "none",
      serverVideoPixelFxStrength: 0,
      serverVideoPixelFxPixelSize: 0,
      serverVideoPixelFxGridThickness: 0,
      serverVideoAsciiCellSize: 0,
      serverVideoAsciiContrast: 0,
      serverVideoAsciiColor: "#fff",
      selectedInputId: "default",
      selectedVideoInputId: "default",
      micMuted: true,
      audioMuted: false,
      outputVolume: 100,
      getAudioConstraints: () => ({ echoCancellation: true }),
      getVideoConstraints: () => false,
      setLocalVideoStream: vi.fn(),
      applyRemoteAudioOutput: vi.fn(async () => undefined),
      retryRemoteAudioPlayback: vi.fn(),
      onVideoTrackSyncNeeded: vi.fn(),
      pushCallLog: vi.fn(),
      pushToastThrottled: vi.fn(),
      t: (key: string) => key,
      ...overrides
    }
  };
}

describe("useVoiceRuntimeMediaEffects", () => {
  beforeEach(() => {
    reactMocks.useEffect.mockImplementation((effect: () => void | (() => void)) => {
      effect();
    });

    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    });

    vi.stubGlobal("navigator", {
      mediaDevices: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getUserMedia: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("syncs local audio track enabled flag from micMuted", () => {
    const { args, audioTrack } = createBaseArgs({ micMuted: true });

    useVoiceRuntimeMediaEffects(args as any);

    expect(audioTrack.enabled).toBe(false);
  });

  it("applies remote audio output for existing peers", () => {
    const { args } = createBaseArgs();

    useVoiceRuntimeMediaEffects(args as any);

    expect(args.applyRemoteAudioOutput).toHaveBeenCalledWith({ id: "remote-audio" });
  });

  it("registers gesture handlers that trigger retry callback", () => {
    const listeners = new Map<string, (event?: Event) => void>();
    (window.addEventListener as unknown as ReturnType<typeof vi.fn>).mockImplementation((type: string, cb: (event?: Event) => void) => {
      listeners.set(type, cb);
    });

    const { args } = createBaseArgs();

    useVoiceRuntimeMediaEffects(args as any);

    const pointerHandler = listeners.get("pointerdown");
    expect(pointerHandler).toBeTruthy();

    pointerHandler?.();
    expect(args.retryRemoteAudioPlayback).toHaveBeenCalledWith("user-gesture");
  });
});
