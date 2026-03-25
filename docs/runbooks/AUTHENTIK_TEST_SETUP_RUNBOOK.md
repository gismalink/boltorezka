# Authentik Setup Runbook (test-first)

Цель: настроить `test` интеграцию Authentik для Boltorezka без затрагивания `prod`.

Важно:
- Только `test` в этом runbook.
- `prod` изменения только после отдельного подтверждения и smoke в `test`.
- Секреты не коммитим (`client_secret`, signing keys, admin tokens).

## 1) Scope и домены

- App (test): `https://test.datowave.com`
- Auth (test): `https://test.auth.datowave.com`
- API SSO start: `GET /v1/auth/sso/start?provider=<google|yandex>&returnUrl=...`
- API SSO logout: `GET /v1/auth/sso/logout?returnUrl=...`

## 2) OIDC URI matrix (v1)

Web (`test`):
- Redirect URI: `https://test.auth.datowave.com/auth/callback`
- Post logout redirect URI: `https://test.datowave.com/`

Desktop (`test`):
- Redirect URI: `boltorezka://auth/callback`
- Post logout redirect URI: `https://test.datowave.com/desktop/logout-complete`

## 3) Authentik clients (draft profile)

Client `boltorezka-web`:
- Type: OpenID Connect
- Grant: Authorization Code + PKCE
- Redirect URI: `https://test.auth.datowave.com/auth/callback`
- Post logout redirect URI: `https://test.datowave.com/`
- Scopes: `openid profile email offline_access`

Client `boltorezka-desktop`:
- Type: OpenID Connect
- Grant: Authorization Code + PKCE
- Redirect URI: `boltorezka://auth/callback`
- Post logout redirect URI: `https://test.datowave.com/desktop/logout-complete`
- Scopes: `openid profile email offline_access`

## 4) Claims mapping contract

Required claims в ID/access token:
- `sub`
- `email`
- `email_verified`
- `preferred_username`
- `name`
- `auth_time`
- `sid`
- `roles` (или эквивалентная custom claim)

Backend mapping expectations:
- `authMode` фиксируется как `sso`
- `sid/authMode/role` продолжают попадать в локальный JWT API
- При отсутствии `roles` применяется default `member` + запись в audit-log

## 5) API/env checklist (test)

На test-окружении проверить:
- `AUTH_MODE=sso`
- `AUTH_SSO_BASE_URL=https://test.auth.datowave.com`
- `ALLOWED_RETURN_HOSTS` содержит `test.datowave.com`
- `AUTH_SESSION_COOKIE_DOMAIN=.test.datowave.com`

## 6) Smoke sequence (test)

1. Redirect contract (`start` + `logout`):
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:sso:routing`

2. Базовый SSO redirect:
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:sso`

3. Session/cookie checks:
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:auth:session`
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:auth:cookie-negative`

4. Realtime auth gates:
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:auth:cookie-ws-ticket`

5. Проверка reset/verify/invite ссылок из реальных test-писем:
- `SMOKE_AUTH_LINK_URLS='<url1>,<url2>' npm run smoke:auth:links`

5a. Быстрый auto precheck без ручного ввода ссылок (synthetic):
- `npm run smoke:auth:links:auto`

6. Postdeploy пакет (если был rollout):
- `SMOKE_API_URL=https://test.datowave.com npm run smoke:test:postdeploy`

## 7) Acceptance criteria (test)

- `smoke:sso:routing` -> PASS (host/path/returnUrl для `start` и `logout` корректны)
- `smoke:sso` -> PASS
- `smoke:auth:session` -> PASS
- `smoke:auth:cookie-negative` -> PASS
- `smoke:auth:cookie-ws-ticket` -> PASS
- `smoke:auth:links` -> PASS (reset/verify/invite ссылки не уходят на legacy host)

## 8) Roll forward to prod (после отдельного подтверждения)

Перед `prod` обязательно:
- Повторить smoke в `test` на актуальном ref.
- Зафиксировать итог в release log.
- Деплой в `prod` только из `main` через GitOps.
