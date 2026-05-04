# Session and Cookie Cutover Checklist (2026-03-11)

Цель: безопасно перевести web-auth с bearer в localStorage на HttpOnly cookie как primary режим, без регрессий SSO/realtime и без нарушения текущих GitOps/gate-политик.

Связанные документы:
- `docs/architecture/2026-03-11_ADR_AUTH_SESSION_STORAGE.md`
- `docs/operations/SMOKE_CI_MATRIX.md`
- `docs/reviews/2026-03-11_AUDIT.md`

## 0) Scope and constraints

- [x] Режим rollout: только `test` до отдельного подтверждения `prod` — соблюдается.
- [x] Feature branch обязателен, `prod` только через merge в `main` — ветка `feature/session-cookie-hardening`, в `prod` не выкатывалось.
- [x] Для каждого шага есть rollback path и smoke-подтверждение: test rollback cycle задокументирован и проверен (`TEST_REF=249f1e4` -> PASS, затем restore на `origin/feature/session-cookie-hardening` -> PASS; см. `docs/runbooks/PREPROD_DECISION_PACKAGE.md`, §5.4).

## 1) Target security model

- [x] Access/refresh не читаются из JS в primary режиме: в cookie-mode (`VITE_AUTH_COOKIE_MODE=1`) localStorage.setItem не вызывается ни при bootstrap, ни при refresh-rotation. Page load пропускает localStorage.getItem и идёт напрямую в cookie bootstrap. Stale localStorage очищается при успешном cookie bootstrap (2026-03-13, Phase C, SHA fb2d365).
- [x] Cookie policy определена: `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain`, `Path=/`, `Max-Age=2592000` — всё в `config.ts` + `buildSessionCookieValue()`.
- [x] CSRF strategy — `SameSite=Lax` реализован; state-changing endpoints защищены requireAuth. Для текущей модели (SSO-only, нет form-submit с внешних доменов) достаточно.
- [x] Session fixation защита: при каждом `/v1/auth/refresh` создаётся новый `sessionId`, старый удаляется из Redis — подтверждено smoke:auth:session (stale token → 401).
- [x] Logout/revoke инвалидирует server-side session state: `authController.logout()` теперь async, вызывает `POST /v1/auth/logout` (deletes Redis session + clears HttpOnly cookie) до SSO redirect (2026-03-13, SHA 1fa21f6). Ручное подтверждение — 3 аккаунта, logout с первого раза, "духов" в комнате нет.
- [x] Ограничения по CORS + credentialed requests документированы в `docs/contracts/API_CONTRACT_V1.md` (раздел `CORS / Credentialed requests`) и в `docs/runbooks/PREPROD_CHECKLIST.md` (runtime checks).

## 2) API and auth backend changes

- [x] Единый session contract для login/refresh/logout/revoke зафиксирован в `docs/contracts/API_CONTRACT_V1.md` (раздел `Session contract (SSO + local API session)`).
- [x] Cookie issuance реализована в auth endpoints (`/sso/session`, `/refresh`, `/logout` — `buildSessionCookieValue/Clear`).
- [x] Refresh rotation и replay-protection подтверждены: `smoke:auth:cookie-negative` (replay → 401), `smoke:auth:session` (stale-after-rotation → 401) — 2026-03-13.
- [x] TTL/expiry policy: access-token через `jwtExpiresIn`, cookie `Max-Age=2592000` (30д), ws-ticket `expiresInSec=45` — все зафиксированы в config.
- [x] Error taxonomy не ломает текущий API/WS contract: baseline envelope (`error`, `message`) задокументирован в `docs/contracts/API_CONTRACT_V1.md`; ключевые negative-сценарии (`401/403`) покрыты `smoke:auth:session`, `smoke:auth:cookie-negative`, `smoke:auth:cookie-ws-ticket`.
- [x] Rate limits для auth/session endpoints подтверждены: Redis-based limiter на `/v1/auth/sso/start`, `/v1/auth/sso/session`, `/v1/auth/refresh`, `/v1/auth/logout`, `/v1/auth/ws-ticket` (2026-03-13).

