# Boltorezka Pre-Prod Checklist

Чеклист перед запросом на rollout в `prod`.

Decision package (обязательно к заполнению перед `prod`): [PREPROD_DECISION_PACKAGE.md](PREPROD_DECISION_PACKAGE.md)
LiveKit full-transition reference: [../plans/2026-03-09_LIVEKIT_FULL_TRANSITION_CHECKLIST.md](../plans/2026-03-09_LIVEKIT_FULL_TRANSITION_CHECKLIST.md)

## 1) Branch и Git

1. Feature-ветка смержена в `main`.
2. В diff нет секретов и `.env`.
3. Релевантные docs обновлены в том же наборе изменений.

Текущий статус (2026-03-26, domain cutover):
- feature-ветка `feature/datowave-auth-stack-move` еще не смержена в `main`.
- test gates по auth/redirect/manual validation закрыты (см. `docs/status/test-results/2026-03-26.md`).
- Для перехода к `prod` требуется merge в `main` и повторный test smoke уже от `origin/main`.

## 2) Test env must-pass

1. `https://test.datowave.com/health` отвечает `200` стабильно.
2. `SMOKE_API_URL=https://test.datowave.com npm run smoke:sso` проходит.
3. Local auth отключен (`/v1/auth/register` и `/v1/auth/login` -> `410 SsoOnly`).
4. UI smoke пройден:
   - SSO login,
   - Complete SSO Session,
   - room join,
   - message send/receive в двух вкладках.
4.1. Postdeploy smoke summary в `test` подтверждает:
   - `SMOKE_STATUS=pass`,
   - `SMOKE_REALTIME_MEDIA_STATUS=pass`,
   - `SMOKE_TURN_TLS_STATUS=pass`.
5. Extended realtime relay smoke пройден:
   - `SMOKE_CALL_SIGNAL=1` сценарий с двумя `ws-ticket`,
   - подтверждены relay `call.offer/call.reject/call.hangup`.
5.1. Mixed-profile media smoke (`iceTransportPolicy=all`, STUN+TURN) пройден с direct path (selected candidate pair `host/udp` или `srflx/udp`, не relay-only).
6. RBAC smoke пройден:
   - `super_admin` может промоутить пользователя в `admin`,
   - обычный `user` не может создавать комнату,
   - `admin` может создавать комнату.
7. Admin moderation smoke пройден:
   - `super_admin` может `demote` администратора обратно в `user`,
   - `super_admin` может `ban/unban` пользователя,
   - banned user не получает `ws-ticket` и не проходит guarded auth paths.

## 2.1) LiveKit stage gate

1. `deploy:test:livekit` (или `deploy:test:smoke` в livekit-only профиле) проходит 3 раза подряд.
2. В realtime smoke подтверждено:
   - `expectedMediaTopology=livekit`,
   - `mediaTopologyFirstOk=true`,
   - `reconnectOk=true`.
3. Проверка user-reported media status regressions выполнена (нет массового `stalled` flapping).
4. Owner decision по rollback-планированию зафиксирован в актуальном cutover-плане.

## 3) Runtime и конфигурация

1. `AUTH_MODE=sso` в test/prod окружениях.
1.1. Cookie-mode rollout discipline:
   - `TEST_AUTH_COOKIE_MODE=1` зафиксирован в test,
   - `PROD_AUTH_COOKIE_MODE` переключается только после explicit GO.
2. `AUTH_SSO_BASE_URL`:
   - test -> `https://test.auth.datowave.com`
   - prod -> `https://auth.datowave.com`
2.1. CORS + credentialed requests:
   - `CORS_ORIGIN` задан явным app origin (без `*` для credentialed режима),
   - web-клиент отправляет auth-запросы с `credentials: include`.
3. `ALLOWED_RETURN_HOSTS`:
   - test содержит `test.datowave.com`
   - prod содержит `datowave.com`
3.1. Cookie policy соответствует окружению:
   - `AUTH_SESSION_COOKIE_DOMAIN`, `AUTH_SESSION_COOKIE_SAMESITE`, `AUTH_SESSION_COOKIE_SECURE` проверены для test/prod.
4. Edge ingress содержит маршруты для test/prod Boltorezka.
5. Voice baseline соответствует канонике:
   - `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`,
   - приоритетный production-путь: `relay + TURN TLS/TCP`.
6. Realtime WebSocket использует short-lived `ws-ticket` (не bearer token в query).

## 4) Release decision gate

Перед `prod` должно быть:

0. Продуктовый gate: подтверждена готовность "похоже на MVP" (MVP-like readiness) по `docs/runbooks/PREPROD_DECISION_PACKAGE.md` (раздел `MVP-like readiness gate`).
1. Явное подтверждение владельца релиза.
2. Запись commit SHA и smoke-результата.
3. Ветка `main` содержит целевой SHA, а свежий `deploy:test:smoke` от `origin/main` зафиксирован.

## 4.1) Merge + post-merge guardrails

1. Merge только из `feature/*` в `main` после успешного PR-review.
2. После merge повторить `test` проверку уже от `origin/main` (`deploy:test:smoke`).
3. Дополнительно прогнать extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket).
4. В `prod` идти только после явного подтверждения владельца релиза.
5. В `prod` выкатывать только `main` (никогда не feature-ветку).

## 5) Prod verification (после явного разрешения)

1. `curl -I https://datowave.com/health` -> `200`.
2. Проверка SSO redirect на prod домене.
3. Короткий UI smoke (login -> room -> chat).
4. Короткий voice smoke по канонике (`docs/runbooks/VOICE_BASELINE_RUNBOOK.md`).
5. Проверка admin moderation UI (`promote/demote/ban/unban`) на prod.
6. Логи без критичных ошибок в первые 10-15 минут.
