# RTC Hooks

This folder contains WebRTC call runtime modules.

- `useVoiceCallRuntime.ts` - main call orchestration hook.
- `voiceCallSignalHandlers.ts` - incoming signaling event handlers.
- `voiceCallPeerConnectionHandlers.ts` - RTCPeerConnection event wiring.
- `voiceCallPeerLifecycle.ts` - peer context create/dispose helpers.
- `voiceCallPeerRecovery.ts` - reconnect timers and inbound audio stall recovery.
- `useVoiceRuntimeMediaEffects.ts` - media/watchdog/device effects for active calls.
- `voiceCallOfferPolicy.ts` - single-offerer and offer-cadence policy.
- `voiceCallConfig.ts` - RTC constants and thresholds.
- `voiceCallUtils.ts` - ICE/SDP helper utilities.
- `voiceCallTypes.ts` - shared runtime types.
- `REFACTOR_CHECKLIST.md` - incremental refactor plan and verification gates.
