# Datowave Test Rollout Quickstart (5 commands + 5 checks)

Цель: быстрый и воспроизводимый rollout в `test` по правилам GitOps-only.

Важно:

- Только `test` (никакого `prod` в этом runbook).
- Запуск через серверные скрипты в `~/srv/edge/scripts/*`.
- Без ручных правок на сервере.

## Preconditions

- Код Datowave уже в `main` или нужной feature-ветке.
- На сервере настроены env для Datowave test:
  - `AUTH_MODE=sso`
  - `AUTH_SSO_BASE_URL=https://test.auth.datowave.com`
  - `ALLOWED_RETURN_HOSTS` содержит `test.datowave.com`
- DNS `test.datowave.com` уже указывает на edge.
- В репозитории на сервере есть:
  - `infra/docker-compose.host.yml`
  - `infra/.env.host` (создан из `infra/.env.host.example`)

## 5 команд rollout (test)

1) Быстрая проверка состояния сервера:

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/server-quick-check.sh'`

2) Деплой в test из нужного git ref (основной путь для Datowave):

- `ssh mac-mini 'cd ~/srv/datowave && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test'`

3) One-command deploy + post-deploy smoke (рекомендуется):

- `ssh mac-mini 'cd ~/srv/datowave && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'`

Опционально: включить server-side desktop build+publish в тот же запуск:

- `ssh mac-mini 'cd ~/srv/datowave && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 ENABLE_DESKTOP_BUILD=1 DESKTOP_CHANNEL=test DESKTOP_SIGNING_MODE=unsigned DESKTOP_PUBLIC_BASE_URL=https://test.datowave.com npm run deploy:test:smoke'`

4) При необходимости повторить post-deploy smoke отдельно:

- `ssh mac-mini 'cd ~/srv/datowave && npm run smoke:test:postdeploy'`

Desktop update-feed gate (рекомендуется держать включенным в smoke):

- `ssh mac-mini 'cd ~/srv/datowave && SMOKE_DESKTOP_UPDATE_FEED=1 SMOKE_DESKTOP_CHANNEL=test npm run smoke:test:postdeploy'`
- expected summary fields в `~/srv/datowave/.deploy/last-smoke-summary.env`:
  - `SMOKE_DESKTOP_UPDATE_FEED_STATUS=pass`
  - `SMOKE_SUMMARY_TEXT` содержит `desktop_update_feed=pass`

5) Логи сервиса после rollout:

- `ssh mac-mini 'cd ~/srv/datowave && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host ps && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host logs --tail=120 datowave-api-test'`

## Desktop auth handoff (deterministic) quick check

После rollout рекомендуется отдельный regression gate для browser->desktop handoff protocol:

1) Обновить smoke users/tokens на сервере:

- `ssh mac-mini 'cd ~/srv/datowave && SMOKE_AUTH_COMPOSE_FILE=infra/docker-compose.host.yml SMOKE_AUTH_ENV_FILE=infra/.env.host SMOKE_AUTH_POSTGRES_SERVICE=datowave-db-test SMOKE_AUTH_API_SERVICE=datowave-api-test SMOKE_API_URL=https://test.datowave.com bash ./scripts/smoke/smoke-auth-bootstrap.sh'`

2) Запустить deterministic handoff smoke локально с токеном из серверного env:

- `TOKEN="$(ssh mac-mini "cd ~/srv/datowave && set -a && source .deploy/smoke-auth.env && set +a && printf '%s' \"\$SMOKE_TEST_BEARER_TOKEN\"")" && SMOKE_TEST_BEARER_TOKEN="$TOKEN" SMOKE_API_URL=https://test.datowave.com npm run smoke:desktop:handoff-deterministic`

3) При необходимости soak на 20 последовательных циклов:

- `TOKEN="$(ssh mac-mini "cd ~/srv/datowave && set -a && source .deploy/smoke-auth.env && set +a && printf '%s' \"\$SMOKE_TEST_BEARER_TOKEN\"")" && SMOKE_TEST_BEARER_TOKEN="$TOKEN" SMOKE_API_URL=https://test.datowave.com SMOKE_DESKTOP_HANDOFF_SOAK_CYCLES=20 npm run smoke:desktop:handoff:soak`

4) Browser-level soak на трех движках (Chromium/WebKit/Firefox):

- `TOKEN="$(ssh mac-mini "cd ~/srv/datowave && set -a && source .deploy/smoke-auth.env && set +a && printf '%s' \"\$SMOKE_TEST_BEARER_TOKEN\"")" && SMOKE_TEST_BEARER_TOKEN="$TOKEN" SMOKE_API_URL=https://test.datowave.com SMOKE_DESKTOP_HANDOFF_BROWSER_SOAK_CYCLES=20 npm run smoke:desktop:handoff:browser-soak`

Ожидаемый PASS:

- `attemptStatusBeforeComplete=pending`
- `attemptStatusAfterComplete=completed`
- `timeoutPathStatus=expired`

