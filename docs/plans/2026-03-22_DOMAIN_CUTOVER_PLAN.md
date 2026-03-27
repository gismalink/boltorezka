# План: перенос продукта на новый домен (domain cutover)
Date: 2026-03-22
Scope: перенести только boltorezka-контур с `boltorezka.gismalink.art` (и связанных test/auth host в рамках boltorezka) на `datowave.com` через greenfield rollout: поднимаем новый контур, делаем redirect со старых адресов на новые, старый контур boltorezka выключаем после окна совместимости.

## 0) Цели и ограничения

- Новый домен должен стать основным публичным адресом продукта.
- Старые адреса должны отдавать redirect на соответствующие новые адреса.
- Миграция пользователей из старой БД не выполняется (переход через re-onboarding).
- Пользовательский опыт не должен ломаться в базовых флоу: открытие ссылок, вход/регистрация, доступ в продукт.
- Миграция выполняется через GitOps, с обязательным прогоном в `test` до `prod`.
- `prod`-выкатка только после явного подтверждения.
- Жесткий gate: до полного закрытия auth/SSO задач в `test` любые действия по `prod` запрещены.
- Вне scope: `popn`, `projo` и остальные проекты; они остаются без изменений в рамках этого плана.

## 1) Что считаем "хвостами" gismalink.art

- DNS-записи и TLS-сертификаты старого домена в ingress.
- Base URL в frontend (`PUBLIC_URL`, API URL, WS URL).
- CORS/CSP/Origin allowlist в API и edge.
- Cookie domain/path/samesite/secure параметры.
- OAuth redirect/callback/logout URL (если есть внешний IdP).
- Webhook/callback URL во внешних сервисах.
- Документация/runbook и smoke-команды со старым доменом.
- Мониторинг/алерты/дашборды, привязанные к старым host names.

## 2) Стратегия cutover

1. Подготовить dual-domain режим в `test`:
   - новый домен работает как primary,
   - старый домен обслуживается как redirect/compat.
2. Проверить все критические флоу на новом домене.
3. Выполнить `prod` cutover: DNS + edge + app config.
4. Держать контролируемый период совместимости (redirect + re-onboarding пользователей + мониторинг).
5. Финально убрать runtime-зависимости от `gismalink.art`.

## 3) Workstreams

### 3.1 Инфраструктура (DNS/TLS/Ingress)

- [x] Зарегистрировать и подтвердить новый домен `datowave.com`.
- [x] Применить подтвержденные DNS A-записи для `datowave.com` (см. раздел 10.3). Проверено `dig +short A` 2026-03-24.
- [x] Подтверждено (scope boltorezka): требуемые service-host покрыты и добавлены в DNS (`datowave.com`, `test.datowave.com`, `auth.datowave.com`, `test.auth.datowave.com`).
- [x] Выпустить TLS-сертификаты для нового домена и нужных поддоменов в `test` (`test.datowave.com`, `test.auth.datowave.com`); `prod` host pending.
- [x] Обновить ingress-конфиги (Caddy/Nginx) под новый host в `test`.
- [x] Настроить redirect `301/308` со старого домена на новый (без redirect-loop) в `test`.
- [x] Обновить HSTS/HTTPS policy под новый домен (`test` подтвержден; `prod` при cutover).

Статус на 2026-03-24:
- DNS A-записи на `datowave.com` и связанные host уже применены и проверены.
- Ingress/Caddy еще не переключен на новые host (в конфиге пока `boltorezka.gismalink.art` и `test.boltorezka.gismalink.art`).
- Host env переменные приложения пока указывают на старые домены (`CORS_ORIGIN`, `AUTH_SSO_BASE_URL`, `ALLOWED_RETURN_HOSTS`, cookie domain).

