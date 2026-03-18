# TURN2 Enablement Plan (2026-03-19)

Цель: зафиксировать рабочий путь TURN2 в актуальном LiveKit runtime и встроить его в обязательный test gate перед любыми изменениями для production.

## 1) Зафиксированный факт на текущий момент

- TURN2 baseline: `turn2.gismalink.art -> 46.149.71.86`, native `coturn` (systemd), relay range `49160-49359` (200 портов).
- Direct TURN probe успешен: `turnutils_uclient` по `turns:443` проходит `allocate/refresh`.
- LiveKit media smoke с `iceTransportPolicy=relay` и `turn2-only` ICE (`turns:turn2.gismalink.art:443?transport=tcp`) проходит.
- Legacy call signaling smoke (`run-realtime-media-test-room.sh`) не является источником истины для TURN2 в livekit-only runtime.

## 2) Принятое техническое решение

- Канонический путь валидации TURN2: LiveKit media smoke + direct TURN probe.
- Legacy relay smoke оставляем только как явный legacy-сценарий по флагу.
- Для release gate используем только сценарии, соответствующие текущему runtime (`mediaTopology=livekit`).

## 3) Что уже сделано

- Обновлен runbook TURN2 под native baseline.
- Обновлен workflow-checklist: вместо legacy extended relay gate добавлены LiveKit проверки.
- Добавлен fail-fast guard в `scripts/smoke/run-realtime-media-test-room.sh`, чтобы убрать ложный PASS при skipped-сценарии.
- Обновлен `scripts/smoke/smoke-livekit-media-browser.mjs`: добавлены `SMOKE_RTC_ICE_SERVERS_JSON` и `SMOKE_RTC_ICE_TRANSPORT_POLICY`.

## 4) Оставшиеся шаги (обязательно)

1. Встроить TURN2-only LiveKit media smoke в postdeploy test gate.
- Требование: smoke выполняется на сервере test окружения и входит в итоговый PASS/FAIL.
- Минимальный профиль:
  - `SMOKE_RTC_ICE_TRANSPORT_POLICY=relay`
  - `SMOKE_RTC_ICE_SERVERS_JSON=[{"urls":["turns:turn2.gismalink.art:443?transport=tcp"],"username":"<turn_user>","credential":"<turn_pass>"}]`

2. Сделать 3 последовательных green прогона в test и зафиксировать evidence.
- Каждый прогон должен содержать:
  - `smoke:livekit:token-flow` PASS,
  - `smoke:livekit:media` PASS,
  - one-way incidents `audio=0`, `video=0`.

3. Зафиксировать rollout-профиль для production.
- Этап 1: `turn2` primary + `gismalink.art` fallback.
- Этап 2 (после стабильной серии): опциональный переход на turn2-only по явному подтверждению owner.

4. Добавить release evidence и GO/NO-GO запись.
- Обновить feature log и checklist evidence после каждого цикла.

## 5) Критерии готовности

План считается выполненным, когда:

- test gate автоматически валидирует TURN2 через LiveKit media smoke;
- есть минимум 3 подряд PASS цикла на test;
- release owner зафиксировал выбранный production TURN профиль;
- все проверки отражены в документации и release evidence.

## 6) Быстрые команды проверки

Direct TURN probe:

```bash
ssh root@46.149.71.86 'turnutils_uclient -v -S -T -u <turn_user> -w "<turn_pass>" -p 443 -n 1 turn2.gismalink.art'
```

LiveKit media smoke (turn2-only, relay):

```bash
SMOKE_API_URL=https://test.boltorezka.gismalink.art \
SMOKE_ROOM_SLUG=test-room \
SMOKE_RTC_ICE_TRANSPORT_POLICY=relay \
SMOKE_RTC_ICE_SERVERS_JSON='[{"urls":["turns:turn2.gismalink.art:443?transport=tcp"],"username":"<turn_user>","credential":"<turn_pass>"}]' \
npm run smoke:livekit:media
```
