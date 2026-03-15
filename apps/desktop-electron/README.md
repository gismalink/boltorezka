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

Feed URL формируется так:
- `${ELECTRON_UPDATE_FEED_BASE_URL}/${ELECTRON_UPDATE_CHANNEL}/{platform}`
- `platform`: `mac`, `win`, `linux`

Детали rollout/rollback:
- `docs/runbooks/DESKTOP_UPDATE_CHANNELS_RUNBOOK.md`

## Безопасность

- `contextIsolation=true`
- `sandbox=true`
- `nodeIntegration=false`
- внешние ссылки открываются только через `shell.openExternal`
