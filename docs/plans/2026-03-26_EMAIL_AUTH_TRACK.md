# План: Email Auth Track (отложенный)
Date: 2026-03-26
Scope: отдельный трек по email auth/register/reset/verify и почтовому контуру. Не блокирует текущий OAuth-only domain cutover.

## 0) Контекст

Этот план вынесен из `docs/plans/completed/2026-03-22_DOMAIN_CUTOVER_PLAN.md`.
Текущий cutover идет по OAuth-only модели (Google/Yandex).

## 1) Цели

- Поднять полноценный email auth-flow (register/login/reset/verify) как отдельную фичу.
- Добавить необходимый UI и устойчивый почтовый контур.
- Включить только после e2e проверки реальных писем в `test`.

## 2) Workstreams

### 2.1 IdP/Auth backend

- [ ] Развернуть полноценный Authentik в `test` (GitOps).
- [ ] Отдельный compose/service для Authentik + Postgres + Redis (если требуется).
- [ ] Секреты (`client_secret`, signing key, session secret) в server env, без коммита.
- [ ] Health-check, restart policy, backup/restore и rollback runbook.

### 2.2 OIDC clients + claims

- [ ] Создать clients: `boltorezka-web`, `boltorezka-desktop`.
- [ ] Проверить claims: `sub`, `email`, `email_verified`, `preferred_username`, `name`, `auth_time`, `sid`, `roles`.
- [ ] Проверить mapping роли по умолчанию и audit-log.

### 2.3 UI для email auth

- [ ] Экран/entrypoint для `forgot/reset password`.
- [ ] Экран/entrypoint для `verify email` (включая resend).
- [ ] Экран/entrypoint для invite acceptance (если flow invite-first).
- [ ] User-facing ошибки: expired/invalid token, already used link, provider unavailable.

### 2.4 Почтовый контур

- [ ] Выбрать и подключить SMTP/provider для `test` (`SMTP_HOST/PORT/USER/PASS`, sender).
- [ ] Настроить шаблоны verify/reset/invite с новыми доменами.
- [ ] Включить mailbox/catcher для автоматических smoke в `test`.
- [ ] Зафиксировать SPF/DKIM/DMARC требования и статус.

### 2.5 E2E smoke (обязательный gate)

- [ ] `register/login` -> `Complete SSO Session` -> `auth/me` -> `refresh/logout` PASS.
- [ ] `forgot password` -> письмо -> реальная ссылка -> смена пароля PASS.
- [ ] `verify email` -> письмо -> реальная ссылка -> account status updated PASS.
- [ ] `invite` -> письмо -> реальная ссылка -> join/access PASS.
- [ ] `smoke:auth:links` используется как дополнительный guard и не заменяет e2e по реальным письмам.

## 3) Критерий включения в основной поток

- [ ] Все пункты 2.1-2.5 закрыты в `test`.
- [ ] Только после этого принимается решение о rollout в `prod`.

## 4) Связанные документы

- Основной domain cutover план: `docs/plans/completed/2026-03-22_DOMAIN_CUTOVER_PLAN.md`
- Authentik runbook: `docs/runbooks/AUTHENTIK_TEST_SETUP_RUNBOOK.md`
