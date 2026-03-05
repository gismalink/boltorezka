# Boltorezka Test Rollout Quickstart (5 commands + 5 checks)

Цель: быстрый и воспроизводимый rollout в `test` по правилам GitOps-only.

Важно:

- Только `test` (никакого `prod` в этом runbook).
- Запуск через серверные скрипты в `~/srv/edge/scripts/*`.
- Без ручных правок на сервере.

## Preconditions

- Код Boltorezka уже в `main` или нужной feature-ветке.
- На сервере настроены env для Boltorezka test:
  - `AUTH_MODE=sso`
  - `AUTH_SSO_BASE_URL=https://test.auth.gismalink.art`
  - `ALLOWED_RETURN_HOSTS` содержит `test.boltorezka.gismalink.art`
- DNS `test.boltorezka.gismalink.art` уже указывает на edge.
- В репозитории на сервере есть:
  - `infra/docker-compose.host.yml`
  - `infra/.env.host` (создан из `infra/.env.host.example`)

## 5 команд rollout (test)

1) Быстрая проверка состояния сервера:

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/server-quick-check.sh'`

2) Деплой в test из нужного git ref (основной путь для Boltorezka):

- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test'`

3) One-command deploy + post-deploy smoke (рекомендуется):

- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'`

4) При необходимости повторить post-deploy smoke отдельно:

- `ssh mac-mini 'cd ~/srv/boltorezka && npm run smoke:test:postdeploy'`

5) Логи сервиса после rollout:

- `ssh mac-mini 'cd ~/srv/boltorezka && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host ps && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host logs --tail=120 boltorezka-api-test'`

### One-command альтернатива (deploy + smoke)

Используй команду из шага 3 (`deploy:test:smoke`) как единый запуск deploy+smoke.

Скрипт выполняет:

1. `deploy:test` (recreate `boltorezka-api-test`),
2. `postdeploy` smoke (`/health`, `/v1/auth/mode`, `smoke:sso`, `smoke:realtime`),
3. snapshot realtime метрик из Redis (`ws:metrics:<date>`).

> Если у тебя в compose/скриптах другое имя сервиса — замени `boltorezka-api-test` на фактическое.

## 5 URL/check проверок

1) Health endpoint:

- `curl -i https://test.boltorezka.gismalink.art/health`

2) Auth mode:

- `curl -s https://test.boltorezka.gismalink.art/v1/auth/mode`
- ожидание: `mode=sso`

3) Local auth disabled:

- `curl -s -X POST https://test.boltorezka.gismalink.art/v1/auth/register -H 'content-type: application/json' -d '{"email":"x@example.com","password":"password123","name":"X"}'`
- ожидание: `410` / `SsoOnly`

4) SSO redirect endpoint:

- `curl -i 'https://test.boltorezka.gismalink.art/v1/auth/sso/start?provider=google&returnUrl=https://test.boltorezka.gismalink.art/'`
- ожидание: `302` на `test.auth.gismalink.art`

5) UI smoke:

- открыть `https://test.boltorezka.gismalink.art/`
- убедиться, что загружается React UI (default path)
- войти через SSO
- нажать `Complete SSO Session`
- войти в `general`
- отправить сообщение и проверить realtime во второй вкладке

## Smoke users (test)

Где хранится список пользователей на сервере:

- Источник истины: PostgreSQL таблица `users` в test БД (`boltorezka-db-test` через `infra/docker-compose.host.yml` + `infra/.env.host`).
- Быстрый просмотр на сервере:
  - `ssh mac-mini 'cd ~/srv/boltorezka && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host exec -T boltorezka-db-test psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -c "select id, email, role, created_at from users order by created_at desc limit 50;"'`

Где хранится ссылка на bootstrap-токены:

- Локальный env-файл на сервере после bootstrap: `~/srv/boltorezka/.deploy/smoke-auth.env`
- Команда bootstrap для 3-way smoke (создаёт 3-го пользователя и token):
  - `ssh mac-mini 'cd ~/srv/boltorezka && SMOKE_AUTH_COMPOSE_FILE=infra/docker-compose.host.yml SMOKE_AUTH_ENV_FILE=infra/.env.host SMOKE_AUTH_POSTGRES_SERVICE=boltorezka-db-test SMOKE_AUTH_API_SERVICE=boltorezka-api-test SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_AUTH_USER3_EMAIL=smoke-rtc-3@example.test bash ./scripts/smoke/smoke-auth-bootstrap.sh'`

## Rollback trigger

Делай rollback, если:

- `/health` не стабилен,
- SSO flow не возвращает пользователя,
- нельзя войти в комнату,
- чат не доставляет сообщения в realtime,
- в логах `boltorezka-api-test` повторяющиеся критичные ошибки.

Rollback команда:

- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=<previous_sha_or_ref> npm run deploy:test'`
- или с автополитикой rollback: `ssh mac-mini 'cd ~/srv/boltorezka && AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'`

## Audit notes (обязательно)

После rollout/rollback зафиксировать:

- commit SHA
- env=`test`
- service
- результат smoke
- go/rollback
- кто выполнял