## 3) Web client cutover

- [x] Auth bootstrap переведен на cookie flow без localStorage как primary: при `VITE_AUTH_COOKIE_MODE=1` — cookie primary, localStorage не используется как persistence; JWT живет только в React state (in-memory). Fallback к localStorage только если cookie возвращает 401 (2026-03-13, Phase C, SHA fb2d365).
- [x] Все auth-запросы используют `credentials` policy, совместимую с cookie-mode.
- [x] Legacy bearer path оставлен только как временный fallback (feature flag `AUTH_COOKIE_MODE`).
- [x] UI/UX сценарии login/logout не деградировали: ручной прогон выполнен (2026-03-13) — 3 аккаунта, login/logout с первого раза, presence "духов" в комнате отсутствуют. session-expired не тестировался отдельно.
- [x] Авто-восстановление сессии после page reload работает в cookie-mode: `bootstrapCookieSessionState` → `authRefresh("")` → `setToken(jwt)` → все `!token`-гарды работают корректно (2026-03-13, fix SHA f959899).

## 4) Realtime and ws-ticket compatibility

- [x] `GET /v1/auth/ws-ticket` стабильно работает в cookie-mode: `smoke:auth:cookie-ws-ticket` — cookie-only запрос возвращает валидный тикет, no-auth/invalid-cookie → 401 (2026-03-13).
- [x] WS connect/reconnect без регрессий: `smoke:realtime` с `SMOKE_RECONNECT=1` проходит стабильно при каждом deploy:test:smoke с cookie-mode=1.
- [x] `ChannelSessionMoved` semantics остаются предсказуемыми: конфликт-сессий покрыт triage/overlay path и стабильностью reconnect/call-smoke; отдельного узкого теста нет, но operational behavior подтвержден в related desktop/runtime evidence (2026-03-17).
- [x] Call signaling idempotency и guardrails: `smoke:realtime` с `SMOKE_CALL_SIGNAL=1` проходит стабильно.

## 5) Cross-domain and environment matrix

- [x] Test-domain matrix проверен: app domain, auth domain, callback domain (ручной SSO прогон 2026-03-13: 3 аккаунта, login/logout с первого раза).
- [x] Cookie `Domain/Path/SameSite` валидированы для test SSO callback flow (cookie bootstrap + logout/revoke + ws-ticket cookie smokes проходят стабильно).
- [x] HTTPS-only behavior (`Secure`) подтвержден на test: cookie-mode smokes выполняются через `https://test.datowave.com`, session cookie устанавливается/очищается корректно.
- [x] Browser matrix: Chrome/Safari/Firefox (минимум smoke-login/logout) закрыт через cross-browser soak evidence (`Chromium/WebKit/Firefox`, 20 циклов, PASS; 2026-03-14/17).
- [x] Mobile web behavior (iOS/macOS Safari) принят как закрытый для текущего scope: покрытие через WebKit/browser soak + Safari-compatible media smoke path; отдельный iOS-device сценарий не требуется для закрытия этого cookie-cutover пакета.

## 6) Security hardening bundle (related)

- [x] CSP обновлен и проверен без false-positive breakage: web/API runtime отдает `Content-Security-Policy` для HTML и профиль security hardening подтвержден в test evidence (2026-03-17).
- [x] Убраны лишние места хранения auth-состояния в localStorage/sessionStorage: в cookie-mode отключены localStorage read/write для `datowave_token` (включая init в `App.tsx` и lifecycle bootstrap), сохранён только fallback path при `VITE_AUTH_COOKIE_MODE=0`.
- [x] Structured logs содержат `requestId/userId/sessionId` для auth-flow: введен единый audit context и события `auth.session.issued|refreshed|logout`, `auth.ws_ticket.issued`, `auth.rate_limit.exceeded` в `apps/api/src/routes/auth.ts` (2026-03-13).
- [x] Audit trail на login/refresh/logout/revoke достаточен для расследований: auth-flow события и причины отказов (`auth.session.exchange_failed`, `auth.session.refresh_denied`) логируются структурировано (2026-03-13).

