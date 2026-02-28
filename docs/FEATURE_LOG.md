# Boltorezka Feature Log

Этот документ хранит зафиксированные изменения, выполненные шаги и операционные evidence.
План и open items находятся в `docs/ROADMAP.md`.

## 2026-02-28 — Discord-like channel structure foundation (Phase A/B MVP)

### Delivered

- Backend schema evolution:
  - `room_categories` table,
  - `rooms.kind` (`text`/`voice`),
  - `rooms.category_id`, `rooms.position`.
- New API endpoints:
  - `GET /v1/rooms/tree` (categories + channels + uncategorized),
  - `POST /v1/room-categories` (admin/super_admin).
- `POST /v1/rooms` расширен полями `kind`, `category_id`, `position`.
- Web admin flow:
  - create category,
  - create channel (`text`/`voice`) с привязкой к категории,
  - sidebar tree grouping по категориям с иконками типа канала.

### Validation

- `npm run check:api-types` — PASS.
- `npm run web:build` — PASS.
- `npm run check` — PASS.

### Operational evidence (test)

- Deploy target: `test`, branch `feature/web-header-profile-menu`, SHA `c7bb6c8`.
- Command: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'`.
- Smoke result:
  - `smoke:sso` — PASS,
  - `smoke:realtime` — PASS,
  - `reconnectOk=true`, `reconnectSkipped=false`.

## 2026-02-28 — Realtime smoke hardening: reconnect + idempotency

### Delivered

- `scripts/smoke-realtime.mjs` расширен reconnect-сценарием (`SMOKE_RECONNECT=1`):
  - reconnect websocket после базового ack/idempotency path,
  - повторный `room.join` после reconnect,
  - `chat.send` + `ack` проверка после reconnect.
- В smoke output добавлен флаг `reconnectOk`.
- `scripts/examples/postdeploy-smoke-test.sh` теперь запускает realtime smoke с `SMOKE_RECONNECT=1`.

### Roadmap impact

- Закрыт пункт Phase 2: стабильный smoke для reconnect/idempotency.

### Operational evidence (test)

- Deploy target: `test`, branch `feature/web-header-profile-menu`, SHA `0e99f24`.
- Command: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'`.
- Realtime smoke output:
  - `ok=true`
  - `reconnectOk=true`
  - `reconnectSkipped=false`
- Причина финального фикс-коммита: postdeploy smoke теперь автогенерирует второй ws-ticket (`SMOKE_WS_TICKET_RECONNECT`) для reconnect path без ручного bearer-token.

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

## 2026-02-28 — Realtime MVP increment: message history pagination

### Delivered

- `/v1/rooms/:slug/messages` переведён на cursor pagination (`beforeCreatedAt` + `beforeId`).
- Ответ endpoint дополнен `pagination.hasMore` и `pagination.nextCursor`.
- Обновлены `docs/API_CONTRACT_V1.md` и `docs/OPENAPI_V1.yaml`.
- Обновлён `scripts/smoke-api.mjs` с проверкой pagination contract и second-page smoke path.

### Key commits

- `30d49a4` feat(api): add cursor pagination for room message history
- `3fa3817` docs: add merge and release pipeline reminder checklist
- `c68378a` docs: add merge and post-merge guardrails to preprod checklist
- `7ba3a90` docs: synchronize architecture, runbooks, and next-step plan

### Operational evidence

- Local checks: `npm run check:api-types && npm run check` — PASS.
- Test rollout/smoke: `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke` — PASS.
- Extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1` + 2 ws-ticket) — PASS:
  - `callSignalRelayed=true`
  - `callRejectRelayed=true`
  - `callHangupRelayed=true`

## 2026-02-28 — Web UI MVP increment: history pagination control

### Delivered

- React chat UI (`apps/web`) подключён к cursor pagination history endpoint.
- Добавлена кнопка `Load older messages` в chat panel.
- Реализованы клиентские состояния `hasMore/nextCursor/loadingOlder`.
- При подгрузке старых страниц выполняется prepend + dedupe по `message.id`.

### Validation

- Web build: `npm run web:build` — PASS.
- Commit: `abbcfc2` (`main`).
- Test rollout/smoke: `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke` — PASS.
- Extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1` + 2 ws-ticket) — PASS:
  - `callSignalRelayed=true`
  - `callRejectRelayed=true`
  - `callHangupRelayed=true`
