import type { VoicePeerContext } from "./voiceCallTypes";
import type { OfferCadenceBucket } from "./voiceCallOfferPolicy";

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
