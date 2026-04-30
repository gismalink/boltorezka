import { describe, it, expect } from "vitest";
import { extractTrackConstraints } from "./videoPixelPipeline";

describe("extractTrackConstraints", () => {
  it("returns defaults when constraints is false", () => {
    expect(extractTrackConstraints(false)).toEqual({ width: 320, height: 240, fps: 15 });
  });

  it("accepts numeric width/height/frameRate", () => {
    expect(extractTrackConstraints({ width: 640, height: 480, frameRate: 24 })).toEqual({
      width: 640,
      height: 480,
      fps: 24
    });
  });

  it("accepts ConstrainObject with ideal", () => {
    expect(
      extractTrackConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      })
    ).toEqual({ width: 1280, height: 720, fps: 30 });
  });

  it("falls back to defaults when ideal missing", () => {
    expect(extractTrackConstraints({ width: { min: 1 }, height: { max: 99 }, frameRate: { min: 1 } })).toEqual({
      width: 320,
      height: 240,
      fps: 15
    });
  });

  it("rounds and enforces min 1 for width/height", () => {
    expect(extractTrackConstraints({ width: 0.4, height: 0, frameRate: 15 })).toEqual({
      width: 1,
      height: 1,
      fps: 15
    });
  });

  it("clamps fps to [5, 30]", () => {
    expect(extractTrackConstraints({ width: 1, height: 1, frameRate: 1 }).fps).toBe(5);
    expect(extractTrackConstraints({ width: 1, height: 1, frameRate: 120 }).fps).toBe(30);
  });

  it("rounds fractional fps", () => {
    expect(extractTrackConstraints({ width: 1, height: 1, frameRate: 23.6 }).fps).toBe(24);
  });

  it("uses defaults when no width/height/frameRate keys present", () => {
    expect(extractTrackConstraints({})).toEqual({ width: 320, height: 240, fps: 15 });
  });
});
