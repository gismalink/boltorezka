# Domain Cutover Release/Rollback Runbook (datowave)

Цель: единый шаблон release notes + rollback инструкций для этапов domain cutover.

Scope:
- `test` и `prod` в рамках Boltorezka.
- GitOps-only: деплой через git + штатные скрипты.
- `prod` только из `main` и только по явному подтверждению.

## 1) Release notes template

Заполнять на каждый rollout (test/prod):

- Дата/время UTC:
- Environment: `test | prod`
- Release owner:
- Rollback owner:
- Commit SHA (target):
- Deploy source ref:
- Scope:
  - какие сервисы/доки изменились,
  - какие домены затронуты,
  - что НЕ входит в scope.
- Config deltas:
  - `AUTH_SSO_BASE_URL`,
  - `ALLOWED_RETURN_HOSTS`,
  - `AUTH_SESSION_COOKIE_DOMAIN`,
  - `LIVEKIT_URL`/realtime routing (если менялось).
- Smoke package:
  - `smoke:sso`
  - `smoke:sso:routing`
  - `smoke:auth:session`
  - `smoke:realtime`
  - `smoke:livekit:token-flow`
  - `smoke:livekit:media` (для media-изменений)
  - `smoke:test:postdeploy`
- Result summary:
  - `GO | ROLLBACK`
  - ключевые PASS/FAIL поля из `.deploy/last-smoke-summary.env`.
- Notes/risks:
  - известные ограничения,
  - наблюдаемые аномалии,
  - follow-up задачи.

## 2) Release flow (test-first)

1. Подтвердить clean git state и нужный ref.
2. Запустить deploy в `test`:
- `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/<feature-branch> npm run deploy:test:smoke'`
3. Проверить smoke summary:
- `ssh mac-mini 'cd ~/srv/boltorezka && cat .deploy/last-smoke-summary.env'`
4. Зафиксировать release notes запись (template из раздела 1).
5. Для `prod`:
- только после merge в `main`,
- повторный test smoke от `origin/main`,
- отдельное explicit подтверждение владельца релиза.

## 3) Rollback triggers

Rollback обязателен при любом из условий:
- `SMOKE_STATUS=fail` в postdeploy summary,
- auth redirect/regression (`smoke:sso` или `smoke:sso:routing` fail),
- массовая деградация realtime/media,
- health нестабилен,
- критичные ошибки в API/ingress логах.

## 4) Rollback procedure

1. Определить previous known-good ref/SHA.
2. Выполнить rollback deploy в целевой env:
- test:
  - `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=<known-good-ref> npm run deploy:test'`
- prod:
  - `ssh mac-mini 'cd ~/srv/boltorezka && PROD_REF=origin/main npm run deploy:prod'`
  - только при explicit прод-разрешении.
3. Прогнать smoke после rollback:
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:test:postdeploy` (для test)
4. Зафиксировать rollback запись в release notes:
- причина,
- ref до/после,
- результаты smoke,
- owner и время.

## 5) Datowave cutover specific checks

Перед закрытием релиза проверить:
- `https://test.datowave.com/health` -> `200`
- `/v1/auth/sso/start` redirect -> `test.auth.datowave.com`
- `/v1/auth/sso/logout` redirect -> `test.auth.datowave.com/auth/logout`
- `returnUrl` сохраняется без искажений.

## 6) Evidence storage

Хранить evidence в:
- `./.deploy/release-log.tsv`
- `./.deploy/last-smoke-summary.env`
- `docs/status/TEST_RESULTS.md` (короткая человекочитаемая выжимка).
