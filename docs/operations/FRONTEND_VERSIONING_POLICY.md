# Frontend Versioning & Cache Policy

Цель: исключить несовместимости между старым фронтом в браузере пользователя и новым API/WS после деплоя.

## Обязательная политика

1. `index.html` всегда отдаётся с `Cache-Control: no-store`.
2. Hash-ассеты (`/assets/*-<hash>.*`) отдаются как `immutable` (`max-age=31536000`).
3. Каждый deploy в `test/prod` должен передавать build-version фронта как commit SHA.
4. API обязан отдавать текущую серверную версию через `GET /version`.
5. Web-клиент обязан периодически сверять `appBuildSha` и делать `window.location.reload()` при несовпадении.

## Источник версии

- Source of truth: git SHA деплоя (`DEPLOY_SHA`).
- В compose/deploy скриптах он прокидывается в:
  - build arg `VITE_APP_VERSION` (вшивается в web bundle),
  - runtime env `APP_BUILD_SHA` (возвращается API endpoint `/version`).

## Smoke-гейт после rollout

Минимально проверить:

1. `curl https://<env-domain>/version` возвращает `appBuildSha` текущего deploy SHA.
2. Новый инкогнито-клиент получает свежий bundle.
3. Открытая до деплоя вкладка после visibility/poll check перезагружается на новую версию.
