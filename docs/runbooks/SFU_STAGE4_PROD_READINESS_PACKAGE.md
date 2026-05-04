# SFU Stage 4 Production Readiness Package

Дата: 2026-03-08  
Статус: NO-GO (pending explicit prod approval)

## 1) Scope

Пакет фиксирует readiness для перехода к `prod` после Stage 3 (`SFU-by-default` в `test`).

## 2) Verified test candidate

- Branch: `origin/feature/video-stream-investigation`
- Candidate SHA: `5ce4cef2aaa7129f877eb9555aaf1f7562dd4a5f`
- Test profile: `deploy:test:sfu`
- Evidence window: latest refresh `2026-03-08T19:48:48Z`

## 3) Stage 3 evidence (must-pass)

- `deploy:test:sfu` consecutive runs: `4/4 PASS` (latest cycle on 2026-03-08)
- Latest smoke summary:
  - `SMOKE_STATUS=pass`
  - `SMOKE_NACK_DELTA=1`
  - `SMOKE_ACK_DELTA=36`
  - `SMOKE_CALL_INITIAL_STATE_SENT_DELTA=5`
  - `SMOKE_REALTIME_MEDIA_STATUS=pass`
  - `SMOKE_TURN_TLS_STATUS=pass`
- Realtime smoke invariants:
  - `expectedMediaTopology=sfu`
  - `mediaTopologyFirstOk=true`
  - `reconnectOk=true`
- Mixed profile evidence:
  - `iceTransportPolicy=all` smoke passed with selected pair `host/udp` (direct path)
- Manual voice evidence:
  - 3-device run passed (including 1 device over mobile network)
- Extended realtime notes (non-strict diagnostics):
  - `race3WayOk=false`
  - `race3WayIceRelayOk=false`
  - dedicated live-room stress (6 participants) passed: `liveRoomOk=true`, `totalActions=42`, `leaveRejoinEvents=2`, `acceptedNacks=0`
  - explicit late-join/leave stress passed (`SMOKE_CALL_LIVE_ROOM_REQUIRE_LATE_JOIN=1`): `liveRoomOk=true`, `totalActions=44`, `lateJoinEvents=1`, `leaveRejoinEvents=2`, `acceptedNacks=0`
- Baseline comparison evidence (`p2p vs sfu`, same ref):
  - Artifact: `~/srv/datowave/.deploy/compare-p2p-sfu-20260308T184848Z.md`
  - `p2p`: `SMOKE_STATUS=pass`, `SMOKE_REALTIME_MEDIA_STATUS=pass`, `SMOKE_TURN_TLS_STATUS=pass`, one-way `audio=0`, `video=0`, `ACK=51`, `NACK=3`
  - `sfu`: `SMOKE_STATUS=pass`, `SMOKE_REALTIME_MEDIA_STATUS=pass`, `SMOKE_TURN_TLS_STATUS=pass`, one-way `audio=0`, `video=0`, `ACK=33`, `NACK=1`
  - Verdict: SFU не хуже P2P по setup/reconnect в test-кандидате, с меньшим signaling шумом.
- Desktop-mobile evidence (browser emulation):
  - Command: `SMOKE_RTC_EMULATE_MOBILE_PEER_B=1 SMOKE_RTC_REQUIRE_ICE_RESTART=1 npm run smoke:realtime:media`
  - Result: `ok=true`, `emulation.peerA=desktop`, `emulation.peerB=mobile`, one-way `audio=0`, `video=0`, `cameraStateConvergenceOk=true`, `iceUfragChanged=true`.
- Network handoff evidence (manual, test-room):
  - Scenario: repeated `Wi-Fi -> LTE -> Wi-Fi` switches without page reload.
  - Server log snapshot (`datowave-api-test`, last 20m): `ws.connected=1`, `ws.disconnected/reconnect=0`, `call.offer/call.answer=338`.
  - Verdict: room state preserved, media path survived handoff via renegotiation (no forced reconnect loop).
- WS privacy/logging evidence:
  - `call.*` server logs сохраняют только агрегированную SDP/ICE мета-информацию, ICE address/port маскируются.
  - Raw ICE fields доступны только под явным debug-флагом `WS_CALL_DEBUG_RAW_ICE=1` (должен оставаться выключенным в test/prod baseline).
- Renegotiation loop guard evidence:
  - Added fail-fast thresholds in `smoke:realtime:media`: `SMOKE_RTC_MAX_RELAYED_OFFERS`, `SMOKE_RTC_MAX_RELAYED_ANSWERS`, `SMOKE_RTC_MAX_RENEGOTIATION_EVENTS`.
  - `deploy:test:sfu` on SHA `86e19e112b193d73fa0af5f783c0943671127740` passed with `renegotiationEventsTotal=5` (limit `80`).
- Negotiation-window reconnect evidence:
  - Command: `SMOKE_CALL_SIGNAL=1 SMOKE_RECONNECT=1 SMOKE_ROOM_SLUG=test-room npm run smoke:realtime`
  - Result: `callNegotiationReconnectOk=true`, `callSignalRelayed=true`, `callSignalIdempotencyOk=true`, `mediaTopologySecondOk=true`.

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
3. Attach fresh baseline comparison artifact (`TEST_REF=origin/main npm run smoke:compare:p2p-sfu`) with both profiles green and no regression in one-way incidents.
4. Fill owners/sign-off fields in `PREPROD_DECISION_PACKAGE.md`.
5. Explicit prod approval from release owner.

## 7) Final decision

- Current status: `NO-GO`.
- Condition to flip to `GO`: all gates in section 6 completed and signed.

## 8) Checkpoint markers

- Interim checkpoint: `checkpoint-sfu-interim-working-2026-03-08`
- RC checkpoint: `release-candidate-sfu-test-2026-03-08`
