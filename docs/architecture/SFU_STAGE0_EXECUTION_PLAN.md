# SFU Stage 0 - Execution Plan (Test-first)

Дата старта: 2026-03-06  
Статус: In progress (Stage 0)

## 1) Цель Stage 0

Подготовить контракт и операционные границы для безопасного запуска SFU dark launch в `test`, не ломая текущий P2P baseline.

## 2) Scope Stage 0

- Контракт SFU session API: `join`, `publish`, `subscribe`, `leave`.
- Capability envelope для web-клиента (что клиент умеет и что ожидает от media plane).
- Набор SFU-метрик и labels для triage/rollback.
- Feature-flag и room-level routing policy для `test`.

## 3) Декомпозиция задач

1. Зафиксировать транспортный контракт и payload schema для `join/publish/subscribe/leave`.
2. Зафиксировать `mediaTopology` routing contract (`p2p|sfu`) на уровне room/session metadata.
3. Добавить server metrics contract для SFU-сценариев:
   - setup success/fail,
   - reconnect success/fail,
   - publish/subscribe timing,
   - severe one-way media incidents.
4. Подготовить smoke-дополнения для test-контура:
   - routing assert (`mediaTopology`),
   - setup/reconnect assertions,
   - rollback smoke path на P2P.
5. Подготовить rollout/rollback runbook draft для Stage 1 (dark launch).

## 3.1 Текущий прогресс

- [x] Зафиксирован routing contract `mediaTopology` (`p2p|sfu`) в server WS событиях room-уровня.
- [x] Добавлен Stage 0 канонический транспортный контракт: `docs/architecture/SFU_SESSION_CONTRACT.md`.
- [x] Добавлены test env hooks:
   - `RTC_MEDIA_TOPOLOGY_DEFAULT` (default `p2p`)
   - `RTC_MEDIA_TOPOLOGY_SFU_ROOMS` (csv roomSlug list)
- [x] Добавлены smoke assertions для `mediaTopology` routing.
- [x] Добавлен optional SFU room smoke profile в postdeploy gate:
   - `SMOKE_SFU_ROOM_SLUG=<slug>`
   - `SMOKE_SFU_EXPECT_MEDIA_TOPOLOGY=sfu` (default)
- [x] Зафиксированы rollback thresholds и runbook draft для Stage 1:
   - `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`

## 4) Гейты выхода из Stage 0

- Контракт SFU session утвержден и зафиксирован в canonical docs.
- Определены обязательные telemetry labels и пороги rollback.
- Подготовлены и проверены smoke-кейсы для `test`.
- Подготовлен Stage 1 dark launch checklist.

## 5) Артефакты Stage 0

- `docs/architecture/SFU_MIGRATION_PLAN.md`
- `docs/architecture/PHASE0_MVP_ADR.md`
- `docs/architecture/SFU_STAGE0_EXECUTION_PLAN.md`
- `docs/architecture/SFU_SESSION_CONTRACT.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md` (дополнение SFU telemetry)
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`

## 6) Политика выполнения

- Только `test` rollout.
- Изменения в `prod` только по явному подтверждению после test smoke.
- Rollback должен работать без code revert (через routing/feature flags).
