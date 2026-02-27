# Boltorezka v2 Roadmap (Detailed)

## Горизонт: 12 недель

## React migration status (2026-02-27)

- ✅ Решение принято: web-клиент переносим на React.
- ✅ Scope первой итерации: MVP parity (SSO, rooms, chat, presence, RBAC admin page).
- ✅ Legacy WS compatibility: не делаем, только новый протокол.
- ✅ Room policy: сохраняем текущую (`admin/super_admin` создают комнаты).
- ✅ Realtime hardening (web): внедрены heartbeat (`ping/pong`) и reconnect backoff в React клиенте.
- ✅ Realtime protocol hardening: внедрены WS `ack/nack` envelope и `idempotencyKey` для `chat.send`.
- ✅ Smoke automation: добавлен `smoke:realtime` и флаги `SMOKE_API/SMOKE_SSO/SMOKE_REALTIME` в едином `npm run check`.
- ✅ Test rollout automation: добавлен one-command `deploy:test:smoke` (deploy + post-deploy smoke + metrics snapshot).
- ✅ Error resilience: добавлен React `ErrorBoundary` с безопасным fallback/reload UX.
- ✅ Admin observability baseline: `/v1/telemetry/summary` + React telemetry card.
- ✅ Voice signaling baseline: WS события `call.offer/call.answer/call.ice/call.reject/call.hangup` + минимальный React manual signaling panel.
- ✅ Signaling hardening: серверная валидация размера `payload.signal` + расширенный `smoke:realtime` для relay `call.offer`, `call.reject` и `call.hangup` между двумя WS-клиентами.
- ✅ Backend TS baseline: добавлен `apps/api/tsconfig.json` (`allowJs+checkJs`) и команда `npm run check:api-types`.
- ✅ WS protocol typing step: единый parser/guards для incoming envelope и payload string/signal полей в realtime handler.
- ✅ WS response typing step: `ack/nack/error/server.ready` собираются централизованными protocol builders.
- ✅ WS payload typing step: `chat.message`, `room.joined`, `room.presence`, `presence.joined/left` вынесены в protocol builders.
- ✅ WS call payload typing step: relay envelopes для `call.offer/answer/ice/reject/hangup` собираются централизованно в protocol builders.
- ✅ WS control-frame typing step: `pong` вынесен в централизованный protocol builder.
- ✅ API TS incremental step: добавлен первый TS-модуль `apps/api/src/ws-protocol.types.ts`, подключённый через JSDoc type imports.
- ✅ API TS incremental step: добавлен `apps/api/src/config.types.ts` и типизирован `config.js` через JSDoc type imports.
- ✅ WS contract typing expanded: добавлены payload type aliases (chat/room/presence/pong) в `ws-protocol.types.ts`.
- 🔄 Начат этап реализации React web app (`apps/web`).

## Automation plan (next blocks)

- [x] One-command test rollout + smoke (`deploy:test:smoke`)
- [x] Auto release-log entries for test rollout result
- [x] Post-deploy smoke summary artifact (`.deploy/last-smoke-summary.env`)
- [x] CI runner for `SMOKE_API+SMOKE_SSO+SMOKE_REALTIME`
- [x] Auto rollback trigger policy on smoke fail

Policy flags: `AUTO_ROLLBACK_ON_FAIL=1`, `AUTO_ROLLBACK_SMOKE=1`.

## Phase 0 — Discovery & ADR (Week 1)

### Цели

- [x] Зафиксировать продуктовые требования MVP.
- [ ] Зафиксировать технические решения в ADR.

### Задачи

- [x] Определить scope MVP.
  - [x] text chat
  - [x] room presence
  - [x] voice call (signaling baseline)
  - [ ] basic video
- [ ] Утвердить ограничения MVP.
  - [ ] max participants per room
  - [ ] retention policy
  - [ ] supported platforms
- [ ] Написать ADR.
  - [ ] signaling протокол
  - [ ] media topology (P2P now / SFU later)
  - [ ] auth/session strategy

### Exit criteria

- [ ] Подписанные ADR и технические границы MVP.

---

## Phase 1 — Backend Foundation (Weeks 2-3)

### Цели

- [x] Поднять стабильный API и базовую модель данных.

### Задачи

- [ ] Подготовить `feature/boltorezka-core`.
- [x] Реализовать backend foundation.
  - [x] auth/session integration
  - [x] users
  - [x] rooms
  - [x] membership
- [x] Реализовать базовый RBAC для MVP.
  - [x] роли `user`, `admin`, `super_admin`
  - [x] фиксированный super-admin по email `gismalink@gmail.com`
  - [x] promote `user -> admin` только от super-admin
  - [x] room creation только для `admin` и `super_admin`
