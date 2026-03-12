# Session and Cookie Cutover Checklist (2026-03-11)

Цель: безопасно перевести web-auth с bearer в localStorage на HttpOnly cookie как primary режим, без регрессий SSO/realtime и без нарушения текущих GitOps/gate-политик.

Связанные документы:
- `docs/architecture/2026-03-11_ADR_AUTH_SESSION_STORAGE.md`
- `docs/operations/SMOKE_CI_MATRIX.md`
- `docs/reviews/2026-03-11_AUDIT.md`

## 0) Scope and constraints

- [x] Режим rollout: только `test` до отдельного подтверждения `prod` — соблюдается.
- [x] Feature branch обязателен, `prod` только через merge в `main` — ветка `feature/session-cookie-hardening`, в `prod` не выкатывалось.
- [ ] Для каждого шага есть rollback path и smoke-подтверждение (rollback не задокументирован формально, см. §9).

## 1) Target security model

- [ ] Access/refresh не читаются из JS в primary режиме — **частично**: cookie HttpOnly, но `bootstrapSessionState` всё ещё пишет JWT в `localStorage` после получения через `authRefresh`. Требует Phase C (удаление localStorage-path).
- [x] Cookie policy определена: `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain`, `Path=/`, `Max-Age=2592000` — всё в `config.ts` + `buildSessionCookieValue()`.
- [x] CSRF strategy — `SameSite=Lax` реализован; state-changing endpoints защищены requireAuth. Для текущей модели (SSO-only, нет form-submit с внешних доменов) достаточно.
- [x] Session fixation защита: при каждом `/v1/auth/refresh` создаётся новый `sessionId`, старый удаляется из Redis — подтверждено smoke:auth:session (stale token → 401).
- [x] Logout/revoke инвалидирует server-side session state: `authController.logout()` теперь async, вызывает `POST /v1/auth/logout` (deletes Redis session + clears HttpOnly cookie) до SSO redirect (2026-03-13, SHA 1fa21f6). Ручное подтверждение — 3 аккаунта, logout с первого раза, "духов" в комнате нет.
- [ ] Ограничения по CORS + credentialed requests документированы.

## 2) API and auth backend changes

- [ ] Единый session contract для login/refresh/logout/revoke зафиксирован (implicit в коде, формального doc нет).
- [x] Cookie issuance реализована в auth endpoints (`/sso/session`, `/refresh`, `/logout` — `buildSessionCookieValue/Clear`).
- [x] Refresh rotation и replay-protection подтверждены: `smoke:auth:cookie-negative` (replay → 401), `smoke:auth:session` (stale-after-rotation → 401) — 2026-03-13.
- [x] TTL/expiry policy: access-token через `jwtExpiresIn`, cookie `Max-Age=2592000` (30д), ws-ticket `expiresInSec=45` — все зафиксированы в config.
- [ ] Error taxonomy не ломает текущий API/WS contract.
- [ ] Rate limits для auth/session endpoints подтверждены.

## 3) Web client cutover

- [ ] Auth bootstrap переведен на cookie flow без localStorage как primary — **частично**: `bootstrapCookieSessionState` теперь вызывает `api.authRefresh("")` (получает JWT через cookie), но затем `bootstrapSessionState(jwt)` записывает JWT в `localStorage`. Полное удаление localStorage-path — Phase C.
- [x] Все auth-запросы используют `credentials` policy, совместимую с cookie-mode.
- [x] Legacy bearer path оставлен только как временный fallback (feature flag `AUTH_COOKIE_MODE`).
- [x] UI/UX сценарии login/logout не деградировали: ручной прогон выполнен (2026-03-13) — 3 аккаунта, login/logout с первого раза, presence "духов" в комнате отсутствуют. session-expired не тестировался отдельно.
- [x] Авто-восстановление сессии после page reload работает в cookie-mode: `bootstrapCookieSessionState` → `authRefresh("")` → `setToken(jwt)` → все `!token`-гарды работают корректно (2026-03-13, fix SHA f959899).

## 4) Realtime and ws-ticket compatibility

- [x] `GET /v1/auth/ws-ticket` стабильно работает в cookie-mode: `smoke:auth:cookie-ws-ticket` — cookie-only запрос возвращает валидный тикет, no-auth/invalid-cookie → 401 (2026-03-13).
- [x] WS connect/reconnect без регрессий: `smoke:realtime` с `SMOKE_RECONNECT=1` проходит стабильно при каждом deploy:test:smoke с cookie-mode=1.
- [ ] `ChannelSessionMoved` semantics остаются предсказуемыми (нет отдельного теста).
- [x] Call signaling idempotency и guardrails: `smoke:realtime` с `SMOKE_CALL_SIGNAL=1` проходит стабильно.