Статус на 2026-03-25 (`test`):
- `test.datowave.com` и `test.auth.datowave.com` обслуживаются по TLS, health-check проходит.
- `test.auth.datowave.com` изолирован в стеке boltorezka (`boltorezka-auth-test-datowave` + отдельная test DB).
- Исправлен OAuth redirect для `test`: API больше не возвращает `test.auth.gismalink.art`, используется `test.auth.datowave.com`.
- Redirect `test.boltorezka.gismalink.art` -> `test.datowave.com` отдает `308` и сохраняет query string.
- Добавлен redirect-only домен `test.datute.ru` -> `test.datowave.com` (`308`, path/query сохраняются).
- Перепроверка DNS от 2026-03-25: в scope этого плана (`boltorezka` cutover) требуемые host подтверждены; `popn`, `projo` и остальные отдельные проекты не входят в этот перенос.
- HTTPS policy (test): `http://test.datowave.com` и `http://test.auth.datowave.com` принудительно редиректят на HTTPS (`308`).
- HSTS policy (test): `Strict-Transport-Security: max-age=31536000; includeSubDomains` подтвержден на `test.datowave.com` и `test.auth.datowave.com` после перезапуска ingress (`docker compose up -d --force-recreate edge-caddy`).

### 3.2 Приложение (web/api/realtime)

- [x] Вынести все доменные URL в централизованную конфигурацию (test подтвержден; prod pending).
- [x] Переключить frontend URL на `datowave.com` (без app-поддомена) и deep-link URL на новый домен (test подтвержден; prod pending).
- [x] Обновить API CORS/CSP/Origin allowlist (test подтвержден; prod pending).
- [x] Обновить cookie domain и проверить cross-subdomain сценарии (test подтвержден; prod pending).
- [x] Проверить WS/realtime endpoint на том же типе host, что и до переезда (если раньше было path-based через основной/service host, не вводить новый `api` поддомен) (test подтвержден; prod pending).
- [x] Проверить voice/video signaling и media flow после смены origin (test подтвержден; prod pending).

Статус на 2026-03-25 (`test`):
- Web runtime использует централизованное определение origin/api/ws через `apps/web/src/runtimeOrigin.ts` и `apps/web/src/transportRuntime.ts`.
- Desktop fallback origin переключен на `https://test.datowave.com` (`test`) и `https://datowave.com` (`prod`).
- API env для test переведен на новый домен: `CORS_ORIGIN=https://test.datowave.com`, `AUTH_SSO_BASE_URL=https://test.auth.datowave.com`, `ALLOWED_RETURN_HOSTS=test.datowave.com`, `AUTH_SESSION_COOKIE_DOMAIN=.test.datowave.com`.
- Realtime signaling в test идет через `LIVEKIT_URL=wss://test.datowave.com` (без отдельного `api` поддомена).
- Smoke `smoke:sso` на `https://test.datowave.com`: `ok` (`302` на `test.auth.datowave.com`).
- Smoke `smoke:realtime` с `SMOKE_CALL_SIGNAL=1` и `SMOKE_RECONNECT=1`: `ok` (`callSignalRelayed=true`, `reconnectOk=true`, `mediaTopology=livekit`).
- Smoke `smoke:livekit:token-flow`: `ok` (join/reconnect/late-join grants подтверждены).
- Browser smoke `smoke:realtime:media` (с legacy call signaling): `ok` (peer connection `connected`, `oneWaySummary` без инцидентов, `renegotiationSummary` в лимитах).
- Smoke `smoke:test:postdeploy`: `ok` (включая `smoke:web:version-cache`, `smoke:auth:session`, `smoke:realtime`).

### 3.3 Auth и SSO (Keycloak/Authentik трек)

- [x] Зафиксировать текущий auth-flow (как есть) и точки интеграции (`test` подтвержден; `prod` pending).
- [x] Для `test.auth.datowave.com` использовать отдельный auth instance (`auth-test-datowave`) и отдельную test БД, без редиректа со старого `test.auth.gismalink.art`.
- [ ] Выбрать стратегию на v1 cutover:
  - [ ] Вариант A: без смены IdP, только доменная миграция.
  - [x] Вариант B: миграция на Authentik (выбрано 2026-03-25).
  - [ ] Вариант C: миграция на Keycloak.
- [x] Для выбранного IdP подготовить redirect URI/logout URI на новый домен (draft matrix ниже).
- [ ] Настроить клиенты OIDC (web/desktop) и claims mapping.
- [x] Проверить сессии: login, refresh, logout, silent renew (минимальный smoke в `test`: login через Google/Yandex подтвержден).
- [x] Email auth/register/reset/verify вынесены в отдельный план: `docs/plans/2026-03-26_EMAIL_AUTH_TRACK.md`.

