# Phase 3 — Voice / WebRTC MVP Policy (Canonical)

Дата фиксации: 2026-03-04  
Статус: Approved for current MVP gate

## 1) Scope

Документ формализует закрытие оставшихся пунктов `Phase 3`:
- room-size limit policy для p2p/relay voice path,
- graceful degradation policy для нестабильной сети.

## 2) Room-size policy (MVP)

### 2.1 Product contract

- Базовый целевой operating profile для MVP: до `200` активных realtime users в смешанном контуре (`WS + TURN + API`) на текущем test stack.
- Для voice-heavy сценариев (relay-active clients):
  - плановый консервативный cap: `~300` relay allocations в текущем профиле,
  - сценарий `500` relay allocations считается over-limit и не должен использоваться как штатная цель.
- Для p2p-like call rooms policy:
  - при приближении к лимитам/деградации рекомендуется сегментация пользователей по нескольким room/channel,
  - не держать один «монолитный» звонок выше validated envelope.

### 2.2 Evidence source

- `docs/status/TEST_RESULTS.md`:
  - Cycle #5: confirmed safe point at least `m=300`, `m=500` hits `508`.
  - Cycle #7: stable 10-minute mixed profile (`200 WS + 200 TURN + 60 rps API`).

## 3) Graceful degradation policy (MVP)

### 3.1 Runtime behavior requirements

- WebRTC transport baseline: `relay` for production-shaped reliability.
- Reconnect strategy is mandatory:
  - bounded retry attempts,
  - exponential backoff (`base/max delay`),
  - reconnect path validated in smoke (`reconnectOk=true`).
- If media/route is degraded:
  - preserve signaling and text chat continuity,
  - keep call controls responsive,
  - allow fast leave/rejoin recovery without full session loss.

### 3.2 Operational guardrails

- If TURN logs contain `error 508` under sustained load:
  - treat as capacity pressure,
  - reduce concurrent relay-active pressure (room split),
  - postpone scale-up rollout until retest.
- If API minute-level p99 degrades above gate thresholds:
  - NO-GO for release candidate under that profile,
  - run rollback-ready deploy path.

## 4) Canonical references

- Voice baseline: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Performance gate: `docs/operations/PERFORMANCE_GATE.md`
- Test/load evidence: `docs/status/TEST_RESULTS.md`
- Pre-prod decision flow: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`

## 5) Completion mapping to roadmap

- `Coturn integration через env/secret` — DONE (compose/env-managed coturn + validated relay runs).
- `Ограничения размера room для p2p` — DONE (contract formalized in this policy with evidence linkage).
- `Graceful degradation при плохой сети` — DONE (runtime + ops policy formalized in this policy).
