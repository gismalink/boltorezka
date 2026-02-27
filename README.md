# Boltorezka

Boltorezka — отдельный репозиторий для realtime-приложения в стиле voice/chat platform.

## Статус

- Репозиторий выделен из `GismalinkArt`.
- Текущее содержимое (`boltorezka.html`, `mdl/*`, `webSocketHandler.js`) рассматривается как legacy POC.
- Разработка новой версии ведётся по roadmap и runbook этого репозитория.

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