Текущий auth-flow и точки интеграции (2026-03-25, `test`):
- Web/desktop стартуют SSO через `GET /v1/auth/sso/start?provider=<google|yandex>&returnUrl=...` на `test.datowave.com`; redirect идет на `test.auth.datowave.com/auth/<provider>`.
- API работает в `sso` mode (`GET /v1/auth/mode`), локальная register/login ветка отключена и возвращает `SsoOnly`.
- После успешного callback API выдает JWT с session claims (`sid`, `authMode`, `role`) и поддерживает ротацию через `POST /v1/auth/refresh`, revoke через `POST /v1/auth/logout`.
- Realtime интегрирован через `GET /v1/auth/ws-ticket` (short-lived ticket для `/v1/realtime/ws`) и `POST /v1/auth/livekit-token` (grant на room join/publish/subscribe).
- В `test` подтверждены smoke: `smoke:sso`, `smoke:auth:session`, `smoke:auth:cookie-negative`, `smoke:auth:cookie-ws-ticket`.
- Добавлен runbook настройки Authentik для `test`: `docs/runbooks/AUTHENTIK_TEST_SETUP_RUNBOOK.md`.
- Добавлен отдельный redirect smoke для `sso/start + sso/logout`: `npm run smoke:sso:routing`.
- Email-link smoke (`smoke:auth:links`) и весь email auth UI/flow вынесены в отдельный план: `docs/plans/2026-03-26_EMAIL_AUTH_TRACK.md`.

Draft: Authentik OIDC URI/logout matrix (v1 cutover)
- Web (`test`):
  - Redirect URI: `https://test.auth.datowave.com/auth/callback`
  - Post logout redirect URI: `https://test.datowave.com/`
- Web (`prod`):
  - Redirect URI: `https://auth.datowave.com/auth/callback`
  - Post logout redirect URI: `https://datowave.com/`
- Desktop (`test`):
  - Redirect URI: `boltorezka://auth/callback`
  - Post logout redirect URI: `https://test.datowave.com/desktop/logout-complete`
- Desktop (`prod`):
  - Redirect URI: `boltorezka://auth/callback`
  - Post logout redirect URI: `https://datowave.com/desktop/logout-complete`

Draft: Authentik OIDC clients and claims mapping (v1)
- Client `boltorezka-web`:
  - Grant types: Authorization Code + PKCE.
  - Redirect URIs: web matrix выше (`test`/`prod`).
  - Scopes: `openid profile email offline_access`.
- Client `boltorezka-desktop`:
  - Grant types: Authorization Code + PKCE.
  - Redirect URIs: `boltorezka://auth/callback`.
  - Scopes: `openid profile email offline_access`.
- Required claims in ID/access token for backend mapping:
  - `sub` (stable user id), `email`, `email_verified`, `preferred_username`, `name`.
  - `auth_time`, `sid` для session tracing/logout correlation.
  - `roles` (или эквивалентная custom claim) для map в локальный `role`.
- Backend mapping contract:
  - `authMode` фиксируется как `sso`.
  - `sid`/`authMode`/`role` продолжают попадать в локальный JWT API после callback.
  - При отсутствии `roles` применяется default локальная роль (`member`) с явной записью в audit-log.

### 3.8 Отдельный план по email auth

- [x] Все задачи email auth/register/reset/verify и почтового контура вынесены в отдельный документ: `docs/plans/2026-03-26_EMAIL_AUTH_TRACK.md`.
- [x] В текущем плане фиксируем только OAuth-only флоу (Google/Yandex).

### 3.4 Брендинг и контент

- [ ] Обновить product name/логотип/метаданные (title, OG tags, favicons). Новое название "Dato" ()
- [x] Обновить юридические страницы, policy, контакты, email footer (в рамках отдельного legal-плана).
- [x] Добавить cookie-consent баннер в web (классический push с кнопкой `Ок` и текстом: "Мы используем cookie, чтобы сайт работал").
- [ ] Обновить тексты onboarding/invite/notification под новый бренд.
- [ ] Убрать упоминания `gismalink.art` из UI и user-facing сообщений.

