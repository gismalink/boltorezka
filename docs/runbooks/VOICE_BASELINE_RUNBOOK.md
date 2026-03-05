# Voice Baseline Runbook (WebRTC/TURN)

Цель: зафиксировать рабочую конфигурацию голоса в Boltorezka и шаги проверки после изменений.

## 1) Что является рабочим baseline

Проверенный baseline (test/prod, 2026-03-01):

- WebRTC policy: `relay` для нестабильных сетей/мобильных клиентов.
- TURN server: `turns:gismalink.art:5349?transport=tcp`.
- Signaling: стабильный обмен `call.offer`, `call.answer`, `call.ice`, `call.mic_state`.
- ICE-send strategy: offer/answer отправляются после завершения ICE gathering (или timeout guard), а не мгновенно.

Рекомендуемые env для frontend:

- `VITE_RTC_ICE_TRANSPORT_POLICY=relay`
- `VITE_RTC_ICE_SERVERS_JSON=[{"urls":["turns:gismalink.art:5349?transport=tcp"],"username":"<turn-username>","credential":"<turn-password>"}]`

Примечание: если нужен fallback для локальной/внутренней сети, допустим режим `all`, но baseline для production voice-стабильности — `relay`.

## 2) Что поддерживает baseline в коде

Ключевые места:

- `apps/web/src/hooks/rtc/voiceCallUtils.ts`
  - helper для ожидания ICE gathering перед отправкой SDP.
- `apps/web/src/hooks/rtc/useVoiceCallRuntime.ts`
  - runtime peer lifecycle, remote audio output routing, reconnect/statistics flow.
- `apps/web/src/hooks/rtc/voiceCallSignalHandlers.ts`
  - обработка incoming signaling + ответный SDP с ожиданием ICE gathering.
- `apps/web/src/hooks/rtc/useVoiceRuntimeMediaEffects.ts`
  - media effects, output volume/mute, retry playback после user gesture.
- `apps/api/src/routes/realtime.ts`
  - WS relay для `call.*` событий в пределах room.

## 3) Mobile notes

- На mobile Chrome добавлен best-effort выбор output route в сторону earpiece/receiver, если устройство отдаёт такой output как отдельный route.
- Жёстко гарантировать earpiece во всех браузерах/прошивках нельзя (ограничение Web platform), поэтому используется безопасный fallback на default route.

## 4) Минимальный smoke checklist для voice

После каждого деплоя, влияющего на voice:

1. `curl -fsS https://<env-domain>/health`
2. `curl -fsS https://<env-domain>/v1/auth/mode` (ожидается `mode=sso`)
3. Пройти SSO login и зайти в голосовой канал в двух клиентах.
4. Проверить, что слышно в обе стороны.
5. Проверить API logs на `call.offer/call.answer/call.ice/call.mic_state`.
6. Проверить TURN logs: `ALLOCATE -> CREATE_PERMISSION -> CHANNEL_BIND` + ненулевой `peer usage`.

## 5) Быстрая диагностика, если “signaling есть, звука нет”

- Проверить, что frontend реально использует `relay` и корректный `VITE_RTC_ICE_SERVERS_JSON`.
- Проверить TURN credentials и доступность `turns` endpoint.
- Проверить, что SDP отправляется после ICE gathering (не урезанный candidate set).
- Проверить, что remote audio не заглушен (`audioMuted=false`, output volume > 0).
- Для mobile: учитывать autoplay/user-gesture ограничения браузера.

## 6) Deployment policy

- Любые изменения voice сначала в `test`.
- В `prod` только после успешного test smoke.
- `prod` деплоится только из `main`.

## 7) RTC observability signals (Phase 6.3)

Минимальные метрики для replay-path и базовой диагностики:

- `call_initial_state_sent` - сколько replay envelope `call.initial_state` отправлено на `room.join`.
- `call_initial_state_participants_total` - суммарное число участников, отданных в replay snapshot.
- `ack_sent`, `nack_sent` - общий транспортный health сигнал WS-контура.
- `call_signal_sent` - активность offer/answer/ice relay.

Где смотреть:

- Redis hash `ws:metrics:<UTC-day>` на API контуре.
- Postdeploy summary (`.deploy/last-smoke-summary.env`) теперь содержит delta по replay-path:
  - `SMOKE_CALL_INITIAL_STATE_SENT_DELTA`
  - `SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA`

## 8) Triage for late-join replay regressions

Если появляются симптомы late-join рассинхрона (пустые камеры/неверный initial mic state):

1. Проверить, что `smoke:realtime` проходит с `SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1`.
2. Сверить, что `call_initial_state_sent` растет во время smoke/join.
3. Проверить `SMOKE_CALL_INITIAL_STATE_SENT_DELTA` в postdeploy summary (`>0` для realtime gate).
4. Если envelope отправляется, но UI не сходится: проверить клиентский replay apply path в `WsMessageController` и App state maps merge.
