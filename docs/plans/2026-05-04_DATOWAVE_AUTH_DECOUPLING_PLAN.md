# План: Datowave Auth Decoupling
Date: 2026-05-04
Scope: Полное отделение backend авторизации Datowave от gismalink (runtime, БД, OAuth клиенты, ingress, smoke, rollback), с rollout сначала в test и только после приемки в prod.

## 0) Контекст

- Сейчас `auth.datowave.com` и `auth.gismalink.art` завязаны на общий auth runtime, что создает риски общих отказов и конфликтов OAuth конфигурации.
- В текущем состоянии используется временный workaround `GOOGLE_CALLBACK_BASE_URL`, чтобы обойти `redirect_uri_mismatch`.
- Цель плана: убрать временные обходы и сделать Datowave auth независимым контуром.
- Ограничения: GitOps-only, сначала test, затем prod, обязательный smoke перед переключением prod.

## 1) Цели

- Datowave использует отдельный auth backend и отдельную auth БД в test/prod, без зависимости от gismalink auth runtime.
- Google/Yandex OAuth для Datowave работает без `GOOGLE_CALLBACK_BASE_URL` и без кросс-доменных handoff обходов.
- Логин/логаут/current-user/get-token стабильно работают для Datowave и Gismalink независимо друг от друга.

## 2) Workstreams

### 2.1 Архитектура и инфраструктура

- [ ] Создать отдельный datowave auth stack (test/prod): `auth-dw-api-test/prod`, `auth-dw-db-test/prod`.
- [ ] Вынести datowave auth БД в отдельные data dir/volumes (`/Volumes/datas3/...`).
- [ ] Подготовить отдельные env файлы datowave auth (`.env.auth-dw.test`, `.env.auth-dw.prod`).
- [ ] Привязать datowave auth сервисы к нужным сетям ingress и datowave runtime.

### 2.2 OAuth и безопасность

- [ ] Подключить отдельные Google OAuth client id/secret для datowave test/prod.
- [ ] Подключить отдельные Yandex OAuth client id/secret для datowave test/prod.
- [ ] Убедиться, что callback URI datowave у провайдеров совпадают с `auth.datowave.com` и `test.auth.datowave.com`.
- [ ] Удалить workaround `GOOGLE_CALLBACK_BASE_URL` из datowave auth env после подтверждения провайдеров.

### 2.3 Маршрутизация и cutover

- [ ] Переключить `test.auth.datowave.com` в ingress на новый datowave auth backend.
- [ ] Провести smoke в test (login/logout/current-user/get-token, redirect_uri, cookie domain).
- [ ] Переключить `auth.datowave.com` в ingress на новый datowave auth backend (только после test acceptance).
- [ ] Убедиться, что `auth.gismalink.art` и `test.auth.gismalink.art` продолжают работать на текущем gismalink auth контуре.

### 2.4 Наблюдаемость, rollback и документация

- [ ] Добавить release log записи по test/prod rollout и smoke-результатам.
- [ ] Подготовить rollback-команды: возврат `auth(.test).datowave.com` маршрутов на прежний backend.
- [ ] Обновить канонику auth/stack docs с новой схемой разделения.
- [ ] Зафиксировать удаление временных обходов и финальное состояние в docs.

## 3) Приоритеты

1. P0: Восстановить и удержать стабильный login/logout Datowave в test без workaround и без регрессий.
2. P1: Переключить prod Datowave на отдельный auth backend с обязательным smoke.
3. P2: Документация и cleanup временных решений/алиасов после стабилизации.

## 4) Acceptance criteria

- [ ] `test.auth.datowave.com` и `auth.datowave.com` обслуживаются отдельным datowave auth runtime (не gismalink auth).
- [ ] Для Datowave Google redirect использует свой datowave callback URI без `redirect_uri_mismatch`.
- [ ] Для Datowave logout выставляет/чистит cookie в домене `.datowave.com`; для gismalink в `.gismalink.art`.
- [ ] `gismalink` auth flow не зависит от datowave auth runtime и не деградировал после cutover.
- [ ] Все smoke проверки `test` и `prod` пройдены и зафиксированы в release log.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- На сервере только GitOps-процедуры; без ручных правок runtime-конфигов вне задокументированных исключений.
- Любой rollback должен быть возможен одним переключением ingress маршрутов и recreate соответствующего сервиса.
