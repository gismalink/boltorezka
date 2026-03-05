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
- [x] test deploy: `TEST_REF=origin/feature/video-stream-investigation npm run deploy:test:smoke`
- [x] explicit 3-way smoke:
  - [x] `set -a; source .deploy/smoke-auth.env; set +a`
  - [x] `SMOKE_CALL_SIGNAL=1 SMOKE_CALL_RACE_3WAY=1 SMOKE_CALL_CAMERA_TOGGLE_RECONNECT=1 SMOKE_RECONNECT=1 npm run smoke:realtime`

## Verification Notes

- Server-side validation completed on `2026-03-05` in `~/srv/boltorezka` for `origin/feature/video-stream-investigation` (`8c62d97`).
- Explicit 3-way smoke result: `race3WayOk=true`, `race3WayReconnectOk=true`, `cameraToggleReconnectOk=true`.
