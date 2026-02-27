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
- 🔄 Начат этап реализации React web app (`apps/web`).

## Phase 0 — Discovery & ADR (Week 1)

### Цели

- Зафиксировать продуктовые требования MVP.
- Зафиксировать технические решения в ADR.

### Задачи

- Определить scope MVP:
  - text chat,
  - room presence,
  - voice call,
  - basic video.
- Утвердить ограничения MVP:
  - max participants per room,
  - retention policy,
  - supported platforms.
- Написать ADR:
  - signaling протокол,
  - media topology (P2P now / SFU later),
  - auth/session strategy.

### Exit criteria

- Подписанные ADR и технические границы MVP.

---

## Phase 1 — Backend Foundation (Weeks 2-3)

### Цели

- Поднять стабильный API и базовую модель данных.

### Задачи

- Подготовить `feature/boltorezka-core`.
- Реализовать:
  - auth/session integration,
  - users,
  - rooms,
  - membership.
- Реализовать базовый RBAC для MVP:
  - роли `user`, `admin`, `super_admin`,
  - фиксированный super-admin по email `gismalink@gmail.com`,
  - promote `user -> admin` только от super-admin,
  - room creation только для `admin` и `super_admin`.
- Завести миграции БД и seed для test окружения.
- Добавить OpenAPI v1.

### Exit criteria

- CRUD по users/rooms/members работает.
- RBAC-проверки работают на критичных действиях (promotion, room creation).
- Документированный API контракт v1.

### RBAC MVP API scope (детализация)

- `GET /v1/auth/me` возвращает роль пользователя.
- `GET /v1/admin/users` доступен `admin` и `super_admin`.
- `POST /v1/admin/users/:userId/promote` доступен только `super_admin`.
- `POST /v1/rooms` доступен только `admin` и `super_admin`.

---

## Phase 2 — Realtime Core + Chat (Weeks 4-5)

### Цели

- Получить production-shaped realtime слой для chat/presence.

### Задачи

- WS gateway с heartbeat/reconnect semantics.
- Протокол событий:
  - `presence.update`,
  - `room.join`, `room.leave`,
  - `message.send`, `message.new`.
- Добавить ack/nack и idempotency key.
- Message history + pagination.

### Exit criteria

- Стабильный чат при reconnect и повторных отправках.

---

## Phase 3 — Voice / WebRTC MVP (Weeks 6-7)

### Цели

- Надёжный voice path и базовый video path для малых комнат.

### Задачи

- Реализовать signaling events:
  - `call.offer`, `call.answer`, `call.ice`.
- Интеграция coturn через env/secret.
- Ограничение размера комнаты для p2p.
- Graceful degradation при плохой сети.

### Exit criteria

- Call setup success в test среде стабилен.
- Нет хардкод-секретов в коде.

---

## Phase 4 — Web Productionization (Weeks 8-9)

### Цели

- Довести web-клиент до эксплуатационного MVP.

### Задачи

- Модульная структура web app.
- Перенос текущего web MVP из vanilla JS в React (`apps/web`) с сохранением API-контрактов.
- Реализовать React-экраны/секции:
  - SSO session,
  - rooms lobby,
  - room chat + presence,
  - admin users/promote для `super_admin`.
- Error boundaries + retry UX.
- Телеметрия на клиенте.
- E2E smoke сценарии:
  - login,
  - join room,
  - send/receive message,
  - voice connect/disconnect.

### Exit criteria

- Web MVP готов к ограниченному beta.

### React migration breakdown (детализация)

1. Создать `apps/web` (React + Vite + TypeScript).
2. Добавить transport-слой для HTTP/WS и синхронизировать с backend endpoints.
3. Перенести MVP UX (SSO/rooms/chat/presence/admin).
4. Обновить runbook/checklist под React UI как default.
5. После стабилизации выключить legacy `apps/api/public` как primary UI.

---

## Phase 5 — iOS & macOS Apps (Weeks 10-11)

### Цели

- Запустить нативные клиенты с shared core.

### Задачи

- Создать общий Swift package (network/realtime/call/models).
- Реализовать экраны:
  - auth,
  - rooms list,
  - chat,
  - voice room.
- macOS desktop клиент с parity MVP.
- iOS lifecycle обработка (audio interruptions, app background transitions).

### Exit criteria

- iOS/macOS internal builds проходят сценарии MVP.

---

## Phase 6 — Hardening & Release Readiness (Week 12)

### Цели

- Стабилизировать систему перед расширением аудитории.

### Задачи

- Нагрузочные тесты signaling и presence.
- Тесты отказов/reconnect.
- Security review (authz, rate limits, abuse prevention).
- Финальные runbook:
  - deploy,
  - smoke,
  - rollback,
  - incident response.

### Exit criteria

- Готовность к controlled production rollout.

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
