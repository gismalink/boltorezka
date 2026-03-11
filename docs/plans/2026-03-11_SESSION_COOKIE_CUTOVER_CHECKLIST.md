# Session and Cookie Cutover Checklist (2026-03-11)

Цель: безопасно перевести web-auth с bearer в localStorage на HttpOnly cookie как primary режим, без регрессий SSO/realtime и без нарушения текущих GitOps/gate-политик.

Связанные документы:
- `docs/architecture/2026-03-11_ADR_AUTH_SESSION_STORAGE.md`
- `docs/operations/SMOKE_CI_MATRIX.md`
- `docs/reviews/2026-03-11_AUDIT.md`

## 0) Scope and constraints

- [ ] Режим rollout: только `test` до отдельного подтверждения `prod`.
- [ ] Feature branch обязателен, `prod` только через merge в `main`.
- [ ] Для каждого шага есть rollback path и smoke-подтверждение.

## 1) Target security model

- [ ] Access/refresh не читаются из JS в primary режиме.
- [ ] Cookie policy определена: `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`, `Max-Age`.
- [ ] CSRF strategy утверждена (минимум: `SameSite` + state-changing endpoint protection).
- [ ] Session fixation защита проверена (новый sid при login/refresh policy).
- [ ] Logout/revoke инвалидирует server-side session state.
- [ ] Ограничения по CORS + credentialed requests документированы.

## 2) API and auth backend changes

- [ ] Единый session contract для login/refresh/logout/revoke зафиксирован.
- [ ] Cookie issuance реализована в auth endpoints.
- [ ] Refresh rotation и replay-protection подтверждены.
- [ ] TTL/expiry policy согласована (access vs refresh vs ws-ticket).
- [ ] Error taxonomy не ломает текущий API/WS contract.
- [ ] Rate limits для auth/session endpoints подтверждены.

## 3) Web client cutover

- [ ] Auth bootstrap переведен на cookie flow (без localStorage как primary).
- [ ] Все auth-запросы используют `credentials` policy, совместимую с cookie-mode.
- [ ] Legacy bearer path оставлен только как временный fallback (feature flag).
- [ ] UI/UX сценарии login/logout/session-expired не деградировали.
- [ ] Авто-восстановление сессии после refresh работает в cookie-mode.

## 4) Realtime and ws-ticket compatibility

- [ ] `POST /v1/auth/ws-ticket` стабильно работает в cookie-mode.
- [ ] WS connect/reconnect не имеет регрессий по auth ошибкам.
- [ ] `ChannelSessionMoved` semantics остаются предсказуемыми.
- [ ] Call signaling idempotency и guardrails не деградируют после cutover.

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
- [ ] Добавить cookie-mode integration smoke (login -> refresh -> logout -> revoked).
- [ ] Добавить negative smoke (expired cookie, rotated refresh replay, invalid domain/path).
- [ ] Добавить regression smoke для ws-ticket и realtime reconnect в cookie-mode.
- [ ] `deploy:test:smoke` проходит стабильно с cookie-mode flag включенным.

## 8) Rollout plan

### Phase A - Preparation (test only)
- [ ] Ввести feature flag `AUTH_COOKIE_MODE` (или эквивалент) в test.
- [ ] Включить dual-path (cookie primary + bearer fallback) на ограниченный период.
- [ ] Зафиксировать baseline метрики до включения cookie-mode.

### Phase B - Cookie primary on test
- [ ] Включить cookie primary на test.
- [ ] Прогнать минимум 3 подряд успешных `deploy:test:smoke`.
- [ ] Пройти ручной сценарий SSO callback + realtime join/reconnect.
- [ ] Подтвердить отсутствие роста auth/reconnect error-rate.

### Phase C - Legacy cleanup readiness
- [ ] Зафиксировать, что fallback bearer path не используется в test.
- [ ] Удалить/ограничить legacy bearer bootstrap в web.
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

- [ ] Cookie-mode является primary на test без fallback usage.
- [ ] `deploy:test:smoke` стабильно зеленый на нескольких подряд циклах.
- [ ] Auth/realtime SLO не деградировали относительно baseline.
- [ ] Документация и runbooks обновлены, legacy-path ограничен или удален.
- [ ] Есть формальное решение по `prod` rollout (go/no-go).
