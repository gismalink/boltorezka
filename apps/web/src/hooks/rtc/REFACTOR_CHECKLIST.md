# RTC Refactor Checklist

Purpose: keep RTC runtime predictable under glare/reconnect/load, while reducing maintenance cost and increasing test confidence.

## Completed Foundations

- [x] Extracted offer policy to `voiceCallOfferPolicy.ts`.
- [x] Extracted negotiation flags/state helpers to `voiceCallNegotiationState.ts`.
- [x] Removed legacy compatibility re-export layer from `hooks/*`.
- [x] Extracted peer context create/dispose logic to `voiceCallPeerLifecycle.ts`.
- [x] Extracted peer reconnect/stats recovery flows to `voiceCallPeerRecovery.ts`.
- [x] Extracted local media constraints/acquisition/attach to `voiceCallLocalMedia.ts`.
- [x] Extracted room target sync and resync timer flow to `voiceCallTargetSync.ts`.
- [x] Extracted signaling dispatch glue to `voiceCallSignalDispatch.ts`.
- [x] Extracted peer map lifecycle glue to `voiceCallPeerRegistry.ts`.
- [x] Extracted shared RTP sender lookup helper to `voiceCallUtils.ts` and removed local duplicates.

## Remaining Refactor Debt

- [ ] Split `startOffer` internals in `useVoiceCallRuntime.ts` into focused helpers:
  - [ ] preflight checks
  - [ ] local description creation and send
  - [ ] post-send bookkeeping/metrics
- [ ] Extract candidate queue sequencing from `useVoiceCallRuntime.ts` to dedicated helper/module.
- [ ] Consolidate related media effects in `useVoiceRuntimeMediaEffects.ts` to reduce effect overlap:
  - [ ] audio track/device sync
  - [ ] video track/effects sync
- [ ] Add transition-level docs for `voiceCallNegotiationState.ts` (flag lifecycle and expected order).

## Optimization And Hardening

- [x] Make pending ICE flush resilient to partial failures (process all queued candidates via `Promise.allSettled`).
- [ ] Add bounded queue size for `pendingRemoteCandidates` in `voiceCallPeerConnectionHandlers.ts`.
- [ ] Add per-reason cadence buckets in `voiceCallOfferPolicy.ts` so video-sync offers do not block manual recovery.
- [ ] Add structured offer lifecycle logs (`created`, `sent`, `settled`, `failed`) in `useVoiceCallRuntime.ts`.
- [ ] Add glare decision trace logs in `voiceCallSignalHandlers.ts` (`ignore` vs `rollback` with peer IDs).

## Test Coverage Expansion

- [x] `voiceCallOfferPolicy.test.ts` created.
- [x] `voiceCallPeerRecovery.test.ts` created.
- [ ] Create `voiceCallSignalHandlers.test.ts` (glare, rollback, nack handling).
- [ ] Create `voiceCallPeerConnectionHandlers.test.ts` (ICE/state/track events).
- [ ] Create `voiceCallLocalMedia.test.ts` (constraints/device paths/failures).
- [ ] Create `voiceCallPeerRegistry.test.ts` (status derivation/create/close).
- [ ] Create `voiceCallTargetSync.test.ts` (target add/remove/resync timer).
- [ ] Create `voiceCallUtils.test.ts` (candidate parse + ICE gather settle behavior).
- [ ] Create `voiceCallPeerLifecycle.test.ts` (context create/dispose cleanup).
- [ ] Create `useVoiceRuntimeMediaEffects.test.ts` (watchdog/device/effects sync).

## Smoke And Deploy Hardening

- [ ] Improve `scripts/smoke/smoke-realtime.mjs` event waiting with adaptive polling/backoff.
- [ ] Add optional strict `OfferRateLimited` threshold mode for race scenarios.
- [ ] Add explicit ICE relay assertions in 3-way smoke path.
- [ ] Add optional extended postdeploy smoke gate in `scripts/deploy/postdeploy-smoke-test.sh`.

## Validation Gates

- [x] `apps/web`: `npm run build`
- [x] `apps/web`: `npm run test`
- [x] `scripts/smoke`: `node --check scripts/smoke/smoke-realtime.mjs`
- [x] test deploy: `TEST_REF=origin/feature/video-stream-investigation npm run deploy:test:smoke`
- [x] explicit 3-way smoke:
  - [x] `set -a; source .deploy/smoke-auth.env; set +a`
  - [x] `SMOKE_CALL_SIGNAL=1 SMOKE_CALL_RACE_3WAY=1 SMOKE_CALL_CAMERA_TOGGLE_RECONNECT=1 SMOKE_RECONNECT=1 npm run smoke:realtime`

## Verification Notes

- Server-side validation completed on `2026-03-05` in `~/srv/boltorezka` for `origin/feature/video-stream-investigation`.
- Explicit 3-way smoke result: `race3WayOk=true`, `race3WayReconnectOk=true`, `cameraToggleReconnectOk=true`.
- Scope remains `test` only; `prod` rollout is out of scope until explicit approval.
