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
- JWT auth endpoints (`register`, `login`, `me`)
- Rooms endpoints (`list`, `create`)
- Health endpoint с проверкой DB/Redis

### Локальный старт

1. Скопировать env:

    - `cp .env.example .env`

2. Поднять сервисы:

    - `docker compose up --build -d`

3. Проверить здоровье:

    - `curl http://localhost:8080/health`

### Минимальный smoke auth

- Register:

   - `curl -X POST http://localhost:8080/v1/auth/register -H 'content-type: application/json' -d '{"email":"demo@boltorezka.local","password":"password123","name":"Demo User"}'`

- Login:

   - `curl -X POST http://localhost:8080/v1/auth/login -H 'content-type: application/json' -d '{"email":"demo@boltorezka.local","password":"password123"}'`

- Me (с bearer token):

   - `curl http://localhost:8080/v1/auth/me -H 'authorization: Bearer <token>'`

### Минимальный smoke realtime (WebSocket)

1. Получить JWT токен через login/register.
2. Открыть WS:

   - `wscat -c "ws://localhost:8080/v1/realtime/ws?token=<token>"`

3. Внутри соединения отправить:

   - `{"type":"room.join","payload":{"roomSlug":"general"}}`
   - `{"type":"chat.send","payload":{"text":"hello from ws"}}`

## Domain readiness

- `test.boltorezka` — тестовый контур
- `boltorezka` — продовый контур

Реальный rollout в эти домены выполнять только по GitOps runbook и с правилом test-first.
