import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./voiceCallConfig", () => ({
  RTC_INBOUND_STALL_TICKS: 3,
  RTC_RECONNECT_BASE_DELAY_MS: 1000,
  RTC_RECONNECT_MAX_ATTEMPTS: 3,
  RTC_RECONNECT_MAX_DELAY_MS: 8000,
  RTC_STATS_POLL_MS: 2500
}));

import { schedulePeerReconnectForTarget } from "./voiceCallPeerRecovery";

describe("voiceCallPeerRecovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("closes peer immediately when local side is not designated offerer", () => {
    const peersRef = {
      current: new Map([
        ["target-1", { reconnectAttempts: 0, reconnectTimer: null, label: "Target" }]
      ])
    } as any;

    const closePeer = vi.fn();
    const startOffer = vi.fn();

    schedulePeerReconnectForTarget({
      roomVoiceConnectedRef: { current: true },
      peersRef,
      targetUserId: "target-1",
      trigger: "ice-failed",
      shouldInitiateOffer: () => false,
      closePeer,
      updateCallStatus: vi.fn(),
      pushCallLog: vi.fn(),
      startOffer
    });

    expect(closePeer).toHaveBeenCalledWith("target-1", "rtc ice-failed, waiting remote re-offer");
    expect(startOffer).not.toHaveBeenCalled();
  });

  it("schedules reconnect and invokes startOffer", async () => {
    const peersRef = {
      current: new Map([
        ["target-2", { reconnectAttempts: 0, reconnectTimer: null, label: "Target 2" }]
      ])
    } as any;

    const startOffer = vi.fn(async () => undefined);

    schedulePeerReconnectForTarget({
      roomVoiceConnectedRef: { current: true },
      peersRef,
      targetUserId: "target-2",
      trigger: "ice-failed",
      shouldInitiateOffer: () => true,
      closePeer: vi.fn(),
      updateCallStatus: vi.fn(),
      pushCallLog: vi.fn(),
      startOffer
    });

    expect(peersRef.current.get("target-2").reconnectAttempts).toBe(1);

    await vi.runAllTimersAsync();
    expect(startOffer).toHaveBeenCalledWith("target-2", "Target 2");
  });
});
