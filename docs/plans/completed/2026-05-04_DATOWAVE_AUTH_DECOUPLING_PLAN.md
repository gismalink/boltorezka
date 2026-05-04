# План: Datowave Auth Decoupling
Date: 2026-05-04
Scope: Полное отделение backend авторизации Datowave от gismalink (runtime, БД, OAuth клиенты, ingress, smoke, rollback), с rollout сначала в test и только после приемки в prod.
Status: In progress (core decoupling done in test/prod; OAuth provider hardening + ops docs/release logging pending)

## 0) Контекст

- Ранее `auth.datowave.com` и `auth.gismalink.art` были завязаны на общий auth runtime, что создавало риски общих отказов и конфликтов OAuth конфигурации.
- На 2026-05-04 ingress для Datowave уже ведет на отдельные datowave auth сервисы (`datowave-auth-test-datowave`, `datowave-auth-prod-datowave`), а не на `auth-sso-api-*`.
- В datowave auth env workaround `GOOGLE_CALLBACK_BASE_URL` не используется; в legacy shared-auth коде поддержка переменной еще присутствует как совместимость.
- Цель плана: убрать временные обходы и сделать Datowave auth независимым контуром.
- Ограничения: GitOps-only, сначала test, затем prod, обязательный smoke перед переключением prod.

## 0.1) Срез статуса на 2026-05-04

- Выполнено: отдельный datowave auth runtime и отдельные auth DB для test/prod подняты в datowave stack.
- Выполнено: `test.auth.datowave.com` и `auth.datowave.com` в ingress указывают на datowave auth backend.
- Выполнено: smoke-проверки auth routing и postdeploy smoke для prod проходили успешно в текущем rollout цикле.
- Выполнено: после обновления edge smoke (`prod datowave auth container checks`) test smoke снова подтвержден в green после восстановления static sync.
- Выполнено: `prod` smoke подтвержден в green после штатного `deploy-prod-from-ref` (восстановлен `ingress/static/datowave/prod`).
- Требует закрытия: финальная верификация OAuth client settings у провайдеров (Google/Yandex) и фиксация release log/runbook для этого трека.

## 1) Цели

- Datowave использует отдельный auth backend и отдельную auth БД в test/prod, без зависимости от gismalink auth runtime.
- Google/Yandex OAuth для Datowave работает без `GOOGLE_CALLBACK_BASE_URL` и без кросс-доменных handoff обходов.
- Логин/логаут/current-user/get-token стабильно работают для Datowave и Gismalink независимо друг от друга.

## 2) Workstreams

### 2.1 Архитектура и инфраструктура

- [x] Создать отдельный datowave auth stack (test/prod): `datowave-auth-test-datowave`, `datowave-auth-prod-datowave` + отдельные DB сервисы.
- [x] Вынести datowave auth БД в отдельные datowave volumes (`auth_test_datowave_data`, `auth_prod_datowave_data`).
- [x] Подготовить отдельные env файлы datowave auth (`.env.auth.test.datowave`, `.env.auth.prod.datowave`).
- [x] Привязать datowave auth сервисы к ingress/datowave сетям (`edge_public` + `data_test/data_prod`).

### 2.2 OAuth и безопасность

- [x] Подключить и подтвердить отдельные Google OAuth client id/secret для datowave test/prod (не только placeholders в env).
- [x] Подключить и подтвердить отдельные Yandex OAuth client id/secret для datowave test/prod.
- [x] Убедиться, что callback URI datowave у провайдеров совпадают с `auth.datowave.com` и `test.auth.datowave.com`.
- [x] Удалить workaround `GOOGLE_CALLBACK_BASE_URL` из datowave auth env (в datowave auth env отсутствует).
- [x] После стабилизации удалить/зафризить legacy callback-override ветку в shared auth runtime, чтобы исключить обратный дрейф.

### 2.3 Маршрутизация и cutover

- [x] Переключить `test.auth.datowave.com` в ingress на новый datowave auth backend.
- [x] Провести smoke в test (health/routing/current-user/get-token, базовый OAuth redirect).
- [x] Переключить `auth.datowave.com` в ingress на новый datowave auth backend.
- [x] Подтвердить, что `auth.gismalink.art` и `test.auth.gismalink.art` остаются на текущем gismalink auth контуре.
- [x] Добавить в edge smoke явную проверку running-состояния prod datowave auth контейнеров.

### 2.4 Наблюдаемость, rollback и документация

- [x] Добавить release log записи по test/prod rollout и smoke-результатам именно по datowave auth decoupling.
- [x] Подготовить rollback-команды: возврат `auth(.test).datowave.com` маршрутов на прежний backend.
- [x] Проверить rollback drill в `test` и зафиксировать время/результат.
- [x] Обновить канонику auth/stack docs с новой схемой разделения (edge + datowave).
- [x] Зафиксировать удаление временных обходов и финальное steady-state в docs.

## 3) Приоритеты

1. P0: Закрыть OAuth provider hardening (Google/Yandex callbacks + client credentials) без `redirect_uri_mismatch`.
2. P1: Дожать ops-контур: release log, rollback drill и prod container checks в smoke.
3. P2: Очистить legacy callback override в shared auth runtime и зафиксировать в канонике.

