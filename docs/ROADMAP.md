# Boltorezka v2 Roadmap (Plan-only)

Этот документ хранит только план и открытые задачи.
Фактически реализованные изменения и evidence ведутся отдельно в `docs/FEATURE_LOG.md`.

## Current status (single-pane, 2026-03-01)

- Release gate: **GO executed** для текущего MVP-инкремента.
- Production rollout выполнен из `origin/main` (policy-compliant):
  - deploy SHA: `36dd4e129b92e7bb0300ff936a8359f6f9be3658`;
  - post-deploy smoke: `/health` = `200`, `/v1/auth/mode` = `sso`.
- Latest test rollout before prod: `origin/feature/mobile-earpiece-default` @ `30e354d`.
- Критичные блоки закрыты:
  - voice baseline стабилизирован (`relay + TURN TLS/TCP`),
  - mobile MVP UI доведён,
  - admin users: `promote/demote/ban/unban`.
- Каноника по голосу:
  - `docs/VOICE_BASELINE_RUNBOOK.md`.

Навигация:
- План и open tasks: этот документ.
- Реализованные изменения/evidence: `docs/FEATURE_LOG.md`.
- Детальная pre-prod форма: `docs/PREPROD_DECISION_PACKAGE.md`.

## Delivery rules (обязательно) (дубль из правил агента)

- Deploy first to `test`.
- `prod` отложен до состояния, близкого к MVP (MVP-like readiness gate).
- В `prod` только после:
  - merge в `main`,
  - smoke на `test`,
  - явного подтверждения.
- GitOps only, без ручных правок на сервере.

## Focus now (операционный фокус)

1. Выполнить документационную уборку (удалить устаревшие gate-формулировки, синхронизировать runbooks).
2. Закрепить voice runbook как обязательный reference в pre-prod проверках.
3. Подготовить следующий MVP-инкремент на `feature/*` с test-first циклом.

## Completed milestones (свернуто)

- Phase 1 — Backend Contract & Data: **DONE**.
- Phase 2 — Realtime Core Completion: **DONE**.

---

## Phase 4 — Web Productionization (React)

### Цели

- [ ] Сделать React web основным UI по умолчанию.

### Задачи

- [x] Обновить runbook/checklist под React UI как default path.
- [ ] E2E smoke сценарии:
  - [x] login
  - [x] join room
  - [x] send/receive message
  - [x] voice connect/disconnect
- [ ] Подготовить deprecation-план для legacy `apps/api/public`.
- [ ] Реализовать карточку пользователя (web, Discord-like footer):
  - [x] Отдельный UI-блок с avatar/name/username и индикатором статуса.
  - [x] Кнопки quick controls: mute/unmute, deafen/undeafen, user settings.
  - [x] Попап «Устройство ввода» + выбор микрофона + ползунок громкости микрофона.
  - [x] Попап «Устройство вывода» + выбор аудио-устройства + ползунок громкости звука.
  - [x] Persist выбранных устройств/громкости в localStorage и восстановление при reload.
  - [x] Fallback-поведение при отказе в media permissions (понятный UI state без крэшей).
- [ ] Реализовать Discord-like структуру каналов (категории + текст/голос):
  - [x] Добавить category layer в data model (порядок, сворачивание, управление видимостью).
  - [x] Разделить channels по типу: `text` и `voice` (в едином tree endpoint).
  - [x] Добавить API для CRUD/ordering: category/channel create, rename, move, archive.
  - [x] Добавить права управления структурой (admin/super_admin) + policy checks.
  - [x] Web sidebar UX как в Discord: grouped sections, active highlight, quick create (`+`).
  - [x] Поддержать действия по контексту:
    - [x] join voice
    - [x] open text
    - [x] reorder (MVP через explicit order API)
  - [x] Добавить smoke/e2e сценарий на создание и навигацию по иерархии.

### Exit criteria

- [ ] Web MVP готов к ограниченному beta.
- [ ] Discord-like channel tree стабилен в `test` и покрыт smoke/e2e.

---

## Backlog (свернуто, не блокирует текущий rollout gate)

### Phase 0 — Discovery & ADR

- [ ] Утвердить MVP-границы (participants, retention, platforms).
- [ ] Зафиксировать ADR (signaling, media topology, auth/session).

### Phase 3 — Voice / WebRTC MVP

- [ ] Coturn integration через env/secret.
- [ ] Ограничения размера room для p2p.
- [ ] Graceful degradation при плохой сети.

#### Voice workstream (start 2026-02-28)

- [x] Базовый signaling relay (`offer/answer/ice/reject/hangup`) и call-status в web.
- [x] Device preferences в web: выбор input/output, профиля, громкости + localStorage restore.
- [x] Реальный mic test в user settings (live input-level meter + start/stop toggle).
- [x] Автоматический WebRTC handshake runtime (offer/answer/ice) поверх WS relay.
- [x] Передача локального audio track в peer connection + mute/deafen синхронизация.
- [x] Turn/stun policy + reconnect strategy для call session.

### Phase 5 — iOS & macOS

- [ ] Shared Swift package + базовые MVP-экраны.
- [ ] Lifecycle обработка audio interruptions/background.

### Phase 6 — Hardening & Release Readiness

- [ ] Нагрузочные и reconnect/failure тесты.
- [ ] Security review (authz, rate limits, abuse prevention).
- [ ] Финальные runbook: deploy/smoke/rollback/incident response.

---

## Execution plan (ближайшие действия)

1. [x] Merge `feature/call-hangup-lifecycle` в `main` после review.
2. [x] Выполнить post-merge verify в `test` от `origin/main`:
  - [x] `deploy:test:smoke`
  - [x] extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket)
3. [x] Закрыть docs-gap для React как default UI runbook.
4. [x] Финализировать OpenAPI/WS schema milestone.
5. [x] Подготовить pre-prod decision пакет (evidence + rollback owner/plan).
6. [x] Вернуться к `prod` только после достижения MVP-like readiness.
  - [x] Формализован MVP-like readiness gate в `docs/PREPROD_DECISION_PACKAGE.md`.
  - [x] Подготовлен текущий draft gate-record (статус `NO-GO` до закрытия pending-проверок).
  - [x] Закрыты pending smoke-проверки (`smoke:web:e2e`, `SMOKE_CALL_SIGNAL=1` relay).
  - [ ] Получен explicit `GO` и выполнен rollout из `origin/main`.

## KPI MVP

- API p95 latency
- WS reconnect success rate
- Message delivery success rate
- Call setup success rate
- ICE failure rate
- Crash-free sessions (web/iOS/macOS)
