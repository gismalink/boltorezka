# Boltorezka v2 Roadmap (Plan-only)

Этот документ хранит только план и открытые задачи.
Фактически реализованные изменения и evidence ведутся отдельно в `docs/FEATURE_LOG.md`.

## Delivery rules (обязательно)

- Deploy first to `test`.
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

- [ ] Добавить/финализировать OpenAPI v1.
- [ ] Финализировать WS event schema v1.
- [ ] Синхронизировать checklist/runbook с утверждёнными контрактами.

### Exit criteria

- [ ] Документированный API/WS контракт v1.

---

## Phase 2 — Realtime Core Completion

### Цели

- [ ] Закрыть оставшиеся элементы realtime MVP.

### Задачи

- [ ] Добавить явный `room.leave` в protocol flow.
- [ ] Доделать message history + pagination.
- [ ] Поддерживать стабильный smoke для reconnect и idempotency сценариев.

### Exit criteria

- [ ] Полный realtime MVP сценарий покрыт тестовыми и smoke-проверками.

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

### Exit criteria

- [ ] Web MVP готов к ограниченному beta.

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

1. [ ] Merge `feature/call-hangup-lifecycle` в `main` после review.
2. [ ] Выполнить post-merge verify в `test` от `origin/main`:
   - [ ] `deploy:test:smoke`
   - [ ] extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket)
3. [ ] Закрыть docs-gap для React как default UI runbook.
4. [ ] Финализировать OpenAPI/WS schema milestone.
5. [ ] Подготовить pre-prod decision пакет (evidence + rollback owner/plan).

## KPI MVP

- API p95 latency
- WS reconnect success rate
- Message delivery success rate
- Call setup success rate
- ICE failure rate
- Crash-free sessions (web/iOS/macOS)
