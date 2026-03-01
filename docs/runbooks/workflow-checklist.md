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
3. С API+SSO smoke: `SMOKE_API=1 SMOKE_SSO=1 SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run check`.
4. С полным realtime smoke: `SMOKE_API=1 SMOKE_SSO=1 SMOKE_REALTIME=1 SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WS_TICKET=<ticket> npm run check`.
5. Ручной smoke критического сценария:
   - SSO login (Google/Yandex) -> `Complete SSO Session` -> room join -> message send/receive.

Правило итераций:

- Для локальных безопасных правок постоянный deploy в `test` не обязателен.
- Всё, что идёт в `prod`, обязано пройти smoke в `test`.

## 3) Документация

1. Обновить `README.md` как индекс.
2. Обновить профильные docs:
   - `docs/architecture/ARCHITECTURE.md`
   - `docs/status/ROADMAP.md`
   - `docs/runbooks/RUNBOOK_TEST_DEPLOY.md`
   - `docs/runbooks/RUNBOOK_TEST_ROLLOUT_QUICKSTART.md`
3. Если меняется release/deploy процесс — обновить runbook в том же PR.

## 4) Перед завершением

1. Проверить `git status`.
2. Убедиться, что нет секретов в diff.
3. Проверить, что local auth не включился обратно (`/v1/auth/register` и `/v1/auth/login` -> `SsoOnly`).
4. Сделать понятный коммит.

## 5) Merge + release pipeline (чтобы не забыть)

1. Открыть PR `feature/* -> main` с пометкой: test rollout + standard/extended smoke passed.
2. Перед merge убедиться, что scope PR не разросся вне текущей задачи.
3. После merge повторить короткую проверку в `test` уже от `main`:
   - `TEST_REF=origin/main npm run deploy:test:smoke`
   - extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket).
4. В `prod` идти только по явному подтверждению владельца релиза и только из `main`.
5. После `prod` повторить post-deploy smoke + extended relay smoke и зафиксировать запись в release log.

Обязательные gate-ссылки:

- `docs/runbooks/PREPROD_DECISION_PACKAGE.md` — единый GO/NO-GO пакет и owner sign-off форма.
- `docs/runbooks/PREPROD_CHECKLIST.md` — контрольный список перед `prod`.

## Частые пропуски

1. Изменили API payload, но не синхронизировали web client.
2. Забыли проверить `AUTH_MODE=sso` и `AUTH_SSO_BASE_URL` для test.
3. Обновили README без обновления runbook.
4. Проверили только `/health`, но не сделали room/chat smoke.

## Текущий статус gate (snapshot, 2026-02-28)

- Текущий статус: **NO-GO** до explicit owner approval для `prod`.
- Последний подтверждённый test deploy SHA: `c52890d` (`origin/feature/web-header-profile-menu`).
- Минимум для `GO`:
   1. rollout target только `origin/main@<sha>`;
   2. `deploy:test:smoke` PASS (`smoke:sso`, `smoke:realtime`, `reconnectOk=true`);
   3. `npm run smoke:web:e2e` PASS;
   4. extended relay (`SMOKE_CALL_SIGNAL=1`) PASS;
   5. заполнены `Release Owner` + `Rollback Owner` + rollback ref.
