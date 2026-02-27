# Workflow Checklist (Projo-aligned)

Короткий чеклист на каждый инкремент в Boltorezka.

## 1) Реализация

1. Уточнить scope и критерий готовности.
2. Внести изменения в API/Web.
3. Если меняется схема БД:
   - добавить SQL migration в `infra/postgres/init` или отдельный migration-файл,
   - проверить обратную совместимость для `test` rollout,
   - зафиксировать изменение в docs/runbook.

## 2) Локальная проверка

1. Базовая проверка: `npm run check`.
2. С API smoke: `SMOKE_API=1 npm run check`.
3. Ручной smoke критического сценария:
   - SSO login (Google/Yandex) -> `Complete SSO Session` -> room join -> message send/receive.

Правило итераций:

- Для локальных безопасных правок постоянный deploy в `test` не обязателен.
- Всё, что идёт в `prod`, обязано пройти smoke в `test`.

## 3) Документация

1. Обновить `README.md` как индекс.
2. Обновить профильные docs:
   - `docs/ARCHITECTURE.md`
   - `docs/ROADMAP.md`
   - `docs/RUNBOOK_TEST_DEPLOY.md`
   - `docs/RUNBOOK_TEST_ROLLOUT_QUICKSTART.md`
3. Если меняется release/deploy процесс — обновить runbook в том же PR.

## 4) Перед завершением

1. Проверить `git status`.
2. Убедиться, что нет секретов в diff.
3. Проверить, что local auth не включился обратно (`/v1/auth/register` и `/v1/auth/login` -> `SsoOnly`).
4. Сделать понятный коммит.

## Частые пропуски

1. Изменили API payload, но не синхронизировали web client.
2. Забыли проверить `AUTH_MODE=sso` и `AUTH_SSO_BASE_URL` для test.
3. Обновили README без обновления runbook.
4. Проверили только `/health`, но не сделали room/chat smoke.