Юридический трек вынесен в отдельный план: `docs/plans/2026-03-27_LEGAL_COMPLIANCE_PLAN.md`.

### 3.5 Операционка и документация

- [x] Обновить runbooks и smoke scripts на новый домен (`test` подтвержден; `prod` pending).
- [x] Обновить release notes и rollback инструкции (runbook template добавлен).
- [x] Добавить post-cutover чеклист с владельцами шагов.
- [ ] Обновить monitoring/alerts/dashboards по новым host.

Статус на 2026-03-25 (`test`):
- Обновлены default URL в deploy/ops/smoke скриптах на `https://test.datowave.com` (включая `deploy-test-from-ref.sh`, `deploy-test-and-smoke.sh`, `run-all-smokes.sh`, cookie/desktop smoke scripts).
- Обновлены scheduler job env defaults (`chat-orphan-cleanup`, `slo-rolling-gate`) и `scripts/README.md` под новый test host.
- Обновлены operational runbook/checklist под новый test/auth host: `RUNBOOK_TEST_ROLLOUT_QUICKSTART.md`, `RUNBOOK_TEST_DEPLOY.md`, `workflow-checklist.md`, `PREPROD_CHECKLIST.md`.
- Дополнительно синхронизированы домены в runtime runbook: `DESKTOP_SLEEP_WAKE_RUNBOOK.md`, `LIVEKIT_TEST_FOUNDATION_RUNBOOK.md`, `DESKTOP_SECURITY_GATE_RUNBOOK.md`.
- Добавлены domain-cutover шаблоны: `DOMAIN_CUTOVER_RELEASE_ROLLBACK_RUNBOOK.md`, `DOMAIN_CUTOVER_POSTCUTOVER_CHECKLIST.md`.

### 3.6 Re-onboarding пользователей (без миграции БД)

- [x] Подготовить OAuth-only коммуникацию для текущих пользователей (новый домен + вход через Google/Yandex).
- [x] Подтвердить redirect-only политику для старого домена (редирект на уровне ingress, без UI-этапа совместимости).
- [x] Зафиксировать окно ручной поддержки входа (30 дней, в re-onboarding playbook).
- [x] Выборочная ручная верификация успешного входа выполнена (3 аккаунта, решение владельца релиза считать критерий закрытым).
- [x] Подготовить post-cutover отчет: verified users / failed logins / follow-ups (template).

Статус на 2026-03-25 (`test`):
- Добавлен playbook re-onboarding: `DOMAIN_CUTOVER_REONBOARDING_PLAYBOOK.md` (OAuth-only сообщение, daily tracking template, redirect-only policy).
- Добавлен execution kit: `DOMAIN_CUTOVER_EXECUTION_KIT.md` (manual verification checklist, redirect-map validation task, post-cutover report template).

Статус на 2026-03-26 (`test`, manual validation):
- На `https://test.datowave.com/` подтверждены login/logout в одном окне для 3 аккаунтов без инцидентов.
- Подтвержден сценарий автоматической заявки и ее прием.
- Решение владельца релиза: full-check 10/10 не требуется для текущего cutover, критерий закрыт на основе выборочной ручной валидации.

### 3.7 Redirect-карта старых адресов на новые

- [x] Зафиксировать явную таблицу соответствий host/path по правилу: заменить только суффикс `boltotrezka.gismalink.art` на `datowave.com` (см. раздел 10.2).
- [x] Не создавать новые поддомены при переезде: переносить только те host-ы, которые уже существуют в старом контуре (правило зафиксировано в разделе 10.2).
- [x] Настроить redirect `301/308` на уровне ingress без redirect-loop (`test`: подтверждено для `test.boltorezka.gismalink.art` и `test.datute.ru`).
- [x] Проверить сохранение пути и query params при redirect (`test`: подтверждено `npm run smoke:redirect-map`, 2026-03-26).
- [x] Настроить redirect для auth-роутов (где это безопасно): принудительный redirect со старого auth-host не включаем по политике dual-host.
- [x] Для auth-host в окно совместимости использовать dual-host (без принудительного redirect со старого auth-домена) — подтверждено в `test` (2026-03-26).
- [x] Обновить smoke под проверку redirect-карты (`npm run smoke:redirect-map`).

