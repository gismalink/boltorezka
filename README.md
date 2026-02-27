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
- `npm run check:api-types` — baseline backend typecheck (`apps/api/tsconfig.json`, `allowJs+checkJs`)
- WS protocol helper module: `apps/api/src/ws-protocol.js` (typed incoming parser/guards + outgoing envelope builders, включая chat/room/presence)
- `SMOKE_API=1 npm run check` — verify + API smoke (`scripts/smoke-api.mjs`)
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso` — SSO redirect/mode smoke (`scripts/smoke-sso-redirect.mjs`)
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<jwt> npm run smoke:realtime` — WS protocol smoke (`nack/ack/idempotency`) через `ws-ticket` (`scripts/smoke-realtime.mjs`)
- `SMOKE_CALL_SIGNAL=1 SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<jwt> npm run smoke:realtime` — расширенный WS smoke + relay проверки `call.offer`, `call.reject` и `call.hangup` (второй ws-ticket создаётся автоматически)
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_API=1 SMOKE_SSO=1 npm run check` — единый verify + API + SSO smoke
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_API=1 SMOKE_SSO=1 SMOKE_REALTIME=1 SMOKE_WS_TICKET=<ticket> npm run check` — полный verify + API + SSO + realtime smoke
- `npm run deploy:test` — deploy test from git ref (`scripts/examples/deploy-test-from-ref.sh`)
- `npm run smoke:test:postdeploy` — серверный post-deploy smoke (`health + mode + smoke:sso + smoke:realtime + ws metrics`) (`scripts/examples/postdeploy-smoke-test.sh`)
- `TEST_REF=origin/<branch> npm run deploy:test:smoke` — one-command test rollout + post-deploy smoke (`scripts/examples/deploy-test-and-smoke.sh`)
- `AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/<branch> npm run deploy:test:smoke` — при fail deploy/smoke автоматически выполняет rollback на предыдущий test SHA (с optional rollback smoke)
- `DEPLOY_NOTES='notes' TEST_REF=origin/<branch> npm run deploy:test:smoke` — тот же one-command flow + автоматическая запись release-log (`.deploy/release-log.tsv`, и в `~/srv/edge/RELEASE_LOG.md` если доступен edge release-log script)
- `npm run deploy:prod` — deploy prod from git ref (`scripts/examples/deploy-prod-from-ref.sh`)

### CI smoke (GitHub Actions)

- Workflow: `.github/workflows/test-smoke.yml` (daily + manual dispatch).
- Required repository variable: `TEST_SMOKE_API_URL` (optional, default `https://test.boltorezka.gismalink.art`).
- Required repository secret: `TEST_SMOKE_BEARER_TOKEN` (должен быть `admin`/`super_admin`, т.к. smoke проверяет `GET /v1/telemetry/summary`).

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
- MVP RBAC: `user/admin/super_admin` (super-admin по `SUPER_ADMIN_EMAIL`)
- Rooms endpoints (`list`, `create`)
- Health endpoint с проверкой DB/Redis
- Web MVP UI на `http://localhost:8080/` (auth + rooms + realtime chat)
- React Web MVP (in progress) в `apps/web`

### React web (новый UI)

1. Установить зависимости:

   - `npm run web:install`

2. Запустить dev-сервер:

   - `npm run web:dev`

3. Открыть UI:

   - `http://localhost:5173`

React UI использует тот же API (`/v1/*`) и SSO flow, что и текущий backend MVP.

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
- `GET /v1/auth/ws-ticket` (одноразовый short-lived ticket для WS handshake)
- `GET /v1/telemetry/summary` (admin/super_admin, current-day counters)

RBAC endpoints:

- `GET /v1/admin/users` (admin/super_admin)
- `POST /v1/admin/users/:userId/promote` (super_admin only)

MVP RBAC правило:

- Только `super_admin` может промоутить пользователей в `admin`.
- Только `admin` и `super_admin` могут создавать комнаты.

### Минимальный smoke rooms + chat

1. После SSO-сессии в UI нажать на комнату в списке (`general` по умолчанию).
2. Убедиться, что подгрузилась история сообщений.
3. Отправить сообщение в блоке `Realtime Chat`.
4. Открыть вторую вкладку и повторно войти через SSO — сообщения и presence должны обновляться в реальном времени.

HTTP endpoint для истории:

- `GET /v1/rooms/:slug/messages?limit=50`

WS envelope (MVP hardening):

- client -> server: `type`, `requestId`, `payload`, optional `idempotencyKey`
- server -> client: `ack` / `nack` с `requestId` и `eventType`
- для `chat.send` используется dedup по `idempotencyKey`
- signaling baseline: `call.offer`, `call.answer`, `call.ice`, `call.reject`, `call.hangup` (relay в пределах room, optional `targetUserId`)

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
