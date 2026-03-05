import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalDescriptionAfterIceGathering,
  findSenderByKind,
  normalizeRtcText,
  parseLocalCandidateMeta
} from "./voiceCallUtils";

type IceState = "new" | "gathering" | "complete";

function createConnectionMock(args?: { state?: IceState; type?: string; sdp?: string }) {
  const listeners = new Map<string, Set<() => void>>();
  const connection = {
    iceGatheringState: args?.state || "new",
    localDescription: {
      type: args?.type || "offer",
      sdp: args?.sdp || "v=0"
    },
    addEventListener: vi.fn((event: string, cb: () => void) => {
      const set = listeners.get(event) || new Set<() => void>();
      set.add(cb);
      listeners.set(event, set);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      listeners.get(event)?.delete(cb);
    })
  } as any;

  return {
    connection,
    emit(event: string) {
      listeners.get(event)?.forEach((cb) => cb());
    }
  };
}

describe("voiceCallUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses local ICE candidate metadata", () => {
    const meta = parseLocalCandidateMeta(
      "candidate:0 1 udp 2122260223 10.0.0.1 8998 typ host"
    );

    expect(meta).toEqual({
      type: "host",
      transport: "udp",
      address: "10.0.0.1",
      port: "8998"
    });
  });

  it("normalizes rtc text values", () => {
    expect(normalizeRtcText("  user-1  ")).toBe("user-1");
    expect(normalizeRtcText(undefined)).toBe("");
  });

  it("finds sender by direct sender track first", () => {
    const audioSender = { track: { kind: "audio" } } as RTCRtpSender;
    const connection = {
      getSenders: () => [audioSender],
      getTransceivers: () => []
    } as any;

    expect(findSenderByKind(connection, "audio")).toBe(audioSender);
  });

  it("falls back to transceiver sender lookup when direct sender is absent", () => {
    const videoSender = { track: null } as unknown as RTCRtpSender;
    const connection = {
      getSenders: () => [],
      getTransceivers: () => [
        {
          sender: videoSender,
          receiver: { track: { kind: "video" } }
        }
      ]
    } as any;

    expect(findSenderByKind(connection, "video")).toBe(videoSender);
  });

  it("returns already-complete when ICE gathering is complete", async () => {
    const { connection } = createConnectionMock({ state: "complete", type: "answer", sdp: "answer-sdp" });

    const result = await buildLocalDescriptionAfterIceGathering(connection as RTCPeerConnection);

    expect(result.settledBy).toBe("already-complete");
    expect(result.signal).toEqual({ type: "answer", sdp: "answer-sdp" });
  });

  it("settles by complete event or timeout", async () => {
    const first = createConnectionMock({ state: "gathering", type: "offer", sdp: "offer-sdp" });
    const completePromise = buildLocalDescriptionAfterIceGathering(first.connection as RTCPeerConnection);
    first.connection.iceGatheringState = "complete";
    first.emit("icegatheringstatechange");
    const completeResult = await completePromise;

    expect(completeResult.settledBy).toBe("complete");
    expect(completeResult.signal).toEqual({ type: "offer", sdp: "offer-sdp" });

    const second = createConnectionMock({ state: "gathering", type: "offer", sdp: "timeout-sdp" });
    const timeoutPromise = buildLocalDescriptionAfterIceGathering(second.connection as RTCPeerConnection, 250);
    await vi.advanceTimersByTimeAsync(260);
    const timeoutResult = await timeoutPromise;

    expect(timeoutResult.settledBy).toBe("timeout");
    expect(timeoutResult.signal).toEqual({ type: "offer", sdp: "timeout-sdp" });
  });
});
