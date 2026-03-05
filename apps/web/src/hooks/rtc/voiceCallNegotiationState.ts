import type { VoicePeerContext } from "./voiceCallTypes";

export function createNegotiationStateDefaults() {
  return {
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    offerInFlight: false,
    lastOfferAt: 0
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
  if (!peer) {
    return;
  }
  peer.lastOfferAt = Date.now();
}