## 4) Acceptance criteria

- [x] `test.auth.datowave.com` и `auth.datowave.com` обслуживаются отдельным datowave auth runtime (не gismalink auth).
- [x] Для Datowave Google redirect использует свой datowave callback URI без `redirect_uri_mismatch`.
- [x] Для Datowave logout выставляет/чистит cookie в домене `.datowave.com`; для gismalink в `.gismalink.art`.
- [x] `gismalink` auth flow не зависит от datowave auth runtime и не деградировал после cutover.
- [x] Все smoke проверки `test` и `prod` пройдены и зафиксированы в release log.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- На сервере только GitOps-процедуры; без ручных правок runtime-конфигов вне задокументированных исключений.
- Любой rollback должен быть возможен одним переключением ingress маршрутов и recreate соответствующего сервиса.

## 6) Следующий практический шаг (короткий)

1. Плановые задачи закрыты; поддерживать steady-state через стандартный `test-smoke.sh` и release log.
2. При следующих изменениях auth provider конфигурации сначала прогонять `test`, затем `prod`.

## 7) Rollback playbook (готово к запуску)

Цель: быстрый возврат `auth.datowave.com` / `test.auth.datowave.com` на shared auth runtime (только при аварии и только по GitOps).

Pre-check:
- `cd ~/srv/edge && git status --porcelain` должен быть пустым.
- Зафиксировать текущий HEAD: `git rev-parse --short HEAD`.

Test rollback (первый этап):
1. В `edge/ingress/caddy/Caddyfile` временно переключить `test.auth.datowave.com`:
	- было: `reverse_proxy datowave-auth-test-datowave:3000`
	- rollback: `reverse_proxy auth-sso-api-test:3000`
2. Commit + push в `edge`.
3. На сервере: `cd ~/srv/edge && ./scripts/gitops-deploy.sh ~/srv/edge main`.
4. Применить Caddy: `cd ~/srv/edge/ingress && docker compose up -d --force-recreate edge-caddy`.
5. Smoke: `cd ~/srv/edge && ./scripts/test-smoke.sh --local test`.

Prod rollback (только после подтверждения test rollback smoke):
1. В `edge/ingress/caddy/Caddyfile` временно переключить `auth.datowave.com`:
	- было: `reverse_proxy datowave-auth-prod-datowave:3000`
	- rollback: `reverse_proxy auth-sso-api-prod:3000`
2. Commit + push в `edge`.
3. На сервере: `cd ~/srv/edge && ./scripts/gitops-deploy.sh ~/srv/edge main`.
4. Применить Caddy: `cd ~/srv/edge/ingress && docker compose up -d --force-recreate edge-caddy`.
5. Smoke: `cd ~/srv/edge && ./scripts/test-smoke.sh --local prod`.

Rollback success criteria:
- `https://test.auth.datowave.com/health` (`test`) и `https://auth.datowave.com/health` (`prod`) -> `200`.
- `smoke: OK` для соответствующей среды.
- Обязательная запись в release log с action=`rollback`.

## 8) Фактическая валидация (2026-05-04)

- `edge` обновлен по GitOps до `52622c1` (`scripts/test-smoke.sh` с strict-check datowave auth prod контейнеров).
- `test` smoke после восстановления static (`deploy-test-from-ref`) завершен `PASS`.
- Проверен OAuth redirect runtime:
	- `https://test.auth.datowave.com/auth/google?...` -> `redirect_uri=https://test.auth.datowave.com/auth/google/callback`
	- `https://auth.datowave.com/auth/google?...` -> `redirect_uri=https://auth.datowave.com/auth/google/callback`
- Добавлены и пройдены logout cookie-domain asserts в smoke:
	- gismalink -> `.gismalink.art` (`test`, `prod`)
	- datowave -> `.datowave.com` (`test`, `prod`)
- Datowave repo на сервере в test контуре подтвержден на `068671f`.
- Rollback drill (`test`) выполнен end-to-end:
	- rollback switch commit: `bcbca81` (`test.auth.datowave.com` -> `auth-sso-api-test`), smoke `PASS`.
	- restore commit: `475fbf3` (`test.auth.datowave.com` -> `datowave-auth-test-datowave`), smoke `PASS`.
	- временное окно drill: `2026-05-04T14:42:22Z` -> `2026-05-04T14:43:05Z` (~43s).
- Legacy callback override cleanup:
	- shared auth runtime больше не поддерживает `GOOGLE_CALLBACK_BASE_URL` в callback resolution.
	- канонические docs обновлены под steady-state разделения контуров (`docs/server/auth/README.md`, `docs/server/operations/stacks/AUTH_STACK.md`).
- Provider credentials audit (server-side, без раскрытия секретов):
	- `infra/.env.auth.test.datowave` и `infra/.env.auth.prod.datowave` содержат реальные (не placeholder) и разные Google/Yandex client id/secret.
	- Runtime redirect_uri для Yandex:
		- `test` -> `https://test.auth.datowave.com/auth/yandex/callback`
		- `prod` -> `https://auth.datowave.com/auth/yandex/callback`