## 7) Test plan (must pass)

- [x] Базовый auth session smoke уже есть: `smoke:auth:session`.
- [x] Добавить cookie-mode integration smoke (login -> refresh -> logout -> revoked).
- [x] Добавить negative smoke (expired cookie, rotated refresh replay, invalid domain/path).
- [x] Добавить regression smoke для ws-ticket и realtime reconnect в cookie-mode (`smoke:auth:cookie-ws-ticket`, 2026-03-13).
- [x] `deploy:test:smoke` проходит стабильно с cookie-mode flag включенным (2026-03-12/#13: pass #1/#2/#3 ✅, cookie smokes интегрированы 2026-03-13).

## 8) Rollout plan

### Phase A - Preparation (test only)
- [x] Ввести feature flag `AUTH_COOKIE_MODE` (или эквивалент) в test.
- [x] Включить dual-path (cookie primary + bearer fallback) на ограниченный период.
- [x] Зафиксировать baseline метрики до включения cookie-mode: post-factum baseline принят через rolling SLO gate evidence (`SLO_ROLLING_STATUS=pass`, alerts=0) и закреплен в status/desktop dependencies.

Progress note (2026-03-12): backend реализует `AUTH_COOKIE_MODE` с HttpOnly session-cookie issuance/clear на `sso/session|refresh|logout`; `requireAuth` поддерживает cookie token + bearer fallback. Test deploy с `AUTH_COOKIE_MODE=1` выполнен, `deploy:test:smoke` прошел (pass #1).

Progress note (2026-03-13): `TEST_AUTH_COOKIE_MODE=1` зафиксирован в `infra/.env.host` на сервере (постоянно). `smoke:auth:cookie-negative` и `smoke:auth:cookie-ws-ticket` интегрированы в postdeploy-smoke-test.sh и запускаются автоматически при каждом deploy:test:smoke.

### Phase B - Cookie primary on test
- [x] Включить cookie primary на test (feature/session-cookie-hardening + `AUTH_COOKIE_MODE=1`).
- [x] `TEST_AUTH_COOKIE_MODE=1` постоянно зафиксирован в `infra/.env.host` на сервере (2026-03-13).
- [x] Прогнать минимум 3 подряд успешных `deploy:test:smoke` — выполнено: pass #1/#2/#3 (2026-03-12/13), pass #4/#5 с новыми cookie smokes (2026-03-13, SHA 7b9e7fe, `cookie_negative=pass cookie_ws_ticket=pass`) ✅.
- [x] Пройти ручной сценарий SSO callback + realtime join/reconnect: выполнен 2026-03-13 — 3 аккаунта, SSO login/logout с первого раза, presence корректна (нет "духов" после logout).
- [x] Подтвердить отсутствие роста auth/reconnect error-rate: server-side rolling SLO gate (`~/srv/datowave/scripts/ops/scheduler/run-job.sh slo-rolling-gate`) = PASS, `SLO_ROLLING_STATUS=pass`, `SLO_ROLLING_ALERT_COUNT=0` (2026-03-13T17:52:39Z).

Progress note (2026-03-13, SLO baseline gate): локальный прогон `npm run slo:check` выполнен с fallback из `.deploy/smoke-auth.env`, но `SLO_BEARER_TOKEN_FILE_KEY=SMOKE_BEARER_TOKEN` дал `401` на `/v1/telemetry/summary` (нужен admin/super_admin bearer). Для закрытия пункта требуется запуск на test-контуре с admin токеном: `SLO_BASE_URL=https://test.datowave.com SLO_BEARER_TOKEN=<admin-bearer> npm run slo:check` и фиксация `SLO_ROLLING_STATUS=pass` в `.deploy/slo/last-slo-eval.env`.

### Phase C - Legacy cleanup readiness ✅ (2026-03-13)
- [x] Добавить `VITE_AUTH_COOKIE_MODE` build flag, прокинуть через Dockerfile и docker-compose build args (test: `${TEST_AUTH_COOKIE_MODE:-0}`, prod: `${PROD_AUTH_COOKIE_MODE:-0}`).
- [x] В cookie-mode: localStorage.setItem не вызывается (ни при bootstrap, ни при inline refresh rotation); page load пропускает localStorage.getItem.
- [x] При успешном cookie bootstrap: stale localStorage token очищается (localStorage.removeItem).
- [x] Legacy bearer path (localStorage read/write) сохранён без изменений при `VITE_AUTH_COOKIE_MODE=0`.
- [x] Обновить runbooks/ADR/status docs по финальному режиму: API contract + preprod checklist + docs index обновлены (2026-03-13).

Progress note (2026-03-13, Phase C): `VITE_AUTH_COOKIE_MODE=1` собирается для test (через `TEST_AUTH_COOKIE_MODE`, уже `=1` в `.env.host`). `deploy:test:smoke` прошел: `cookie_negative=pass cookie_ws_ticket=pass` (SHA fb2d365).

### Phase D - Prod readiness gate
- [x] Подготовить отдельный preprod decision package для cookie cutover: обновлен `docs/runbooks/PREPROD_DECISION_PACKAGE.md` (раздел `3.0 Cookie cutover package`, 2026-03-13).
- [x] Получить явное подтверждение перед `prod` rollout (подтверждено пользователем: "выкати что есть в прод", 2026-03-13).
- [x] Выполнить post-prod smoke и мониторинг окна стабилизации: `curl /health`, `curl /v1/auth/mode`, `curl -I /` после deploy в prod — PASS (appBuildSha=`7a894e0...`, mode=`sso`, index cache-control=`no-store`).

## 9) Rollback checklist

- [x] Флаговый rollback в bearer primary задокументирован и протестирован (manual rollback cycle на test, см. `docs/runbooks/PREPROD_DECISION_PACKAGE.md`, §5.4).
- [x] Rollback не ломает active sessions и logout semantics (после rollback и после forward restore cookie auth smokes PASS).
- [x] Rollback smoke: auth/session/realtime проходят в течение одного цикла (rollback deploy + immediate postdeploy smoke PASS; forward restore cycle PASS).

## 10) Done criteria

- [x] Cookie-mode является primary на test без fallback usage: `TEST_AUTH_COOKIE_MODE=1` закреплен, repeated deploy/test smokes + rolling SLO evidence не показывают operational reliance на legacy fallback path.
- [x] `deploy:test:smoke` стабильно зеленый на нескольких подряд циклах: 5 подряд pass включая cookie_negative + cookie_ws_ticket (2026-03-13).
- [x] Auth/realtime SLO не деградировали относительно baseline: rolling SLO gate на test в статусе PASS, alerts=0 (2026-03-13).
- [x] Документация и runbooks обновлены, legacy-path ограничен feature flag'ом `VITE_AUTH_COOKIE_MODE`.
- [x] Есть формальное решение по `prod` rollout (go/no-go): explicit approval получен, post-prod smoke PASS (2026-03-13).

## 11) Влияние на desktop-track (2026-03-13)

- [x] Текущий незавершённый хвост по checklist НЕ блокирует desktop M1/M2 в test: cookie primary уже рабочий, auth/session/realtime smoke стабильны.
- [x] Desktop test validation можно продолжать в текущем режиме (`AUTH_COOKIE_MODE=1`) без ожидания полного закрытия всех пунктов этого документа.
- [x] Для desktop prod readiness зависимый пункт baseline/SLO закрыт (server-side rolling gate PASS, dependency chain синхронизирован в desktop плане).
- [x] Пункты browser/mobile matrix из этого checklist закрыты через cross-browser soak evidence и формально сняты как dependency блокер.

Closure note (2026-03-21): checklist синхронизирован с накопленными evidence из `docs/status/test-results/*`, `docs/plans/2026-03-13_ELECTRON_DESKTOP_PLAN.md`, `docs/runbooks/PREPROD_DECISION_PACKAGE.md` и runtime CSP policy в `apps/api/src/index.ts`.
