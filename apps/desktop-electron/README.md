# Boltorezka Desktop (Electron)

Desktop оболочка для существующего web-клиента Boltorezka.

## Команды

- `npm run dev` — запускает web dev server и Electron окно.
- `npm run build` — собирает web renderer и desktop app в unpacked режиме.
- `npm run dist` — собирает desktop дистрибутивы.
- `npm run dist:test` — собирает desktop дистрибутивы для `test` update channel.
- `npm run dist:prod` — собирает desktop дистрибутивы для `prod` update channel.

## Update channels (M3)

Поддерживаются каналы обновлений:
- `test`
- `prod`

Runtime env:
- `ELECTRON_UPDATE_CHANNEL` (`test|prod`, default: `test` в dev, `prod` в packaged)
- `ELECTRON_UPDATE_FEED_BASE_URL` (base URL generic update feed)
- `ELECTRON_UPDATE_POLL_INTERVAL_MS` (default: `1200000`)
- `ELECTRON_UPDATE_AUTO_DOWNLOAD` (`1` для автоскачивания, default: `0`)

Safe apply flow:
- Runtime публикует update status в renderer через preload bridge (`desktop:update-status`).
- После `update-downloaded` пользователь получает action `Restart and update`.
- Применение обновления выполняется только по явному действию пользователя (`applyUpdate` -> `quitAndInstall`).

## Signing readiness

Primary path:
- desktop build/publish выполняется на сервере через `scripts/deploy/build-desktop-server-and-publish.sh` (server-first).
- GitHub workflow используется как manual fallback, когда нужен резервный CI-path.

CI workflow `.github/workflows/desktop-artifacts.yml` поддерживает manual signed release-candidate режим:
- inputs: `release_channel=test|prod`, `signed=true`, `create_release_draft=true|false`
- signed build запускает `dist:test` или `dist:prod`
- при `create_release_draft=true` GitHub создаёт draft release и прикладывает собранные артефакты

Необходимые secrets:
- `DESKTOP_CSC_LINK`, `DESKTOP_CSC_KEY_PASSWORD`
- `DESKTOP_APPLE_ID`, `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`, `DESKTOP_APPLE_TEAM_ID`
- `DESKTOP_WIN_CSC_LINK`, `DESKTOP_WIN_CSC_KEY_PASSWORD`

Детали readiness-check:
- `docs/runbooks/DESKTOP_SIGNING_READINESS_RUNBOOK.md`

Feed URL формируется так:
- `${ELECTRON_UPDATE_FEED_BASE_URL}/${ELECTRON_UPDATE_CHANNEL}/{platform}`
- `platform`: `mac`, `win`, `linux`

Updater endpoint requirement:
- Для mac generic provider endpoint `${ELECTRON_UPDATE_FEED_BASE_URL}/${ELECTRON_UPDATE_CHANNEL}/mac/latest-mac.yml` должен возвращать YAML манифест (не SPA HTML fallback).

Детали rollout/rollback:
- `docs/runbooks/DESKTOP_UPDATE_CHANNELS_RUNBOOK.md`

## Безопасность

- `contextIsolation=true`
- `sandbox=true`
- `nodeIntegration=false`
- внешние ссылки открываются только через `shell.openExternal`
