import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHiddenRemoteAudioElement,
  createVoicePeerContext,
  disposeVoicePeerContext
} from "./voiceCallPeerLifecycle";

describe("voiceCallPeerLifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates hidden remote audio element with expected defaults", () => {
    const appendChild = vi.fn();
    const setAttribute = vi.fn();
    const element = {
      autoplay: false,
      setAttribute,
      style: {} as Record<string, string>,
      dataset: {} as Record<string, string>
    } as any;

    vi.stubGlobal("document", {
      createElement: vi.fn(() => element),
      body: { appendChild }
    });

    const audio = createHiddenRemoteAudioElement();

    expect(audio).toBe(element);
    expect(element.autoplay).toBe(true);
    expect(setAttribute).toHaveBeenCalledWith("playsinline", "true");
    expect(element.style.left).toBe("-9999px");
    expect(element.style.top).toBe("-9999px");
    expect(element.dataset.audioRoute).toBe("element");
    expect(appendChild).toHaveBeenCalledWith(element);
  });

  it("creates voice peer context with negotiation defaults", () => {
    const connection = { connectionState: "new" } as any;
    const audioElement = {} as any;

    const peer = createVoicePeerContext(connection, audioElement, "Target Label");

    expect(peer.connection).toBe(connection);
    expect(peer.audioElement).toBe(audioElement);
    expect(peer.label).toBe("Target Label");
    expect(peer.hasRemoteTrack).toBe(false);
    expect(peer.pendingRemoteCandidates).toEqual([]);
    expect(peer.makingOffer).toBe(false);
    expect(peer.offerInFlight).toBe(false);
    expect(peer.lastOfferAt).toBe(0);
  });

  it("disposes voice peer context and clears media/runtime resources", () => {
    const closeAudioContext = vi.fn(async () => undefined);
    const connection = {
      onicecandidate: vi.fn(),
      onicecandidateerror: vi.fn(),
      oniceconnectionstatechange: vi.fn(),
      onicegatheringstatechange: vi.fn(),
      onconnectionstatechange: vi.fn(),
      ontrack: vi.fn(),
      close: vi.fn()
    } as any;
    const audioElement = {
      pause: vi.fn(),
      remove: vi.fn(),
      srcObject: { id: "stream" }
    } as any;

    const cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameSpy);

    const peer = {
      connection,
      audioElement,
      speakingAnimationFrameId: 42,
      speakingAudioContext: { close: closeAudioContext },
      speakingSource: {},
      speakingGain: {},
      speakingAnalyser: {},
      speakingData: new Uint8Array(8)
    } as any;

    disposeVoicePeerContext(peer);

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(42);
    expect(peer.speakingAnimationFrameId).toBe(0);
    expect(closeAudioContext).toHaveBeenCalled();
    expect(peer.speakingAudioContext).toBe(null);
    expect(peer.speakingSource).toBe(null);
    expect(peer.speakingGain).toBe(null);
    expect(peer.speakingAnalyser).toBe(null);
    expect(peer.speakingData).toBe(null);
    expect(connection.close).toHaveBeenCalled();
    expect(audioElement.pause).toHaveBeenCalled();
    expect(audioElement.srcObject).toBe(null);
    expect(audioElement.remove).toHaveBeenCalled();
    expect(connection.ontrack).toBe(null);
  });
});
