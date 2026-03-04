# Boltorezka v2 Roadmap (Plan-only)

Этот документ хранит только план и открытые задачи.
Фактически реализованные изменения и evidence ведутся отдельно в `docs/status/FEATURE_LOG.md`.

## Current status (single-pane, 2026-03-04)

- Краткий статус и release snapshot: `docs/status/STATUS.md`.
- Каноника по voice baseline: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`.
- Детальный pre-prod gate: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`.

Навигация:
- План и open tasks: этот документ.
- Реализованные изменения/evidence: `docs/status/FEATURE_LOG.md`.
- Детальная pre-prod форма: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`.

## Delivery rules (обязательно)

- Deploy first to `test`.
- `prod` отложен до состояния, близкого к MVP (MVP-like readiness gate).
- В `prod` только после:
  - merge в `main`,
  - smoke на `test`,
  - явного подтверждения.
- GitOps only, без ручных правок на сервере.

## Focus now (операционный фокус)

1. Закрыть browser-level E2E для denied-media UX (после уже закрытого smoke-gate).
2. Поддерживать test-first release cadence: каждое изменение через `deploy:test:smoke` с фиксированным evidence.

## Completed milestones (свернуто)

- Phase 1 — Backend Contract & Data: **DONE**.
- Phase 2 — Realtime Core Completion: **DONE**.

---

## Phase 4 — Web Productionization (React)

### Цели

- [x] Сделать React web основным UI по умолчанию.

### Задачи

- [x] Обновить runbook/checklist под React UI как default path.
- [ ] E2E smoke сценарии:
  - [x] login
  - [x] join room
  - [x] send/receive message
  - [x] voice connect/disconnect
- [x] Smoke-gate: denied media permissions UX (`banner + lock controls`).
- [ ] Browser-level E2E: denied media permissions UX (headless browser path).
- [x] Video windows + camera streaming UX:
  - [x] draggable/resizable video windows overlay (multi-user tiles),
  - [x] self-preview при одиночном участнике video-room,
  - [x] toggle show/hide video windows в chat panel,
  - [x] sender-side effect pipeline + server controls (`none` / `8-bit` / `ASCII`),
  - [x] owner preview в server video settings.
- [x] Frontend/API version compatibility & anti-cache strategy:
  - [x] `GET /version` с `appBuildSha`,
  - [x] клиентская проверка версии + auto-reload,
  - [x] smoke-проверка cache/version контракта.
- [x] Подготовить deprecation-план для legacy `apps/api/public`.
- [ ] Реализовать карточку пользователя (web, Discord-like footer):
  - [x] Отдельный UI-блок с avatar/name/username и индикатором статуса.
  - [x] Кнопки quick controls: mute/unmute, deafen/undeafen, user settings.
  - [x] Попап «Устройство ввода» + выбор микрофона + ползунок громкости микрофона.
  - [x] Попап «Устройство вывода» + выбор аудио-устройства + ползунок громкости звука.
  - [x] Persist выбранных устройств/громкости в localStorage и восстановление при reload.
  - [x] Fallback-поведение при отказе в media permissions (понятный UI state без крэшей).
- [x] Авто-обновление input audio device при system `devicechange`:
  - [x] реакция на `navigator.mediaDevices.devicechange` во время активного звонка,
  - [x] авто-refresh outgoing audio track (включая `selectedInputId=default`),
  - [x] логирование успешного auto-update/failure в call log.
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

- [x] Web MVP готов к ограниченному beta.
- [x] Discord-like channel tree стабилен в `test` и покрыт smoke/e2e.

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

1. [x] Добавить `smoke:web:e2e` шаг для denied-media UX (persist banner/lock states).
1.1. [x] Добавить `smoke:web:version-cache` шаг (no-store index + immutable assets + buildSha match).
2. [x] Выполнить deprecation dry-run в `test` (dual-path readiness + rollback rehearsal).
  - [x] rollback rehearsal (previous SHA -> restore main) validated in `test`.
  - [x] static delivery contract smoke (split `SMOKE_WEB_BASE_URL` / `SMOKE_API_URL`) added and validated in `test`.
  - [x] dual-path readiness validation (separate static delivery path `/__web/`) validated in `test`.
3. [x] Зафиксировать post-MVP performance gate (API p95 + WS reconnect + call/video setup success) и пороги GO/NO-GO.
  - [x] Канонический документ: `docs/operations/PERFORMANCE_GATE.md`.
4. [ ] Выполнить новый pre-prod package refresh на основании обновлённых gate-правил.

## KPI MVP

- API p95 latency
- WS reconnect success rate
- Message delivery success rate
- Call setup success rate
- ICE failure rate
- Crash-free sessions (web/iOS/macOS)
