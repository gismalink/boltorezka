# SFU Stage 3 Runbook (Default SFU in Test)

Дата: 2026-03-07  
Статус: Draft (операционный стандарт для Stage 3 в test)

## 1) Цель

Перевести `test` на профиль `SFU-by-default`, сохранив P2P только как rollback path.

## 2) Область применения

- Контур: только `test`.
- Stage: `Stage 3` из `docs/plans/SFU_MIGRATION_PLAN.md`.
- Policy:
  - `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=sfu`
  - room/user allowlists используются для точечных override сценариев и диагностики.
  - `SFU-first`: voice/video validation и triage выполняются на SFU baseline; P2P используется только для rollback/compare.
  - ADR reference: `docs/architecture/PHASE0_MVP_ADR.md` (ADR-004).

## 3) Базовый rollout профиль

- `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=sfu`
- `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS=`
- `TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS=`
- `SMOKE_EXPECT_MEDIA_TOPOLOGY=sfu`

Команда:
- `TEST_REF=origin/feature/<name> npm run deploy:test:sfu`

## 4) Success criteria

1. Минимум 3 подряд `deploy:test:sfu` прогона со `SMOKE_STATUS=pass`.
2. `mediaTopologyFirstOk=true` в realtime smoke.
3. `reconnectOk=true` без роста rollback trigger метрик.
4. Нет severe one-way media инцидентов > 2 за 30 минут в `test`.

## 5) Rollback (операционный)

Если thresholds пересечены:
1. Переключить `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`.
2. Очистить `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS` и `TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS`.
3. Выполнить `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`.
4. Подтвердить `SMOKE_STATUS=pass` и `expectedMediaTopology=p2p`.

## 6) Evidence

- `.deploy/last-smoke-summary.env`
- release log entry (`rollout test pass/fail`)
- realtime counters before/after (`ack/nack/call_initial_state/call_reconnect_joined`)

## 7) Связанные документы

- `docs/plans/SFU_MIGRATION_PLAN.md`
- `docs/runbooks/SFU_STAGE2_CANARY_RUNBOOK.md`
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`