## Desktop stability gate policy (practical)

Цель: не блокировать daily iteration избыточным long-run smoke, но сохранить release-grade контроль.

1) На каждую значимую media-итерацию (test/dev loop):

- Использовать `15-30m` gate:
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:voice-checkpoint:15m`
  - при необходимости: `SMOKE_WEB_BASE_URL=https://test.datowave.com SMOKE_DESKTOP_STABILITY_DURATION_MS=1800000 npm run smoke:desktop:stability`

2) `2h` long-run gate выполнять только для standalone packaged desktop клиента

- Условие запуска: post-signing/notarization release candidate.
- Команда:
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com SMOKE_DESKTOP_STABILITY_DURATION_MS=7200000 npm run smoke:desktop:stability`

3) Для web-hosted desktop shell в активной разработке

- `2h` gate не является обязательным pre-merge требованием.
- Обязательны: короткий checkpoint + regression smoke по затронутому функционалу.

### One-command альтернатива (deploy + smoke)

Используй команду из шага 3 (`deploy:test:smoke`) как единый запуск deploy+smoke.

Скрипт выполняет:

1. `deploy:test` (recreate `datowave-api-test`),
2. `postdeploy` smoke (`/health`, `/v1/auth/mode`, `smoke:sso`, `smoke:realtime`),
3. snapshot realtime метрик из Redis (`ws:metrics:<date>`).

> Если у тебя в compose/скриптах другое имя сервиса — замени `datowave-api-test` на фактическое.

## 5 URL/check проверок

1) Health endpoint:

- `curl -i https://test.datowave.com/health`

2) Auth mode:

- `curl -s https://test.datowave.com/v1/auth/mode`
- ожидание: `mode=sso`

3) Local auth disabled:

- `curl -s -X POST https://test.datowave.com/v1/auth/register -H 'content-type: application/json' -d '{"email":"x@example.com","password":"password123","name":"X"}'`
- ожидание: `410` / `SsoOnly`

4) SSO redirect endpoint:

- `curl -i 'https://test.datowave.com/v1/auth/sso/start?provider=google&returnUrl=https://test.datowave.com/'`
- ожидание: `302` на `test.auth.datowave.com`

5) UI smoke:

- открыть `https://test.datowave.com/`
- убедиться, что загружается React UI (default path)
- войти через SSO
- нажать `Complete SSO Session`
- войти в `general`
- отправить сообщение и проверить realtime во второй вкладке

6) Desktop update endpoints smoke:

- `curl -sS https://test.datowave.com/desktop/test/latest.json | head -n 20`
- `curl -sS https://test.datowave.com/desktop/test/mac/latest-mac.yml | head -n 20`
- `curl -I -sS https://test.datowave.com/desktop/test/mac/Datowave-0.2.0-arm64-mac.zip | head -n 8`

7) Redirect map smoke:

- `npm run smoke:redirect-map`

## Smoke users (test)

Где хранится список пользователей на сервере:

- Источник истины: PostgreSQL таблица `users` в test БД (`datowave-db-test` через `infra/docker-compose.host.yml` + `infra/.env.host`).
- Быстрый просмотр на сервере:
  - `ssh mac-mini 'cd ~/srv/datowave && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host exec -T datowave-db-test psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -c "select id, email, role, created_at from users order by created_at desc limit 50;"'`

Где хранится ссылка на bootstrap-токены:

- Локальный env-файл на сервере после bootstrap: `~/srv/datowave/.deploy/smoke-auth.env`
- Команда bootstrap для 3-way smoke (создаёт 3-го пользователя и token):
  - `ssh mac-mini 'cd ~/srv/datowave && SMOKE_AUTH_COMPOSE_FILE=infra/docker-compose.host.yml SMOKE_AUTH_ENV_FILE=infra/.env.host SMOKE_AUTH_POSTGRES_SERVICE=datowave-db-test SMOKE_AUTH_API_SERVICE=datowave-api-test SMOKE_API_URL=https://test.datowave.com SMOKE_AUTH_USER3_EMAIL=smoke-rtc-3@example.test bash ./scripts/smoke/smoke-auth-bootstrap.sh'`

## Rollback trigger

Делай rollback, если:

- `/health` не стабилен,
- SSO flow не возвращает пользователя,
- нельзя войти в комнату,
- чат не доставляет сообщения в realtime,
- в логах `datowave-api-test` повторяющиеся критичные ошибки.

Rollback команда:

- `ssh mac-mini 'cd ~/srv/datowave && TEST_REF=<previous_sha_or_ref> npm run deploy:test'`
- или с автополитикой rollback: `ssh mac-mini 'cd ~/srv/datowave && AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'`

## Audit notes (обязательно)

После rollout/rollback зафиксировать:

- commit SHA
- env=`test`
- service
- результат smoke
- go/rollback
- кто выполнял
