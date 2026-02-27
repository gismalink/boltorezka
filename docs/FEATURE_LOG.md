# Boltorezka Feature Log

Этот документ хранит зафиксированные изменения, выполненные шаги и операционные evidence.
План и open items находятся в `docs/ROADMAP.md`.

## 2026-02-28 — Realtime TS hardening batch

### Scope

- Backend runtime API переведён на TypeScript (`.ts`) и strict-ориентированный workflow.
- Realtime handler приведён к typed known-event dispatch и централизованным helper-путям.
- Документация runbook/checklist синхронизирована под текущий deploy/smoke flow.

### Delivered

- WS incoming envelope typing расширен (known/unknown envelopes).
- Добавлен/усилен typed protocol слой (`ws-protocol.ts`, `ws-protocol.types.ts`).
- `realtime` switch-dispatch по known событиям (`ping`, `room.join`, `chat.send`, `call.*`).
- Удалены дубли relay-веток для `call.offer/answer/ice/reject/hangup`.
- Централизованы helper-пути для `ack`/`nack`/validation/unknown event.
- Закрыт устаревший request-context слой.

### Operational evidence

- Многократные циклы:
  - local `npm run check:api-types`
  - local `npm run check`
  - test rollout: `TEST_REF=origin/feature/call-hangup-lifecycle npm run deploy:test:smoke`
  - extended realtime relay smoke: `SMOKE_CALL_SIGNAL=1` + 2 ws-ticket
- Последние подтверждённые extended relay результаты:
  - `callSignalRelayed=true`
  - `callRejectRelayed=true`
  - `callHangupRelayed=true`

### Key commits (feature/call-hangup-lifecycle)

- `729dadf` refactor(api): extract room join denied nack helper
- `09bd040` refactor(api): centralize unknown envelope nack handling
- `65dd0d3` refactor(api): centralize ack metric tracking
- `de70449` refactor(api): centralize validation nack responses
- `6db2848` refactor(api): extract shared room/target nack helpers
- `914b47e` refactor(api): tighten ws known-envelope and terminal call handling
- `ae23ba3` refactor(api): deduplicate call relay dispatch logic
- `87c11d2` switch realtime ws handler to known event dispatch

## 2026-02-28 — Documentation sync batch

### Delivered

- Merge/release guardrails добавлены в workflow/preprod checklist.
- Quickstart/runbook обновлены на актуальный Boltorezka test deploy flow.
- ROADMAP отделён от feature history (теперь только plan).
- Зафиксировано правило: `prod` откладывается до MVP-like readiness.
- Добавлены каноничные контрактные документы:
  - `docs/API_CONTRACT_V1.md`
  - `docs/WS_CONTRACT_V1.md`
- Добавлен OpenAPI artifact v1: `docs/OPENAPI_V1.yaml`.
- Добавлена матрица smoke/CI gate: `docs/SMOKE_CI_MATRIX.md`.

## 2026-02-28 — Realtime MVP increment: room.leave

### Delivered

- Добавлена поддержка client event `room.leave` в realtime handler.
- Добавлен server event `room.left` с подтверждением выхода из комнаты.
- Обновлён WS контракт (`docs/WS_CONTRACT_V1.md`) и roadmap статус Phase 2.

### Key commits

- `3fa3817` docs: add merge and release pipeline reminder checklist
- `c68378a` docs: add merge and post-merge guardrails to preprod checklist
- `7ba3a90` docs: synchronize architecture, runbooks, and next-step plan
