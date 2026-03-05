import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRoomTargetsResyncTimerForRtc,
  scheduleRoomTargetsResyncForRtc,
  syncRoomTargetsForRtc
} from "./voiceCallTargetSync";

describe("voiceCallTargetSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears existing room target resync timer", () => {
    const timerRef = { current: window.setTimeout(() => undefined, 1000) };

    clearRoomTargetsResyncTimerForRtc(timerRef);

    expect(timerRef.current).toBe(null);
  });

  it("schedules resync and executes only when room is connected", async () => {
    const sync = vi.fn(async () => undefined);
    const timerRef = { current: null as number | null };
    const roomVoiceConnectedRef = { current: true };
    const syncRoomTargetsRef = { current: sync };

    scheduleRoomTargetsResyncForRtc({
      timerRef,
      roomVoiceConnectedRef,
      syncRoomTargetsRef,
      delayMs: 250
    });

    expect(timerRef.current).not.toBe(null);

    await vi.advanceTimersByTimeAsync(260);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(timerRef.current).toBe(null);

    roomVoiceConnectedRef.current = false;
    scheduleRoomTargetsResyncForRtc({
      timerRef,
      roomVoiceConnectedRef,
      syncRoomTargetsRef,
      delayMs: 100
    });
    await vi.advanceTimersByTimeAsync(120);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("disconnects missing peers and starts offers for new targets", async () => {
    const peersRef = {
      current: new Map([
        ["stay-user", { label: "Stay" }],
        ["leave-user", { label: "Leave" }]
      ])
    } as any;

    const startOffer = vi.fn(async () => undefined);
    const closePeer = vi.fn();
    const updateCallStatus = vi.fn();
    const pushCallLog = vi.fn();

    await syncRoomTargetsForRtc({
      roomVoiceConnectedRef: { current: true },
      roomVoiceTargetsRef: {
        current: [
          { userId: "stay-user", userName: "Stay" },
          { userId: "new-user", userName: "New User" }
        ]
      } as any,
      peersRef,
      isTargetTemporarilyBlocked: () => false,
      shouldInitiateOffer: (userId) => userId === "new-user",
      startOffer,
      closePeer,
      updateCallStatus,
      pushCallLog
    });

    expect(closePeer).toHaveBeenCalledWith("leave-user", "peer left room: leave-user");
    expect(startOffer).toHaveBeenCalledWith("new-user", "New User");
    expect(pushCallLog).not.toHaveBeenCalledWith(expect.stringContaining("awaiting offer"));
    expect(updateCallStatus).toHaveBeenCalled();
  });

  it("skips blocked users and logs awaiting remote offer for non-initiator", async () => {
    const peersRef = { current: new Map() } as any;
    const startOffer = vi.fn(async () => undefined);
    const closePeer = vi.fn();
    const updateCallStatus = vi.fn();
    const pushCallLog = vi.fn();

    await syncRoomTargetsForRtc({
      roomVoiceConnectedRef: { current: true },
      roomVoiceTargetsRef: {
        current: [
          { userId: "blocked-user", userName: "Blocked" },
          { userId: "remote-offerer", userName: "Remote Offerer" }
        ]
      } as any,
      peersRef,
      isTargetTemporarilyBlocked: (userId) => userId === "blocked-user",
      shouldInitiateOffer: () => false,
      startOffer,
      closePeer,
      updateCallStatus,
      pushCallLog
    });

    expect(startOffer).not.toHaveBeenCalled();
    expect(closePeer).not.toHaveBeenCalled();
    expect(pushCallLog).toHaveBeenCalledWith("voice room awaiting offer <- Remote Offerer");
    expect(updateCallStatus).toHaveBeenCalled();
  });
});
