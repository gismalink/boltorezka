# Hooks Map

## RTC Core

- `useVoiceCallRuntime.ts` - main room call orchestrator (signaling, peers, reconnect, media state).
- `voiceCallSignalHandlers.ts` - incoming `call.*` and nack/terminal handlers.
- `voiceCallPeerConnectionHandlers.ts` - `RTCPeerConnection` event wiring (`ontrack`, ICE, state).
- `useVoiceRuntimeMediaEffects.ts` - device switching, video processing, watchdog recovery.
- `voiceCallOfferPolicy.ts` - single-offerer and offer-cadence policy helpers.
- `voiceCallConfig.ts` - RTC-related constants and thresholds.
- `voiceCallUtils.ts` - ICE/SDP utility helpers.
- `voiceCallTypes.ts` - shared types for runtime modules.

## Why this split

- Keep side-effect-heavy runtime (`useVoiceCallRuntime`) focused on orchestration.
- Keep deterministic policy decisions in pure helpers (`voiceCallOfferPolicy.ts`).
- Keep protocol handlers (`voiceCallSignalHandlers.ts`) testable and readable.
