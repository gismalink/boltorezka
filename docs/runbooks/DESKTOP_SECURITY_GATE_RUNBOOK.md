# Runbook Security Gate для Desktop

Цель: формализованный hard-gate checklist перед продвижением desktop-релиза в `prod`.

## 1) Runtime security baseline

Обязательные параметры Electron window/webPreferences:
- `contextIsolation=true`
- `sandbox=true`
- `nodeIntegration=false`
- `webSecurity=true`

Обязательные navigation controls:
- `setWindowOpenHandler` должен блокировать popup-навигацию и открывать внешние ссылки через системный браузер.
- `will-navigate` и `will-redirect` должны блокировать неразрешенные origin.

## 2) CSP and security headers

В packaged desktop runtime CSP/security headers должны принудительно задаваться через session response headers.

Обязательные заголовки:
- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`

## 3) External resource audit

Разрешенные внешние origin должны быть явными и минимальными:
- `https://fonts.googleapis.com`
- `https://fonts.gstatic.com`
- app API/runtime origin (`https://test.boltorezka.gismalink.art`, `https://boltorezka.gismalink.art`)

В renderer source не должно быть неожиданных сторонних script origin.

## 4) Правила review для preload/IPC (обязательно)

1. Preload должен экспортировать только allowlist API (без raw passthrough `ipcRenderer`).
2. IPC handlers должны быть именованными, типизированными и least-privilege.
3. Секреты/токены не должны попадать в renderer API surface.
4. Любой новый IPC channel требует review-note в PR/feature-log.

## 5) Команды проверки

- `node --check apps/desktop-electron/src/main.cjs`
- `npm --prefix apps/desktop-electron run build:renderer`
- desktop smoke pack в `test` после security-изменений

## 6) Решение по gate

Security gate может быть помечен `PASS` только если пункты 1-5 полностью выполнены и evidence зафиксирован в:
- `docs/status/TEST_RESULTS.md`
