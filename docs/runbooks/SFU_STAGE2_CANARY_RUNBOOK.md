# SFU Stage 2 Canary Runbook (Test)

Дата: 2026-03-07  
Статус: Draft (операционный стандарт для Stage 2 в test)

## 1) Цель

Описать безопасный Stage 2 rollout в `test`: SFU только для ограниченного canary-cohort (комнаты/пользователи) без изменения default topology.

## 2) Область применения

- Контур: только `test`.
- Stage: `Stage 2 (Canary)` из `docs/plans/2026-03-06_SFU_MIGRATION_PLAN.md`.
- Topology policy:
  - default `p2p`,
  - SFU включается точечно по room/user allowlist.

## 3) Canary controls

- `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`
- `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS=<csv-room-slugs>`
- `TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS=<csv-user-ids>`

Routing priority (server-side):
1. user id входит в `RTC_MEDIA_TOPOLOGY_SFU_USERS` -> `sfu`
2. room slug входит в `RTC_MEDIA_TOPOLOGY_SFU_ROOMS` -> `sfu`
3. иначе `RTC_MEDIA_TOPOLOGY_DEFAULT`

## 4) Rollout процедура (test)

1. Выбрать canary-cohort:
   - минимум 1 smoke user id,
   - по возможности 1-2 внутренние комнаты.
2. Обновить test env overrides:
   - `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`
   - `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS=` (пусто или явный список)
   - `TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS=<canary-user-id>`
3. Выполнить deploy+smoke:
   - `TEST_REF=origin/feature/<name> SMOKE_EXPECT_MEDIA_TOPOLOGY=sfu npm run deploy:test:smoke`
4. Зафиксировать evidence:
   - `.deploy/last-smoke-summary.env`
   - `mediaTopologyFirstOk=true` для canary smoke user
   - realtime counters до/после.

## 5) Rollback thresholds (жесткие)

Немедленный rollback canary к `p2p`, если:
1. `mediaTopology` assertion для canary smoke не проходит 2 прогона подряд.
2. `reconnectOk=false` в 2 подряд postdeploy smoke.
3. `call_initial_state` replay regression в любом прогоне.
4. `nack_sent` delta > `+25` и повторяется два прогона подряд.
5. severe one-way media инцидент > 2 за 30 минут.

## 6) Rollback процедура

1. Очистить canary allowlists:
   - `TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS=`
   - при необходимости `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS=`
2. Сохранить `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p`.
3. Выполнить redeploy:
   - `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`
4. Подтвердить `SMOKE_STATUS=pass` и отсутствие SFU-route для не-canary path.

## 7) Evidence для закрытия Stage 2

- Минимум 3 успешных postdeploy прогона с user-canary routing (`expectedMediaTopology=sfu`).
- Нет rollback trigger в течение 48 часов.
- Обновлен feature-log и принято решение по переходу к Stage 3 в test.

## 8) Связанные документы

- `docs/plans/2026-03-06_SFU_MIGRATION_PLAN.md`
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`
- `docs/contracts/SFU_SESSION_CONTRACT.md`
