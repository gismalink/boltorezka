# RTC Refactor Checklist

Purpose: keep `useVoiceCallRuntime.ts` focused on orchestration while moving isolated responsibilities into dedicated modules.

## Done

- [x] Extracted offer policy to `voiceCallOfferPolicy.ts`.
- [x] Extracted negotiation flags/state helpers to `voiceCallNegotiationState.ts`.
- [x] Removed legacy compatibility re-export layer from `hooks/*`.
- [x] Extracted peer context create/dispose logic to `voiceCallPeerLifecycle.ts`.
- [x] Extracted peer reconnect/stats recovery flows to `voiceCallPeerRecovery.ts`.
- [x] Extracted local media constraints/acquisition/attach to `voiceCallLocalMedia.ts`.
- [x] Extracted room target sync and resync timer flow to `voiceCallTargetSync.ts`.
- [x] Extracted signaling dispatch glue to `voiceCallSignalDispatch.ts`.
- [x] Extracted peer map lifecycle glue to `voiceCallPeerRegistry.ts`.

## In Progress

- [x] Split `useVoiceCallRuntime.ts` into smaller orchestration sections with stable boundaries:
  - [x] signaling dispatch
  - [x] media acquisition and track attach
  - [x] peer map lifecycle
  - [x] room target sync

## Next

- [x] Add unit tests for offer cadence and reconnect scheduling helpers.
- [x] Add focused integration smoke for camera-toggle + reconnect in 3-way call.

## Validation Gates (every refactor step)

- [x] `apps/web`: `npm run build`
- [x] `scripts/smoke`: `node --check scripts/smoke/smoke-realtime.mjs`
- [ ] test deploy: `TEST_REF=origin/feature/video-stream-investigation npm run deploy:test:smoke`
- [ ] explicit 3-way smoke:
  - [ ] `set -a; source .deploy/smoke-auth.env; set +a`
  - [ ] `SMOKE_CALL_SIGNAL=1 SMOKE_CALL_RACE_3WAY=1 SMOKE_CALL_CAMERA_TOGGLE_RECONNECT=1 SMOKE_RECONNECT=1 npm run smoke:realtime`

## Blockers

- `deploy:test:smoke` currently fails before deploy because `infra/.env.host` is missing.
- Explicit smoke currently cannot run locally because `SMOKE_API_URL=http://localhost:8080` is unreachable and Docker daemon is not running for `smoke-auth-bootstrap.sh`.
