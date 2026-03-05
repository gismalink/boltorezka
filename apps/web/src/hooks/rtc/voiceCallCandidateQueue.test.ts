import { describe, expect, it, vi } from "vitest";
import { flushQueuedRemoteCandidatesForPeer } from "./voiceCallCandidateQueue";

function createPeer(overrides: Record<string, unknown> = {}) {
  return {
    connection: {
      remoteDescription: { type: "offer", sdp: "dummy" },
      addIceCandidate: vi.fn(async () => undefined)
    },
    pendingRemoteCandidates: [],
    ...overrides
  } as any;
}

describe("voiceCallCandidateQueue", () => {
  it("flushes all queued remote candidates", async () => {
    const pushCallLog = vi.fn();
    const peer = createPeer({
      pendingRemoteCandidates: [{ candidate: "candidate:1" }, { candidate: "candidate:2" }]
    });

    await flushQueuedRemoteCandidatesForPeer({
      peer,
      targetUserId: "user-2",
      targetLabel: "User 2",
      pushCallLog,
      createIceCandidate: (candidate) => candidate as unknown as RTCIceCandidate
    });

    expect(peer.pendingRemoteCandidates).toHaveLength(0);
    expect(peer.connection.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(pushCallLog).toHaveBeenCalledWith("call.ice queued flushed <- User 2 (2)");
  });

  it("logs individual failures while still flushing queue", async () => {
    const pushCallLog = vi.fn();
    const peer = createPeer({
      pendingRemoteCandidates: [{ candidate: "candidate:1" }, { candidate: "candidate:2" }],
      connection: {
        remoteDescription: { type: "offer", sdp: "dummy" },
        addIceCandidate: vi
          .fn()
          .mockRejectedValueOnce(new Error("bad candidate"))
          .mockResolvedValueOnce(undefined)
      }
    });

    await flushQueuedRemoteCandidatesForPeer({
      peer,
      targetUserId: "user-2",
      targetLabel: "",
      pushCallLog,
      createIceCandidate: (candidate) => candidate as unknown as RTCIceCandidate
    });

    expect(pushCallLog).toHaveBeenCalledWith("call.ice queued handling failed (user-2): bad candidate");
    expect(pushCallLog).toHaveBeenCalledWith("call.ice queued flushed <- user-2 (2)");
  });

  it("does nothing when remote description is missing", async () => {
    const pushCallLog = vi.fn();
    const peer = createPeer({
      connection: {
        remoteDescription: null,
        addIceCandidate: vi.fn(async () => undefined)
      },
      pendingRemoteCandidates: [{ candidate: "candidate:1" }]
    });

    await flushQueuedRemoteCandidatesForPeer({
      peer,
      targetUserId: "user-2",
      targetLabel: "User 2",
      pushCallLog,
      createIceCandidate: (candidate) => candidate as unknown as RTCIceCandidate
    });

    expect(peer.pendingRemoteCandidates).toHaveLength(1);
    expect(peer.connection.addIceCandidate).not.toHaveBeenCalled();
    expect(pushCallLog).not.toHaveBeenCalled();
  });
});