Статус на 2026-03-26 (`test`):
- Добавлен redirect-map smoke: `scripts/smoke/smoke-domain-redirect-map.mjs` + npm команда `smoke:redirect-map`.
- Добавлена поддержка scope для redirect smoke: `test` (default) и `prod` (`SMOKE_REDIRECT_SCOPE=prod`).
- Подтверждено выполнение redirect smoke в `test`: `test.boltorezka.gismalink.art -> test.datowave.com` и `test.datute.ru -> test.datowave.com` (`308`, path/query сохранены).
- Подтвержден dual-host auth в `test`: `test.auth.datowave.com` и `test.auth.gismalink.art` обслуживаются параллельно, оба отдают `302` на Google OAuth без принудительного редиректа старого auth-host.

## 4) Decision memo: Keycloak vs Authentik

Критерии для выбора (оценка перед внедрением):
- OIDC/SAML поддержка и гибкость policy.
- Сложность эксплуатации (backup, upgrade, observability).
- UX admin panel для ежедневных задач.
- Простота интеграции с текущим backend и desktop/web клиентами.
- Время внедрения и риск в рамках ближайшего релиза.

Практическая рекомендация:
- Для быстрого переноса не блокировать cutover заменой IdP.
- Сначала выполнить доменный перенос + re-onboarding без миграции пользователей.
- Внедрение Keycloak/Authentik делать отдельным этапом после стабилизации.

## 5) Этапы реализации

### Stage 0 - Discovery (1-2 дня)

- [x] Полный аудит упоминаний `gismalink.art` в коде, конфиге, документации, секретах и CI.
- [x] Карта зависимостей: DNS, certs, ingress, auth callbacks.
- [x] Зафиксировать целевой список доменов и поддоменов.
- [x] Согласовать cutover window и rollback окно.

Статус Stage 0 на 2026-03-26:
- Выполнен audit active-контента (`apps/`, `infra/`, `scripts/`, `docs/`, `README.md`, `package.json`), обнаружено 223 упоминания legacy-доменов; большая часть в исторических `docs/status/test-results/*` и completed-планах.
- В рабочих документах и env-примерах обновлены test/prod host примеры на `datowave.com`.
- Карта target-host и окна совместимости зафиксированы в разделах 9-10 и в re-onboarding playbook.

### Stage 1 - Test readiness

- [x] Поднять новый домен в `test`.
- [x] Проверить сценарий входа новых пользователей в `test` (базовый SSO flow на `test.datowave.com` подтвержден через Google/Yandex).
- [x] Включить redirect-карту старый host -> новый host в `test`.
- [x] Прогнать smoke: redirect -> login/registration -> базовый доступ в продукт (частично, по текущему test-сценарию web+auth).
- [x] Зафиксировать и устранить дефекты (исправлен old auth redirect host `test.auth.gismalink.art` -> `test.auth.datowave.com`).

### Stage 2 - Prod cutover

- [x] Gate перед Stage 2: auth/SSO OAuth-only трек в `test` закрыт полностью (Google/Yandex login/refresh/logout + `Complete SSO Session`) — подтверждено smoke + manual check (3 аккаунта), 2026-03-26.
- [x] Deploy в `test` из целевой ветки + повторный smoke (2026-03-26, `feature/datowave-auth-stack-move`, PASS).
- [x] Post-merge guard: повторный deploy+smoke в `test` от `origin/main` выполнен (2026-03-26, SHA `ccdca40`, PASS).
- [x] После подтверждения: deploy в `prod` (GitOps only).
- [x] Переключить DNS/ingress в `prod` и включить redirect-карту.
- [x] Подтвердить redirect-only поведение старого домена в `prod`.
- [ ] Выполнить OAuth-only коммуникацию для текущих пользователей на новом домене.
- [x] Выполнить post-deploy smoke на `prod` (redirect + auth).

