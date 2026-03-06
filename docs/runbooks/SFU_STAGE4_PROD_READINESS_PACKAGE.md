# SFU Stage 4 Production Readiness Package

Дата: 2026-03-07  
Статус: NO-GO (pending explicit prod approval)

## 1) Scope

Пакет фиксирует readiness для перехода к `prod` после Stage 3 (`SFU-by-default` в `test`).

## 2) Verified test candidate

- Branch: `origin/feature/video-stream-investigation`
- Candidate SHA: `0fcad1454eca8dcbf1e91f3a787ec29d4c919386`
- Test profile: `deploy:test:sfu`
- Evidence window: 2026-03-06 23:05:23Z .. 23:06:13Z

## 3) Stage 3 evidence (must-pass)

- `deploy:test:sfu` consecutive runs: `3/3 PASS`
- Latest smoke summary:
  - `SMOKE_STATUS=pass`
  - `SMOKE_NACK_DELTA=1`
  - `SMOKE_ACK_DELTA=8`
  - `SMOKE_CALL_INITIAL_STATE_SENT_DELTA=3`
- Realtime smoke invariants:
  - `expectedMediaTopology=sfu`
  - `mediaTopologyFirstOk=true`
  - `reconnectOk=true`

## 4) Runtime risk posture

- Known infra noise remains: transient `502` on first health retries during deploy.
- Mitigation: health wait loop continues until PASS and final smoke gates are required.
- User-facing regression addressed: false `stalled` flapping reduced (`RTC_INBOUND_STALL_TICKS=5`, stall only while `isRemoteSpeaking=true`).

## 5) Rollback readiness

Rollback target profile (test/prod-safe):
1. `RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`
2. Clear `RTC_MEDIA_TOPOLOGY_SFU_ROOMS`, `RTC_MEDIA_TOPOLOGY_SFU_USERS`
3. Redeploy + smoke gate

## 6) Mandatory pre-prod gates (still required)

1. Merge feature -> `main`.
2. Re-run test from `origin/main` with SFU profile equivalent.
3. Fill owners/sign-off fields in `PREPROD_DECISION_PACKAGE.md`.
4. Explicit prod approval from release owner.

## 7) Final decision

- Current status: `NO-GO`.
- Condition to flip to `GO`: all gates in section 6 completed and signed.
