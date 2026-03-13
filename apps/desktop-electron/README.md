# Boltorezka Desktop (Electron)

Desktop оболочка для существующего web-клиента Boltorezka.

## Команды

- `npm run dev` — запускает web dev server и Electron окно.
- `npm run build` — собирает web renderer и desktop app в unpacked режиме.
- `npm run dist` — собирает desktop дистрибутивы.

## Безопасность

- `contextIsolation=true`
- `sandbox=true`
- `nodeIntegration=false`
- внешние ссылки открываются только через `shell.openExternal`
