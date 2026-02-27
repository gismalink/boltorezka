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

### SSO-specific smoke

1. `GET /v1/auth/mode` возвращает `mode=sso`.
2. `POST /v1/auth/register` и `POST /v1/auth/login` возвращают `410 SsoOnly`.
3. Автопроверка: `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso`.
4. `GET /v1/auth/sso/start?provider=google&returnUrl=https://test.boltorezka.gismalink.art/` даёт redirect на `test.auth.gismalink.art`.
5. После SSO login в UI:
   - `Complete SSO Session` создаёт локальную JWT-сессию,
   - доступен список комнат,
   - вход в `general` работает,
   - сообщения видны в обеих вкладках в realtime.

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

## 8) Security reminders

- Не выводить секреты в логи.
- Не хранить TURN credentials в репозитории.
- Любые ключи/токены только через секрет-хранилище/серверные env.
