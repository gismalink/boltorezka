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
- Вне scope: `popn`, `projo` и остальные проекты; они остаются без изменений в рамках этого плана.

## 1) Что считаем "хвостами" gismalink.art

- DNS-записи и TLS-сертификаты старого домена в ingress.
- Base URL в frontend (`PUBLIC_URL`, API URL, WS URL, invite links).
- CORS/CSP/Origin allowlist в API и edge.
- Cookie domain/path/samesite/secure параметры.
- OAuth redirect/callback/logout URL (если есть внешний IdP).
- Email-шаблоны (verification/reset/invite) со старыми ссылками.
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
- [x] Переключить frontend URL на `datowave.com` (без app-поддомена), invite URL и deep-link URL на новый домен (test подтвержден; prod pending).
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
- [ ] Проверить восстановление пароля/верификацию email (ссылки на новом домене).

Текущий auth-flow и точки интеграции (2026-03-25, `test`):
- Web/desktop стартуют SSO через `GET /v1/auth/sso/start?provider=<google|yandex>&returnUrl=...` на `test.datowave.com`; redirect идет на `test.auth.datowave.com/auth/<provider>`.
- API работает в `sso` mode (`GET /v1/auth/mode`), локальная register/login ветка отключена и возвращает `SsoOnly`.
- После успешного callback API выдает JWT с session claims (`sid`, `authMode`, `role`) и поддерживает ротацию через `POST /v1/auth/refresh`, revoke через `POST /v1/auth/logout`.
- Realtime интегрирован через `GET /v1/auth/ws-ticket` (short-lived ticket для `/v1/realtime/ws`) и `POST /v1/auth/livekit-token` (grant на room join/publish/subscribe).
- В `test` подтверждены smoke: `smoke:sso`, `smoke:auth:session`, `smoke:auth:cookie-negative`, `smoke:auth:cookie-ws-ticket`.
- Добавлен runbook настройки Authentik для `test`: `docs/runbooks/AUTHENTIK_TEST_SETUP_RUNBOOK.md`.
- Добавлен отдельный redirect smoke для `sso/start + sso/logout`: `npm run smoke:sso:routing`.

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

### 3.4 Брендинг и контент

- [ ] Обновить product name/логотип/метаданные (title, OG tags, favicons).
- [ ] Обновить юридические страницы, policy, контакты, email footer.
- [ ] Обновить тексты onboarding/invite/notification под новый бренд.
- [ ] Убрать упоминания `gismalink.art` из UI и user-facing сообщений.

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

- [x] Подготовить короткую коммуникацию для текущих пользователей (новый домен + как войти).
- [x] Подготовить массовые invite/reset ссылки на новый домен (шаблон кампании + валидация ссылок).
- [x] Добавить migration banner в старом приложении: "Сайт переехал, авторизуйтесь повторно на новом домене" (в web-коде; test evidence pending).
- [x] Зафиксировать окно ручной поддержки входа (30 дней, в re-onboarding playbook).
- [ ] Для 10 текущих пользователей провести ручную верификацию успешного входа.
- [x] Подготовить post-cutover отчет: invited, activated, pending (template).

Статус на 2026-03-25 (`test`):
- Добавлен playbook re-onboarding: `DOMAIN_CUTOVER_REONBOARDING_PLAYBOOK.md` (шаблон сообщения, invite/reset campaign template, banner copy, daily tracking template).
- Добавлен execution kit: `DOMAIN_CUTOVER_EXECUTION_KIT.md` (invite/reset URL matrix, шаблон кампании на 10 пользователей, manual verification checklist, migration banner rollout task, post-cutover report template).
- В web-клиент добавлен runtime migration banner для legacy host `*.gismalink.art` с CTA на `https://datowave.com`.

### 3.7 Redirect-карта старых адресов на новые

- [ ] Зафиксировать явную таблицу соответствий host/path по правилу: заменить только суффикс `boltotrezka.gismalink.art` на `datowave.com`.
- [ ] Не создавать новые поддомены при переезде: переносить только те host-ы, которые уже существуют в старом контуре.
- [ ] Настроить redirect `301/308` на уровне ingress без redirect-loop.
- [x] Настроить redirect `301/308` на уровне ingress без redirect-loop (`test`: подтверждено для `test.boltorezka.gismalink.art` и `test.datute.ru`).
- [ ] Проверить сохранение пути и query params при redirect.
- [ ] Настроить redirect для auth-роутов и invite-ссылок (где это безопасно).
- [ ] Для auth-host в окно совместимости использовать dual-host (без принудительного redirect со старого auth-домена).
- [ ] Обновить smoke под проверку redirect-карты.

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

