import { describe, expect, it } from "vitest";
import { getSelfMonitorGain, shouldUseRnnoiseInSelfMonitor } from "./selfMonitorUtils";

describe("useMicrophoneSelfMonitor helpers", () => {
  it("clamps monitor gain to valid range", () => {
    expect(getSelfMonitorGain(-10)).toBe(0);
    expect(getSelfMonitorGain(0)).toBe(0);
    expect(getSelfMonitorGain(50)).toBeCloseTo(0.35, 5);
    expect(getSelfMonitorGain(100)).toBeCloseTo(0.7, 5);
    expect(getSelfMonitorGain(500)).toBe(0.7);
  });

  it("enables RNNoise monitor only for noise_reduction profile", () => {
    expect(shouldUseRnnoiseInSelfMonitor("noise_reduction")).toBe(true);
    expect(shouldUseRnnoiseInSelfMonitor("studio")).toBe(false);
    expect(shouldUseRnnoiseInSelfMonitor("custom")).toBe(false);
  });
});
