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
  - `ALLOWED_RETURN_HOSTS` содержит `test.boltorezka`
- DNS `test.boltorezka` уже указывает на edge.
- В репозитории на сервере есть:
  - `infra/docker-compose.host.yml`
  - `infra/.env.host` (создан из `infra/.env.host.example`)

## 5 команд rollout (test)

1) Быстрая проверка состояния сервера:

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/server-quick-check.sh'`

2) Подтянуть и запустить rollout в test (через release-command):

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/release-command.sh rollout --env test --service boltorezka --branch main'`

3) GitOps deploy (ff-only pull + post-deploy):

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/gitops-deploy.sh --env test --service boltorezka --branch main'`

Альтернатива (если деплой идёт из repo boltorezka на сервере):

- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test'`

4) Smoke script для test:

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/test-smoke.sh --local test'`

5) Логи сервиса после rollout:

- `ssh mac-mini 'cd ~/srv/edge && docker compose ps && docker compose logs --tail=120 boltorezka-api-test'`

> Если у тебя в compose/скриптах другое имя сервиса — замени `boltorezka-api-test` на фактическое.

## 5 URL/check проверок

1) Health endpoint:

- `curl -i https://test.boltorezka/health`

2) Auth mode:

- `curl -s https://test.boltorezka/v1/auth/mode`
- ожидание: `mode=sso`

3) Local auth disabled:

- `curl -s -X POST https://test.boltorezka/v1/auth/register -H 'content-type: application/json' -d '{"email":"x@example.com","password":"password123","name":"X"}'`
- ожидание: `410` / `SsoOnly`

4) SSO redirect endpoint:

- `curl -i 'https://test.boltorezka/v1/auth/sso/start?provider=google&returnUrl=https://test.boltorezka/'`
- ожидание: `302` на `test.auth.gismalink.art`

5) UI smoke:

- открыть `https://test.boltorezka/`
- войти через SSO
- нажать `Complete SSO Session`
- войти в `general`
- отправить сообщение и проверить realtime во второй вкладке

## Rollback trigger

Делай rollback, если:

- `/health` не стабилен,
- SSO flow не возвращает пользователя,
- нельзя войти в комнату,
- чат не доставляет сообщения в realtime,
- в логах `boltorezka-api-test` повторяющиеся критичные ошибки.

Rollback команда:

- `ssh mac-mini 'cd ~/srv/edge && ./scripts/release-command.sh rollback --env test --service boltorezka'`

## Audit notes (обязательно)

После rollout/rollback зафиксировать:

- commit SHA
- env=`test`
- service
- результат smoke
- go/rollback
- кто выполнял
