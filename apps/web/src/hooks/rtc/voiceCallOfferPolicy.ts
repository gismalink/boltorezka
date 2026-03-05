// Purpose: Shared offer policy for RTC runtime and signal handlers.

export type OfferReason = "manual" | "inbound-stalled" | `video-sync:${string}`;
export type OfferCadenceBucket = "manual" | "video-sync" | "ice-restart";

export const OFFER_MIN_INTERVAL_MS = 10000;

// Keep video-sync cadence at/above server OfferRateLimited threshold (5s).
export const OFFER_VIDEO_SYNC_MIN_INTERVAL_MS = 5000;

export const OFFER_ICE_RESTART_MIN_INTERVAL_MS = 5000;

export function isDesignatedOfferer(localUserId: string, targetUserId: string): boolean {
  const local = String(localUserId || "").trim();
  const target = String(targetUserId || "").trim();
  if (!target) {
    return false;
  }
  if (!local) {
    return true;
  }
  return local.localeCompare(target) < 0;
}

export function isVideoSyncReason(reason: string): boolean {
  return String(reason || "").startsWith("video-sync:");
}

export function resolveOfferMinIntervalMs(reason: string, iceRestart?: boolean): number {
  if (iceRestart) {
    return OFFER_ICE_RESTART_MIN_INTERVAL_MS;
  }
  if (isVideoSyncReason(reason)) {
    return OFFER_VIDEO_SYNC_MIN_INTERVAL_MS;
  }
  return OFFER_MIN_INTERVAL_MS;
}

export function resolveOfferCadenceBucket(reason: string, iceRestart?: boolean): OfferCadenceBucket {
  if (iceRestart) {
    return "ice-restart";
  }
  if (isVideoSyncReason(reason)) {
    return "video-sync";
  }
  return "manual";
}
