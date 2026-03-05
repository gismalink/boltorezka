import {
  isDesignatedOfferer,
  OFFER_ICE_RESTART_MIN_INTERVAL_MS,
  OFFER_MIN_INTERVAL_MS,
  OFFER_VIDEO_SYNC_MIN_INTERVAL_MS,
  resolveOfferMinIntervalMs
} from "./voiceCallOfferPolicy";

describe("voiceCallOfferPolicy", () => {
  it("applies manual cadence by default", () => {
    expect(resolveOfferMinIntervalMs("manual")).toBe(OFFER_MIN_INTERVAL_MS);
  });

  it("applies video-sync cadence for video reasons", () => {
    expect(resolveOfferMinIntervalMs("video-sync:watchdog")).toBe(OFFER_VIDEO_SYNC_MIN_INTERVAL_MS);
  });

  it("prioritizes ice-restart cadence over reason", () => {
    expect(resolveOfferMinIntervalMs("manual", true)).toBe(OFFER_ICE_RESTART_MIN_INTERVAL_MS);
    expect(resolveOfferMinIntervalMs("video-sync:remote", true)).toBe(OFFER_ICE_RESTART_MIN_INTERVAL_MS);
  });

  it("uses deterministic user-id ordering for designated offerer", () => {
    expect(isDesignatedOfferer("a-user", "b-user")).toBe(true);
    expect(isDesignatedOfferer("b-user", "a-user")).toBe(false);
  });
});