Статус Stage 2 на 2026-03-27:
- Выполнен rollout через GitOps из `main` в `edge` (SHA `50ba845`, 2026-03-27).
- `https://datowave.com/` отвечает `200`; `https://www.datowave.com/` редиректит `308` на `https://datowave.com/`.
- `https://boltorezka.gismalink.art/` переведен в redirect-only (`308` на `https://datowave.com{uri}` с сохранением path/query).
- Auth dual-host в `prod` подтвержден: `auth.datowave.com` и `auth.gismalink.art` отдают `302` на Google OAuth.

### Stage 3 - Stabilization (7-14 дней)

- [ ] Мониторинг ошибок/latency/auth-fail на новом домене.
- [ ] Мониторинг успешных OAuth логинов и отказов (`login_ok`/`login_fail`).
- [x] Контроль redirect chains и корректности соответствий host/path (через регулярный `smoke:redirect-map` в `test`).
- [ ] Удалить legacy-конфиг `gismalink.art` после окна совместимости.

## 6) Smoke-check (обязательно)

Минимум для `test` и `prod`:
- [x] `GET /health` web/api на новом домене (`test` подтвержден).
- [x] Login/logout для новых и re-onboarded пользователей (`test`: вход через Google/Yandex подтвержден).
- [x] Проверка redirect со старых адресов на новые и отсутствие циклов (`test`: `smoke:redirect-map` PASS, 2026-03-26).
- [x] Проверка сохранения path и query params при redirect (`test`: `smoke:redirect-map` PASS, 2026-03-26).
- [x] Проверка redirect-only поведения на старом домене (`test`: `test.boltorezka.gismalink.art` и `test.datute.ru` -> `test.datowave.com`, `308`).

## 7) Rollback

Rollback-планирование в рамках этого документа не ведем (решение владельца релиза от 2026-03-26).
Если потребуется rollback для `prod`, оформим отдельным runbook/инцидентом перед выполнением.

## 8) Критерии готовности (Definition of Done)

- [x] Выборочная ручная валидация re-onboarding на новом домене выполнена и утверждена владельцем релиза (3 аккаунта).
- [ ] Login re-onboarded users работает на новом домене в `test` и `prod`.
- [x] Старые адреса корректно перенаправляют на новые (включая `test`).
- [x] Redirect не создает циклов и сохраняет path/query.
- [x] Runbooks/smoke/scripts актуализированы.

## 9) Вопросы, которые нужно закрыть до Stage 1

1. Подтверждено: финальный домен = `datowave.com`; переезд host-ов делаем по правилу suffix replace.
2. Подтверждено: окно совместимости старого домена = 30 дней.
3. Формат re-onboarding: OAuth-only (Google/Yandex) + manual support window.
4. Email auth/register/reset/verify вынесены в отдельный план: `docs/plans/2026-03-26_EMAIL_AUTH_TRACK.md`.
5. Подтверждено: стратегия IdP для v1 = Вариант B (Authentik), внедрение через `test` с отдельным smoke перед `prod`.
6. Подтверждено: для старого домена используется только redirect-only политика.
7. Финальная redirect-карта для ключевых адресов (включая `service.boltotrezka.gismalink.art` -> `service.datowave.com` и `test.service.boltotrezka.gismalink.art` -> `test.service.datowave.com`).
8. Подтверждено: auth-host в старом контуре присутствует и работает в режиме dual-host без обязательного redirect (`auth.*`, `test.auth.*`).

## 10) Подтвержденная схема адресов и redirect (v1)

### 10.1 Новые адреса

- `https://datowave.com` -> основной web (app на корневом домене).
- Сервисные host-ы сохраняют структуру и меняют только доменный суффикс.
- Test host-ы сохраняют прежний принцип именования `test.<service>.<domain>`.

### 10.2 Redirect-карта старых адресов

- `https://boltotrezka.gismalink.art` -> `https://datowave.com`.
- `https://test.service.boltotrezka.gismalink.art` -> `https://test.service.datowave.com`.
- `https://auth.boltotrezka.gismalink.art` -> `https://auth.datowave.com`.
- `https://test.auth.boltotrezka.gismalink.art` -> `https://test.auth.datowave.com`.
- Для auth-host в период совместимости: старый и новый host должны обслуживаться параллельно (без обязательного redirect), чтобы не сломать внешние зависимости старых проектов.
- Если API исторически не был отдельным host (работал path-based), не добавлять `api.datowave.com` и оставить ту же path-схему на новом домене.

