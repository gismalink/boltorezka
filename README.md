# Boltorezka

Boltorezka — отдельный репозиторий для realtime-приложения в стиле voice/chat platform.

## Статус

- Репозиторий выделен из `GismalinkArt`.
- Текущее содержимое (`boltorezka.html`, `mdl/*`, `webSocketHandler.js`) рассматривается как legacy POC.
- Разработка новой версии ведётся по roadmap и runbook этого репозитория.

Legacy-файлы перенесены в `legacy/poc/`.

## Принципы разработки

1. **Test-first deployment**
   - По умолчанию выкатываем только в `test`.
   - В `prod` только после smoke в `test` и отдельного подтверждения.

2. **Branch workflow**
   - Все фичи: `feature/<short-name>`.
   - В `test` можно деплоить конкретную feature-ветку.
   - В `prod` только default branch (`main`) после merge.

3. **GitOps-only для серверных изменений**
   - На сервере не редактируем код вручную.
   - Только `git fetch/pull --ff-only` + запуск штатных скриптов деплоя/смока.

4. **Secrets hygiene**
   - Не коммитим `.env`, токены, TURN credentials, ключи, cookies.
   - Для примеров используем placeholders: `<secret>`, `<url>`, `<token>`.

## Документация

- Архитектура: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- План переписывания: [docs/ROADMAP.md](docs/ROADMAP.md)
- Тестовый деплой (GitOps): [docs/RUNBOOK_TEST_DEPLOY.md](docs/RUNBOOK_TEST_DEPLOY.md)
- Быстрый rollout в test (5 команд): [docs/RUNBOOK_TEST_ROLLOUT_QUICKSTART.md](docs/RUNBOOK_TEST_ROLLOUT_QUICKSTART.md)
- Pre-prod checklist: [docs/PREPROD_CHECKLIST.md](docs/PREPROD_CHECKLIST.md)
- Workflow checklist (Projo-aligned): [docs/workflow-checklist.md](docs/workflow-checklist.md)

## Process scripts (Projo-aligned)

- `npm run check` — локальный verify pipeline (`scripts/verify-all.sh`)
- `SMOKE_API=1 npm run check` — verify + API smoke (`scripts/smoke-api.mjs`)
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso` — SSO redirect/mode smoke (`scripts/smoke-sso-redirect.mjs`)
- `npm run deploy:test` — deploy test from git ref (`scripts/examples/deploy-test-from-ref.sh`)
- `npm run deploy:prod` — deploy prod from git ref (`scripts/examples/deploy-prod-from-ref.sh`)

Перед server deploy обязательно:

- скопировать `infra/.env.host.example` -> `infra/.env.host`
- заполнить секреты и SSO/env значения для test/prod

## Платформы

Цель v2:

- Web client
- iOS app
- macOS app

Общий протокол и доменная модель должны быть едиными для всех платформ.

## Ближайший старт (чеклист)

- [ ] Утвердить ADR по signaling/media topology.
- [ ] Описать OpenAPI + WS event schema (версионирование с `v1`).
- [ ] Создать feature-ветку для backend foundation.
- [ ] Поднять test окружение и прогнать первый smoke.

## Что уже можно запустить

В репозитории добавлен baseline v2:

- Docker Compose c сервисами `api + postgres + redis`
- Базовая схема БД и seed комнаты `general`
- SSO-only auth flow (Google/Yandex via central auth) + local JWT session exchange
- Rooms endpoints (`list`, `create`)
- Health endpoint с проверкой DB/Redis
- Web MVP UI на `http://localhost:8080/` (auth + rooms + realtime chat)

### Локальный старт

1. Скопировать env:

    - `cp .env.example .env`

2. Поднять сервисы:

    - `docker compose up --build -d`

3. Проверить здоровье:

    - `curl http://localhost:8080/health`

4. Для локального SSO по умолчанию используется `AUTH_SSO_BASE_URL=http://localhost:3000`.
   Для test/prod окружений переопредели на `https://test.auth.gismalink.art` / `https://auth.gismalink.art`.

### Минимальный smoke auth (SSO)

1. Открыть UI: `http://localhost:8080/`
2. Нажать `Login via Google` или `Login via Yandex`.
3. После возврата нажать `Complete SSO Session`.

API endpoints для SSO:

- `GET /v1/auth/sso/start?provider=google|yandex&returnUrl=<url>`
- `GET /v1/auth/sso/session`
- `GET /v1/auth/sso/logout?returnUrl=<url>`
- `GET /v1/auth/me` (с локальным bearer JWT, выданным после `sso/session`)

### Минимальный smoke rooms + chat

1. После SSO-сессии в UI нажать на комнату в списке (`general` по умолчанию).
2. Убедиться, что подгрузилась история сообщений.
3. Отправить сообщение в блоке `Realtime Chat`.
4. Открыть вторую вкладку и повторно войти через SSO — сообщения и presence должны обновляться в реальном времени.

HTTP endpoint для истории:

- `GET /v1/rooms/:slug/messages?limit=50`

### Минимальный smoke realtime (WebSocket)

1. Получить JWT токен через login/register.
2. Открыть WS:

   - `wscat -c "ws://localhost:8080/v1/realtime/ws?token=<token>"`

3. Внутри соединения отправить:

   - `{"type":"room.join","payload":{"roomSlug":"general"}}`
   - `{"type":"chat.send","payload":{"text":"hello from ws"}}`

## Domain readiness

- `test.boltorezka.gismalink.art` — тестовый контур
- `boltorezka.gismalink.art` — продовый контур

Для `test` окружения обязательно:

- `AUTH_MODE=sso`
- `AUTH_SSO_BASE_URL=https://test.auth.gismalink.art`
- `ALLOWED_RETURN_HOSTS` включает `test.boltorezka.gismalink.art`

Для `prod` окружения:

- `AUTH_MODE=sso`
- `AUTH_SSO_BASE_URL=https://auth.gismalink.art`
- `ALLOWED_RETURN_HOSTS` включает `boltorezka.gismalink.art`

Реальный rollout в эти домены выполнять только по GitOps runbook и с правилом test-first.