- [x] Завести миграции БД и seed для test окружения.
- [ ] Добавить OpenAPI v1.

### Exit criteria

- [x] CRUD по users/rooms/members работает.
- [x] RBAC-проверки работают на критичных действиях (promotion, room creation).
- [ ] Документированный API контракт v1.

### RBAC MVP API scope (детализация)

- [x] `GET /v1/auth/me` возвращает роль пользователя.
- [x] `GET /v1/admin/users` доступен `admin` и `super_admin`.
- [x] `POST /v1/admin/users/:userId/promote` доступен только `super_admin`.
- [x] `POST /v1/rooms` доступен только `admin` и `super_admin`.

---

## Phase 2 — Realtime Core + Chat (Weeks 4-5)

### Цели

- [x] Получить production-shaped realtime слой для chat/presence.

### Задачи

- [x] WS gateway с heartbeat/reconnect semantics.
- [x] Протокол событий (MVP variant) внедрён.
  - [x] `room.join`
  - [x] presence events (`presence.joined`, `presence.left`, `room.presence`)
  - [x] message events (`chat.send`, `chat.message`)
  - [ ] явный `room.leave`
- [x] Добавить ack/nack и idempotency key.
- [ ] Message history + pagination.

### Exit criteria

- [x] Стабильный чат при reconnect и повторных отправках.

---

## Phase 3 — Voice / WebRTC MVP (Weeks 6-7)

### Цели

- [ ] Надёжный voice path и базовый video path для малых комнат.

### Задачи

- [x] Реализовать signaling events.
  - [x] `call.offer`
  - [x] `call.answer`
  - [x] `call.ice`
  - [x] `call.reject`
  - [x] `call.hangup`
- [ ] Интеграция coturn через env/secret.
- [ ] Ограничение размера комнаты для p2p.
- [ ] Graceful degradation при плохой сети.

### Exit criteria

- [x] Call setup success в test среде стабилен (signaling lifecycle smoke).
- [x] Нет хардкод-секретов в коде.

---

## Phase 4 — Web Productionization (Weeks 8-9)

### Цели

- [ ] Довести web-клиент до эксплуатационного MVP.

### Задачи

- [x] Модульная структура web app.
- [ ] Перенос текущего web MVP из vanilla JS в React (`apps/web`) с сохранением API-контрактов.
- [x] Реализовать React-экраны/секции.
  - [x] SSO session
  - [x] rooms lobby
  - [x] room chat + presence
  - [x] admin users/promote для `super_admin`
- [x] Error boundaries + retry UX.
- [x] Телеметрия на клиенте.
- [ ] E2E smoke сценарии.
  - [ ] login
  - [ ] join room
  - [ ] send/receive message
  - [ ] voice connect/disconnect

### Exit criteria

- [ ] Web MVP готов к ограниченному beta.

### React migration breakdown (детализация)

1. [x] Создать `apps/web` (React + Vite + TypeScript).
2. [x] Добавить transport-слой для HTTP/WS и синхронизировать с backend endpoints.
3. [x] Перенести MVP UX (SSO/rooms/chat/presence/admin).
4. [ ] Обновить runbook/checklist под React UI как default.
5. [ ] После стабилизации выключить legacy `apps/api/public` как primary UI.

---

## Phase 5 — iOS & macOS Apps (Weeks 10-11)

### Цели

- [ ] Запустить нативные клиенты с shared core.

### Задачи

- [ ] Создать общий Swift package (network/realtime/call/models).
- [ ] Реализовать экраны.
  - [ ] auth
  - [ ] rooms list
  - [ ] chat
  - [ ] voice room
- [ ] macOS desktop клиент с parity MVP.
- [ ] iOS lifecycle обработка (audio interruptions, app background transitions).

### Exit criteria

- [ ] iOS/macOS internal builds проходят сценарии MVP.

---

## Phase 6 — Hardening & Release Readiness (Week 12)

### Цели

- [ ] Стабилизировать систему перед расширением аудитории.

### Задачи

- [ ] Нагрузочные тесты signaling и presence.
- [ ] Тесты отказов/reconnect.
- [ ] Security review (authz, rate limits, abuse prevention).
- [ ] Финальные runbook.
  - [ ] deploy
  - [ ] smoke
  - [ ] rollback
  - [ ] incident response

### Exit criteria

- [ ] Готовность к controlled production rollout.

---

## Delivery rules (обязательно)

- Deploy first to `test`.
- В `prod` только после:
  - merge в `main`,
  - smoke на `test`,
  - явного подтверждения.
- GitOps only, без ручных правок на сервере.

## KPI MVP

- API p95 latency
- WS reconnect success rate
- Message delivery success rate
- Call setup success rate
- ICE failure rate
- Crash-free sessions (web/iOS/macOS)
