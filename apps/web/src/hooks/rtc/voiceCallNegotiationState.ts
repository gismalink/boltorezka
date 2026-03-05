import type { VoicePeerContext } from "./voiceCallTypes";
import type { OfferCadenceBucket } from "./voiceCallOfferPolicy";

// Negotiation transition model:
// 1) start offer: makingOffer=true -> offerInFlight=true
// 2) glare handling may set ignoreOffer=true for local designated offerer path
// 3) when answer is being applied: isSettingRemoteAnswerPending=true
// 4) completion path resets volatile flags and records offer cadence timestamps
// These flags are intentionally independent to represent overlapping async phases.

export function createNegotiationStateDefaults() {
  return {
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    offerInFlight: false,
    lastOfferAt: 0,
    lastOfferAtByBucket: {}
  };
}

export function hasOfferCollision(peer: VoicePeerContext | undefined): boolean {
  if (!peer) {
    return false;
  }

  return peer.makingOffer
    || peer.isSettingRemoteAnswerPending
    || peer.connection.signalingState !== "stable";
}

export function markMakingOffer(peer: VoicePeerContext | undefined, value: boolean) {
  if (!peer) {
    return;
  }
  peer.makingOffer = value;
}

export function markOfferInFlight(peer: VoicePeerContext | undefined, value: boolean) {
  if (!peer) {
    return;
  }
  peer.offerInFlight = value;
}

export function markIgnoreOffer(peer: VoicePeerContext | undefined, value: boolean) {
  if (!peer) {
    return;
  }
  peer.ignoreOffer = value;
}

export function markSettingRemoteAnswerPending(peer: VoicePeerContext | undefined, value: boolean) {
  if (!peer) {
    return;
  }
  peer.isSettingRemoteAnswerPending = value;
}

export function markOfferSentNow(peer: VoicePeerContext | undefined) {
  markOfferSentNowForBucket(peer, "manual");
}

export function getLastOfferAtForBucket(peer: VoicePeerContext | undefined, bucket: OfferCadenceBucket): number {
  if (!peer) {
    return 0;
  }

  return peer.lastOfferAtByBucket[bucket] || 0;
}

export function markOfferSentNowForBucket(
  peer: VoicePeerContext | undefined,
  bucket: OfferCadenceBucket,
  at = Date.now()
) {
  if (!peer) {
    return;
  }

  peer.lastOfferAt = at;
  peer.lastOfferAtByBucket[bucket] = at;
}

export type QueuedOfferRequest = {
  targetUserId: string;
  targetLabel: string;
  reason: string;
  iceRestart: boolean;
  cadenceBucket: OfferCadenceBucket;
  attempt: number;
  enqueuedAt: number;
};

type OfferQueueBuckets = {
  manual: QueuedOfferRequest[];
  "ice-restart": QueuedOfferRequest[];
  "video-sync": QueuedOfferRequest[];
};

export type OfferQueueState = {
  buckets: OfferQueueBuckets;
  cursor: number;
  activeTargets: Set<string>;
};

const OFFER_QUEUE_ORDER: OfferCadenceBucket[] = ["manual", "ice-restart", "video-sync"];

const OFFER_QUEUE_PRIORITY: Record<OfferCadenceBucket, number> = {
  manual: 3,
  "ice-restart": 2,
  "video-sync": 1
};

export function createOfferQueueState(): OfferQueueState {
  return {
    buckets: {
      manual: [],
      "ice-restart": [],
      "video-sync": []
    },
    cursor: 0,
    activeTargets: new Set<string>()
  };
}

export function clearOfferQueue(state: OfferQueueState): void {
  state.buckets.manual = [];
  state.buckets["ice-restart"] = [];
  state.buckets["video-sync"] = [];
  state.activeTargets.clear();
  state.cursor = 0;
}

export function markOfferQueueActiveForTarget(state: OfferQueueState, targetUserId: string, active: boolean): void {
  const normalized = String(targetUserId || "").trim();
  if (!normalized) {
    return;
  }

  if (active) {
    state.activeTargets.add(normalized);
    return;
  }

  state.activeTargets.delete(normalized);
}

function findQueuedByTarget(state: OfferQueueState, targetUserId: string): {
  bucket: OfferCadenceBucket;
  index: number;
  request: QueuedOfferRequest;
} | null {
  for (const bucket of OFFER_QUEUE_ORDER) {
    const index = state.buckets[bucket].findIndex((item) => item.targetUserId === targetUserId);
    if (index < 0) {
      continue;
    }

    return {
      bucket,
      index,
      request: state.buckets[bucket][index]
    };
  }

  return null;
}

export function enqueueOfferRequest(state: OfferQueueState, request: QueuedOfferRequest): boolean {
  const normalizedTarget = String(request.targetUserId || "").trim();
  if (!normalizedTarget || state.activeTargets.has(normalizedTarget)) {
    return false;
  }

  const normalizedRequest: QueuedOfferRequest = {
    ...request,
    targetUserId: normalizedTarget,
    targetLabel: String(request.targetLabel || normalizedTarget).trim() || normalizedTarget,
    reason: String(request.reason || "manual")
  };

  const existing = findQueuedByTarget(state, normalizedTarget);
  if (!existing) {
    state.buckets[normalizedRequest.cadenceBucket].push(normalizedRequest);
    return true;
  }

  const nextBucket = OFFER_QUEUE_PRIORITY[normalizedRequest.cadenceBucket] > OFFER_QUEUE_PRIORITY[existing.bucket]
    ? normalizedRequest.cadenceBucket
    : existing.bucket;

  const merged: QueuedOfferRequest = {
    ...existing.request,
    ...normalizedRequest,
    cadenceBucket: nextBucket,
    attempt: Math.max(existing.request.attempt, normalizedRequest.attempt)
  };

  state.buckets[existing.bucket].splice(existing.index, 1);
  state.buckets[merged.cadenceBucket].push(merged);
  return true;
}

export function dequeueNextOfferRequest(state: OfferQueueState): QueuedOfferRequest | null {
  const size = OFFER_QUEUE_ORDER.length;
  for (let offset = 0; offset < size; offset += 1) {
    const idx = (state.cursor + offset) % size;
    const bucket = OFFER_QUEUE_ORDER[idx];
    const queue = state.buckets[bucket];
    if (queue.length === 0) {
      continue;
    }

    state.cursor = (idx + 1) % size;
    return queue.shift() || null;
  }

  return null;
}