Единое правило переезда host:
- для любого host вида `<prefix>.boltotrezka.gismalink.art` целевой host = `<prefix>.datowave.com`;
- для корневого host `boltotrezka.gismalink.art` целевой host = `datowave.com`.

Правило redirect:
- сохранять path и query params;
- не менять HTTP method на критичных endpoint при необходимости использовать `308`;
- исключить redirect-loop на уровне ingress.

### 10.3 Подтвержденные DNS A-записи (от 2026-03-24)

- `datowave.com` (`@`) -> `95.165.154.118`
- `auth.datowave.com` -> `95.165.154.118`
- `test.datowave.com` -> `95.165.154.118`
- `test.auth.datowave.com` -> `95.165.154.118`
- `turn.datowave.com` -> `95.165.154.118`
- `turn2.datowave.com` -> `46.149.71.86`
- `turns.datowave.com` -> `95.165.154.118`
- `www.datowave.com` -> `95.165.154.118`

Примечание:
- `turn2.datowave.com` намеренно вынесен на отдельный IP `46.149.71.86`.

### 10.4 Smoke DNS/SSL по подтвержденным host

Проверять после применения DNS и после deploy в `test`/`prod`.

1) Проверка резолва (A):

```bash
for h in datowave.com auth.datowave.com test.datowave.com test.auth.datowave.com turn.datowave.com turn2.datowave.com turns.datowave.com www.datowave.com; do
  echo "== $h =="
  dig +short A "$h"
done
```

Ожидаемо:
- `turn2.datowave.com` -> `46.149.71.86`
- остальные из списка -> `95.165.154.118`

2) Проверка HTTP/HTTPS ответа:

```bash
for h in datowave.com auth.datowave.com test.datowave.com test.auth.datowave.com www.datowave.com; do
  echo "== https://$h =="
  curl -sSI "https://$h" | sed -n '1,8p'
done
```

3) Проверка TLS сертификата (CN/SAN/даты):

```bash
for h in datowave.com auth.datowave.com test.datowave.com test.auth.datowave.com www.datowave.com; do
  echo "== cert $h =="
  echo | openssl s_client -servername "$h" -connect "$h:443" 2>/dev/null | openssl x509 -noout -subject -issuer -dates
done
```

4) Проверка TURN host:

```bash
for h in turn.datowave.com turn2.datowave.com turns.datowave.com; do
  echo "== $h =="
  dig +short A "$h"
done
```

Критерии успеха:
- DNS совпадает с таблицей 10.3.
- На web/auth/test host нет TLS ошибок и сертификат валиден.
- Для старых адресов работает redirect на новые host с сохранением path/query.

Результат проверки DNS (2026-03-24):
- `datowave.com` -> `95.165.154.118`
- `auth.datowave.com` -> `95.165.154.118`
- `test.datowave.com` -> `95.165.154.118`
- `test.auth.datowave.com` -> `95.165.154.118`
- `turn.datowave.com` -> `95.165.154.118`
- `turn2.datowave.com` -> `46.149.71.86`
- `turns.datowave.com` -> `95.165.154.118`
- `www.datowave.com` -> `95.165.154.118`
- Статус: совпадает с таблицей 10.3.

### 10.5 Дополнительный redirect-only домен

`datute.ru` используется только как redirect-layer (без самостоятельного app/runtime).

DNS A-записи (2026-03-25):
- `datute.ru` (`@`) -> `95.165.154.118`
- `test.datute.ru` -> `95.165.154.118`
- `www.datute.ru` -> `95.165.154.118`

Ingress правило (test):
- `https://test.datute.ru/*` -> `https://test.datowave.com/*` (`308`, сохраняются path/query).

Smoke (2026-03-25):
- `https://test.datute.ru/health?probe=2` -> `308 Location: https://test.datowave.com/health?probe=2`.