- [ ] Полный аудит упоминаний `gismalink.art` в коде, конфиге, документации, секретах и CI.
- [ ] Карта зависимостей: DNS, certs, ingress, auth callbacks, email templates.
- [ ] Зафиксировать целевой список доменов и поддоменов.
- [ ] Согласовать cutover window и rollback окно.

### Stage 1 - Test readiness

- [x] Поднять новый домен в `test`.
- [x] Проверить сценарий входа новых пользователей в `test` (базовый SSO flow на `test.datowave.com` подтвержден через Google/Yandex).
- [ ] Включить redirect-карту старый host -> новый host в `test`.
- [x] Прогнать smoke: redirect -> login/registration -> базовый доступ в продукт (частично, по текущему test-сценарию web+auth).
- [x] Зафиксировать и устранить дефекты (исправлен old auth redirect host `test.auth.gismalink.art` -> `test.auth.datowave.com`).

### Stage 2 - Prod cutover

- [ ] Deploy в `test` из целевой ветки + повторный smoke.
- [ ] После подтверждения: deploy в `prod` (GitOps only).
- [ ] Переключить DNS/ingress в `prod` и включить redirect-карту.
- [ ] Включить migration banner в старом приложении на весь период совместимости.
- [ ] Рассылать invite/reset для текущих пользователей на новый домен.
- [ ] Выполнить post-deploy smoke на `prod` (redirect + auth).

### Stage 3 - Stabilization (7-14 дней)

- [ ] Мониторинг ошибок/latency/auth-fail на новом домене.
- [ ] Мониторинг активации текущих пользователей (invited -> activated).
- [ ] Контроль redirect chains и корректности соответствий host/path.
- [ ] Удалить legacy-конфиг `gismalink.art` после окна совместимости.

## 6) Smoke-check (обязательно)

Минимум для `test` и `prod`:
- [x] `GET /health` web/api на новом домене (`test` подтвержден).
- [x] Login/logout для новых и re-onboarded пользователей (`test`: вход через Google/Yandex подтвержден).
- [ ] Проверка redirect со старых адресов на новые и отсутствие циклов.
- [ ] Проверка сохранения path и query params при redirect.
- [ ] Проверка migration banner на старом домене и корректной ссылки на новый домен.

## 7) Rollback

- [ ] Быстрый rollback DNS/ingress на старый primary host.
- [ ] Откат env-конфигов на предыдущий домен.
- [ ] Откат auth callback URL (если менялись).
- [ ] Проверка smoke после rollback.
- [ ] Запись инцидента в release log.

## 8) Критерии готовности (Definition of Done)

- [ ] Для всех текущих пользователей (10) выполнен re-onboarding на новом домене.
- [ ] Login re-onboarded users работает на новом домене в `test` и `prod`.
- [ ] Старые адреса корректно перенаправляют на новые (включая `test`).
- [ ] Redirect не создает циклов и сохраняет path/query.
- [ ] Runbooks/smoke/scripts актуализированы.
- [ ] Есть документированный rollback и результаты smoke.

## 9) Вопросы, которые нужно закрыть до Stage 1

1. Подтверждено: финальный домен = `datowave.com`; переезд host-ов делаем по правилу suffix replace.
2. Подтверждено: окно совместимости старого домена = 30 дней.
3. Формат re-onboarding: invite only или registration + invite.
4. Нужен ли ребрендинг email sender/domain одновременно с cutover.
5. Подтверждено: стратегия IdP для v1 = Вариант B (Authentik), внедрение через `test` с отдельным smoke перед `prod`.
6. Подтверждено: migration banner в старом UI обязателен на период перехода.
7. Финальная redirect-карта для ключевых адресов (включая `service.boltotrezka.gismalink.art` -> `service.datowave.com` и `test.service.boltotrezka.gismalink.art` -> `test.service.datowave.com`).
8. Проверить наличие auth-host в старом контуре и включить его в обязательную redirect-карту (`auth.*`, `test.auth.*`).

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
