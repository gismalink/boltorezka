# Boltorezka v2 Roadmap (Plan-only)

Этот документ хранит только план и открытые задачи.
Фактически реализованные изменения и evidence ведутся отдельно в `docs/FEATURE_LOG.md`.

## Delivery rules (обязательно) (дубль из правил агента)

- Deploy first to `test`.
- `prod` отложен до состояния, близкого к MVP (MVP-like readiness gate).
- В `prod` только после:
  - merge в `main`,
  - smoke на `test`,
  - явного подтверждения.
- GitOps only, без ручных правок на сервере.

## Phase 0 — Discovery & ADR

### Цели

- [ ] Зафиксировать технические решения в ADR.

### Задачи

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

## Phase 1 — Backend Contract & Data

### Цели

- [ ] Закрыть контрактную часть backend на уровне документации и схем.

### Задачи

- [x] Зафиксировать каноничный HTTP contract doc (`docs/API_CONTRACT_V1.md`).
- [x] Зафиксировать каноничный WS contract doc (`docs/WS_CONTRACT_V1.md`).
- [x] Добавить/финализировать OpenAPI v1 spec artifact (`docs/OPENAPI_V1.yaml`).
- [x] Синхронизировать CI smoke matrix/checklist с утверждёнными контрактами (`docs/SMOKE_CI_MATRIX.md`).

### Exit criteria

- [x] Документированный API/WS контракт v1 + smoke/CI matrix sync.

---

## Phase 2 — Realtime Core Completion

### Цели

- [ ] Закрыть оставшиеся элементы realtime MVP.

### Задачи

- [x] Добавить явный `room.leave` в protocol flow.
- [x] Доделать message history + pagination.
- [x] Поддерживать стабильный smoke для reconnect и idempotency сценариев.

### Exit criteria

- [x] Полный realtime MVP сценарий покрыт тестовыми и smoke-проверками.

---

## Phase 3 — Voice / WebRTC MVP

### Цели

- [ ] Подготовить production-ready voice path.

### Задачи

- [ ] Интеграция coturn через env/secret.
- [ ] Ограничение размера комнаты для p2p.
- [ ] Graceful degradation при плохой сети.

### Exit criteria

- [ ] Voice сценарий стабилен в test для целевой нагрузки MVP.

---

## Phase 4 — Web Productionization (React)

### Цели

- [ ] Сделать React web основным UI по умолчанию.

### Задачи

- [ ] Обновить runbook/checklist под React UI как default path.
- [ ] E2E smoke сценарии:
  - [ ] login
  - [ ] join room
  - [ ] send/receive message
  - [ ] voice connect/disconnect
- [ ] Подготовить deprecation-план для legacy `apps/api/public`.
- [ ] Реализовать карточку пользователя (web, Discord-like footer):
  - [x] Отдельный UI-блок с avatar/name/username и индикатором статуса.
  - [x] Кнопки quick controls: mute/unmute, deafen/undeafen, user settings.
  - [x] Попап «Устройство ввода» + выбор микрофона + ползунок громкости микрофона.
  - [x] Попап «Устройство вывода» + выбор аудио-устройства + ползунок громкости звука.
  - [x] Persist выбранных устройств/громкости в localStorage и восстановление при reload.
  - [x] Fallback-поведение при отказе в media permissions (понятный UI state без крэшей).
- [ ] Реализовать Discord-like структуру каналов (категории + текст/голос):
  - [ ] Добавить category layer в data model (порядок, сворачивание, управление видимостью).
  - [x] Разделить channels по типу: `text` и `voice` (в едином tree endpoint).
  - [ ] Добавить API для CRUD/ordering: category/channel create, rename, move, archive.
  - [x] Добавить права управления структурой (admin/super_admin) + policy checks.
  - [x] Web sidebar UX как в Discord: grouped sections, active highlight, quick create (`+`).
  - [ ] Поддержать действия по контексту: join voice, open text, reorder (MVP через explicit order API).
  - [ ] Добавить smoke/e2e сценарий на создание и навигацию по иерархии.

### Exit criteria

- [ ] Web MVP готов к ограниченному beta.
- [ ] Discord-like channel tree стабилен в `test` и покрыт smoke/e2e.

---

## Phase 5 — iOS & macOS

### Цели

- [ ] Запустить нативные клиенты с shared core.

### Задачи

- [ ] Создать общий Swift package (network/realtime/call/models).
- [ ] Реализовать экраны:
  - [ ] auth
  - [ ] rooms list
  - [ ] chat
  - [ ] voice room
- [ ] iOS lifecycle обработка (audio interruptions, app background transitions).

### Exit criteria

- [ ] iOS/macOS internal builds проходят сценарии MVP.

---

## Phase 6 — Hardening & Release Readiness

### Цели

- [ ] Стабилизировать систему перед расширением аудитории.

### Задачи

- [ ] Нагрузочные тесты signaling и presence.
- [ ] Тесты отказов/reconnect.
- [ ] Security review (authz, rate limits, abuse prevention).
- [ ] Финальные runbook: deploy/smoke/rollback/incident response.

### Exit criteria

- [ ] Готовность к controlled production rollout.

---

## Execution plan (ближайшие действия)

1. [x] Merge `feature/call-hangup-lifecycle` в `main` после review.
2. [x] Выполнить post-merge verify в `test` от `origin/main`:
  - [x] `deploy:test:smoke`
  - [x] extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket)
3. [x] Закрыть docs-gap для React как default UI runbook.
4. [x] Финализировать OpenAPI/WS schema milestone.
5. [ ] Подготовить pre-prod decision пакет (evidence + rollback owner/plan).
6. [ ] Вернуться к `prod` только после достижения MVP-like readiness.

## KPI MVP

- API p95 latency
- WS reconnect success rate
- Message delivery success rate
- Call setup success rate
- ICE failure rate
- Crash-free sessions (web/iOS/macOS)