## 5) Cross-domain and environment matrix

- [ ] Test-domain matrix проверен: app domain, auth domain, callback domain.
- [ ] Cookie `Domain/Path/SameSite` валидированы для test SSO callback flow.
- [ ] HTTPS-only behavior (`Secure`) подтвержден на test.
- [ ] Browser matrix: Chrome/Safari/Firefox (минимум smoke-login/logout).
- [ ] Mobile web behavior (iOS/macOS Safari) проверен отдельным smoke-pass.

## 6) Security hardening bundle (related)

- [ ] CSP обновлен под cookie-mode и проверен без false-positive breakage.
- [ ] Убраны лишние места хранения auth-состояния в localStorage/sessionStorage.
- [ ] Structured logs содержат `requestId/userId/sessionId` для auth-flow.
- [ ] Audit trail на login/refresh/logout/revoke достаточен для расследований.

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
- [ ] Зафиксировать baseline метрики до включения cookie-mode.

Progress note (2026-03-12): backend реализует `AUTH_COOKIE_MODE` с HttpOnly session-cookie issuance/clear на `sso/session|refresh|logout`; `requireAuth` поддерживает cookie token + bearer fallback. Test deploy с `AUTH_COOKIE_MODE=1` выполнен, `deploy:test:smoke` прошел (pass #1).

Progress note (2026-03-13): `TEST_AUTH_COOKIE_MODE=1` зафиксирован в `infra/.env.host` на сервере (постоянно). `smoke:auth:cookie-negative` и `smoke:auth:cookie-ws-ticket` интегрированы в postdeploy-smoke-test.sh и запускаются автоматически при каждом deploy:test:smoke.

### Phase B - Cookie primary on test
- [x] Включить cookie primary на test (feature/session-cookie-hardening + `AUTH_COOKIE_MODE=1`).
- [x] `TEST_AUTH_COOKIE_MODE=1` постоянно зафиксирован в `infra/.env.host` на сервере (2026-03-13).
- [x] Прогнать минимум 3 подряд успешных `deploy:test:smoke` — выполнено: pass #1/#2/#3 (2026-03-12/13), pass #4/#5 с новыми cookie smokes (2026-03-13, SHA 7b9e7fe, `cookie_negative=pass cookie_ws_ticket=pass`) ✅.
- [x] Пройти ручной сценарий SSO callback + realtime join/reconnect: выполнен 2026-03-13 — 3 аккаунта, SSO login/logout с первого раза, presence корректна (нет "духов" после logout).
- [ ] Подтвердить отсутствие роста auth/reconnect error-rate (не проверен).

### Phase C - Legacy cleanup readiness
- [ ] Зафиксировать, что fallback bearer path не используется в test (нужен metrics/log-based check или VITE_AUTH_PRIMARY_MODE=cookie).
- [ ] Удалить/ограничить legacy bearer bootstrap в web (отдельное решение: true cookie-primary vs cookie-as-fallback).
- [ ] Обновить runbooks/ADR/status docs по финальному режиму.

### Phase D - Prod readiness gate
- [ ] Подготовить отдельный preprod decision package для cookie cutover.
- [ ] Получить явное подтверждение перед `prod` rollout.
- [ ] Выполнить post-prod smoke и мониторинг окна стабилизации.

## 9) Rollback checklist

- [ ] Флаговый rollback в bearer primary задокументирован и протестирован.
- [ ] Rollback не ломает active sessions и logout semantics.
- [ ] Rollback smoke: auth/session/realtime проходят в течение одного цикла.

## 10) Done criteria

- [ ] Cookie-mode является primary на test без fallback usage (`localStorage` как side-effect ещё присутствует — Phase C).
- [x] `deploy:test:smoke` стабильно зеленый на нескольких подряд циклах: 5 подряд pass включая cookie_negative + cookie_ws_ticket (2026-03-13).
- [ ] Auth/realtime SLO не деградировали относительно baseline (baseline не зафиксирован).
- [ ] Документация и runbooks обновлены, legacy-path ограничен или удален.
- [ ] Есть формальное решение по `prod` rollout (go/no-go).
