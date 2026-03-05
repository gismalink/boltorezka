# RTC Refactor Checklist

Purpose: keep `useVoiceCallRuntime.ts` focused on orchestration while moving isolated responsibilities into dedicated modules.

## Done

- [x] Extracted offer policy to `voiceCallOfferPolicy.ts`.
- [x] Extracted negotiation flags/state helpers to `voiceCallNegotiationState.ts`.
- [x] Removed legacy compatibility re-export layer from `hooks/*`.
- [x] Extracted peer context create/dispose logic to `voiceCallPeerLifecycle.ts`.
- [x] Extracted peer reconnect/stats recovery flows to `voiceCallPeerRecovery.ts`.
- [x] Extracted local media constraints/acquisition/attach to `voiceCallLocalMedia.ts`.

## In Progress

- [ ] Split `useVoiceCallRuntime.ts` into smaller orchestration sections with stable boundaries:
  - [ ] signaling dispatch
  - [ ] media acquisition and track attach
  - [ ] peer map lifecycle
  - [ ] room target sync

## Next

- [ ] Extract room target synchronization and blocklist cadence to `voiceCallTargetSync.ts`.
- [ ] Add unit tests for offer cadence and reconnect scheduling helpers.
- [ ] Add focused integration smoke for camera-toggle + reconnect in 3-way call.

## Validation Gates (every refactor step)

- [ ] `apps/web`: `npm run build`
- [ ] `scripts/smoke`: `node --check scripts/smoke/smoke-realtime.mjs`
- [ ] test deploy: `TEST_REF=origin/feature/video-stream-investigation npm run deploy:test:smoke`
- [ ] explicit 3-way smoke:
  - [ ] `set -a; source .deploy/smoke-auth.env; set +a`
  - [ ] `SMOKE_CALL_SIGNAL=1 SMOKE_CALL_RACE_3WAY=1 SMOKE_RECONNECT=1 npm run smoke:realtime`
