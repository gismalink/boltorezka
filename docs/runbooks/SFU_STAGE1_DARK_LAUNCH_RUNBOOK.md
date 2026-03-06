# SFU Stage 1 Dark Launch Runbook (Test)

Дата: 2026-03-06  
Статус: Draft (операционный стандарт для Stage 1 в test)

## 1) Цель

Описать безопасный запуск SFU dark launch в `test`, критерии допуска, rollback thresholds и пошаговые действия on-call без code revert.

## 2) Область применения

- Контур: только `test`.
- Stage: `Stage 1 (Dark launch)` из `docs/architecture/SFU_MIGRATION_PLAN.md`.
- Topology policy:
  - default `p2p`,
  - SFU включается room-level routing (`mediaTopology=sfu`) для ограниченного набора комнат.

## 3) Preflight checklist

1. Подтверждены 3 подряд успешных `deploy:test:smoke` на актуальном ref.
2. `SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1` проходит стабильно.
3. `mediaTopology` smoke assertions проходят (`p2p` + optional `sfu` room profile).
4. Есть минимум одна test-комната для SFU (`TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS=<slug>`).
5. Runbook rollback доступен on-call и подтвержден dry-run.

## 4) Rollout процедура (test)

1. Обновить test env:
   - `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`
   - `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS=<comma-separated-slugs>`
2. Выполнить деплой feature ref в test:
   - `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`
3. Обязательно включить SFU profile smoke:
   - `SMOKE_SFU_ROOM_SLUG=<slug>`
   - `SMOKE_SFU_EXPECT_MEDIA_TOPOLOGY=sfu`
4. Зафиксировать evidence:
   - `.deploy/last-smoke-summary.env`
   - `SMOKE_SFU_TOPOLOGY_STATUS=pass`
   - ключевые realtime counters до/после.

## 5) Rollback thresholds (жесткие)

Любой из триггеров ниже означает rollback на `p2p` для новых сессий:

1. `sfu_topology` smoke не проходит (`SMOKE_SFU_TOPOLOGY_STATUS!=pass`) в postdeploy.
2. `reconnectOk=false` в smoke 2 подряд прогона.
3. `call_initial_state` replay regression (missing/invalid) в любом postdeploy.
4. `nack_sent` delta > `+25` за один postdeploy прогон после включения SFU-room.
5. Зафиксирован severe one-way media incident (audio/video) более 2 раз за 30 минут в test.

## 6) Rollback процедура (без code revert)

1. Удалить SFU-комнаты из `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS` (или очистить переменную).
2. Оставить `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`.
3. Выполнить redeploy в test:
   - `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`
4. Подтвердить:
   - `mediaTopology` smoke возвращает `expected=p2p`,
   - `SMOKE_STATUS=pass`,
   - критичные regressions отсутствуют.

## 7) On-call triage flow

1. Проверить `.deploy/last-smoke-summary.env`.
2. Сопоставить метрики `ack/nack/chat/call_initial_state/call_reconnect_joined` до/после.
3. Выделить класс инцидента:
   - routing mismatch,
   - reconnect instability,
   - media one-way,
   - replay/state inconsistency.
4. Решение:
   - если порог из секции 5 пересечен, rollback немедленно,
   - иначе наблюдение + повторный smoke через 10-15 минут.

## 8) Evidence для закрытия Stage 1

- Минимум 3 успешных postdeploy прогона с `SMOKE_SFU_TOPOLOGY_STATUS=pass`.
- Отсутствие rollback trigger в течение 48 часов.
- Обновленный feature-log с итоговым решением по Stage 1.

## 9) Связанные документы

- `docs/architecture/SFU_STAGE0_EXECUTION_PLAN.md`
- `docs/architecture/SFU_MIGRATION_PLAN.md`
- `docs/architecture/SFU_SESSION_CONTRACT.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
