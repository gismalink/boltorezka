# Boltorezka Test Deploy Runbook (GitOps)

Этот runbook определяет безопасный порядок деплоя Boltorezka в `test` среду.

## 1) Preconditions

- Изменения находятся в feature-ветке: `feature/<short-name>`.
- Локально пройдены базовые проверки (lint/test/build where applicable).
- Нет секретов в git diff.
- Подготовлены переменные окружения на сервере (вне git).

## 2) Git hygiene

- Рабочая ветка актуальна с `main`.
- PR открыт и содержит краткий change summary.
- Релевантные docs обновлены в этом репозитории.

## 3) Deploy in test (только test)

Запуск на сервере — через штатные скрипты из server runbook:

- `~/srv/edge/scripts/gitops-deploy.sh`
- `~/srv/edge/scripts/release-command.sh`
- `~/srv/edge/scripts/test-smoke.sh`
- `~/srv/edge/scripts/server-quick-check.sh`

Паттерн запуска (пример):

- `ssh <server> 'cd ~/srv/edge && ./scripts/release-command.sh rollout --env test --service <service> --branch <feature-branch>'`

One-command для Boltorezka (deploy + post-deploy smoke):

- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/<feature-branch> npm run deploy:test:smoke'`
- `ssh mac-mini 'cd ~/srv/boltorezka && AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/<branch> npm run deploy:test:smoke'`

Для исключения при деплое из `main` (только по явному решению):

- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'`

> Используй фактические параметры скрипта из канонических server docs.

## 4) Post-deploy smoke checklist

1. Контейнеры в состоянии `Up`.
2. `docker compose ps` без деградации сервисов.
3. `docker compose logs --tail=120 <service>` без критических ошибок.
4. HTTP health endpoint отвечает 200.
5. WS handshake успешен.
6. End-to-end smoke:
   - login,
   - room join,
   - text message send/receive,
   - voice connect/disconnect.
7. Realtime envelope smoke:
   - `chat.send` получает `ack` с `requestId`,
   - при ошибках приходит `nack` с `code/message`,
   - повторная отправка с тем же `idempotencyKey` не создаёт дубль сообщения.

### SSO-specific smoke

1. `GET /v1/auth/mode` возвращает `mode=sso`.
2. `POST /v1/auth/register` и `POST /v1/auth/login` возвращают `410 SsoOnly`.
3. Автопроверка: `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso`.
4. `GET /v1/auth/sso/start?provider=google&returnUrl=https://test.boltorezka.gismalink.art/` даёт redirect на `test.auth.gismalink.art`.
5. После SSO login в UI:
   - использовать React UI как default path,
   - `Complete SSO Session` создаёт локальную JWT-сессию,
   - доступен список комнат,
   - вход в `general` работает,
   - сообщения видны в обеих вкладках в realtime,
   - статус доставки сообщения меняется `sending -> delivered`.

### Domain checks

- Для `test`:
   - `curl -I https://test.boltorezka.gismalink.art/health`
   - `curl https://test.boltorezka.gismalink.art/health`

- Для `prod` (только после отдельного подтверждения):
   - `curl -I https://boltorezka.gismalink.art/health`
   - `curl https://boltorezka.gismalink.art/health`

## 5) Rollback criteria

Rollback обязателен, если:

- health endpoint нестабилен,
- массовые WS disconnect,
- деградация call setup,
- критичные ошибки authz/authn,
- потеря/дублирование сообщений выше допустимого порога.

Rollback выполняется только штатным release-script с записью в release log.

При включённых флагах rollback policy (`AUTO_ROLLBACK_ON_FAIL=1`, опционально `AUTO_ROLLBACK_SMOKE=1`) команда `deploy:test:smoke` может автоматически запустить rollback после smoke fail.

## 6) Promotion to prod

Только при выполнении всех условий:

- smoke test в `test` успешен,
- feature merged в `main`,
- получено явное подтверждение на prod rollout.

Никогда не деплоить `prod` напрямую из feature-ветки.

Перед запросом на prod rollout пройди [PREPROD_CHECKLIST.md](PREPROD_CHECKLIST.md).

## 7) Audit trail

Для каждого rollout/rollback фиксировать:

- commit SHA,
- environment,
- service version/tag,
- smoke result,
- decision (go/rollback),
- owner.

При запуске `deploy:test:smoke` запись создаётся автоматически:
- локально в `./.deploy/release-log.tsv`,
- и дополнительно в `~/srv/edge/RELEASE_LOG.md` (если доступен `~/srv/edge/scripts/auth-cutover-release-log.sh`).

Дополнительно post-deploy smoke сохраняет артефакт `./.deploy/last-smoke-summary.env` с итогом и realtime delta-метриками.
`deploy:test:smoke` автоматически подхватывает `SMOKE_SUMMARY_TEXT` из этого артефакта и добавляет его в notes обеих release-log записей.

## 8) Security reminders

- Не выводить секреты в логи.
- Не хранить TURN credentials в репозитории.
- Любые ключи/токены только через секрет-хранилище/серверные env.

## 9) CI smoke prerequisites

- Workflow: `.github/workflows/test-smoke.yml`.
- Repo variable: `TEST_SMOKE_API_URL` (optional; default test domain).
- Repo secret: `TEST_SMOKE_BEARER_TOKEN` (must belong to `admin`/`super_admin`, because CI validates `GET /v1/telemetry/summary`).
- Полная матрица покрытия и gate-правил: `docs/SMOKE_CI_MATRIX.md`.

## 10) Latest test evidence (2026-02-28)

- Deploy target: `test`, SHA `729dadf`.
- SSO smoke: `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso` -> `ok`.
- HTTP smoke:
   - `/health` -> `{"status":"ok","checks":{"api":"ok","db":"ok","redis":"ok"}}`
   - `/v1/auth/mode` -> `{"mode":"sso"}`
- Realtime protocol smoke (ws-ticket path):
   - `chat.send` до `room.join` -> `nack` с `code=NoActiveRoom`.
   - `room.join` -> `ack`.
   - первый `chat.send` (`idempotencyKey=<key>`) -> `ack` + `chat.message`.
   - повторный `chat.send` с тем же `idempotencyKey` -> `ack` с `duplicate=true`.
- Redis metrics snapshot после realtime smoke (`ws:metrics:<UTC-date>`):
   - `nack_sent: 71 -> 72`
   - `ack_sent: 330 -> 333`
   - `chat_sent: 70 -> 71`
   - `chat_idempotency_hit: 70 -> 71`
   - `call_signal_sent: 27`
   - `call_hangup_sent: 26`
   - `call_reject_sent: 25`
- Extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket):
   - `callSignalRelayed=true`
   - `callRejectRelayed=true`
   - `callHangupRelayed=true`
