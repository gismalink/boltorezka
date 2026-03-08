// Purpose: Shared offer policy for RTC runtime and signal handlers.

export type OfferReason = "manual" | "inbound-stalled" | `video-sync:${string}`;
export type OfferCadenceBucket = "manual" | "video-sync" | "ice-restart";

export const OFFER_MIN_INTERVAL_MS = 18000;

// Keep video-sync cadence comfortably above server OfferRateLimited threshold (5s)
// to avoid edge collisions from simultaneous reconnect/sync triggers.
export const OFFER_VIDEO_SYNC_MIN_INTERVAL_MS = 15000;

export const OFFER_ICE_RESTART_MIN_INTERVAL_MS = 12000;

export const OFFER_RETRY_BUDGET_BY_BUCKET: Record<OfferCadenceBucket, number> = {
  manual: 1,
  "ice-restart": 1,
  "video-sync": 0
};

const OFFER_RETRY_DELAY_BASE_MS_BY_BUCKET: Record<OfferCadenceBucket, number> = {
  manual: 700,
  "ice-restart": 500,
  "video-sync": 900
};

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

export function resolveOfferRetryBudget(bucket: OfferCadenceBucket): number {
  return OFFER_RETRY_BUDGET_BY_BUCKET[bucket] || 0;
}

export function resolveOfferRetryDelayMs(bucket: OfferCadenceBucket, attempt: number): number {
  const safeAttempt = Math.max(1, Math.min(4, Math.round(attempt)));
  const baseMs = OFFER_RETRY_DELAY_BASE_MS_BY_BUCKET[bucket] || 700;
  return baseMs * safeAttempt;
}
