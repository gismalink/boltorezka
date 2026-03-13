# Electron Desktop Smoke Checklist (2026-03-13)

Цель: минимальный обязательный smoke для desktop foundation и pre-test gate в ветке desktop задач.

## 1) Foundation smoke (обязательный)

- [ ] Сборка desktop foundation проходит:
  - `npm run desktop:smoke`
- [ ] Runtime desktop smoke проходит:
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:runtime`
- [ ] Telemetry desktop smoke проходит:
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:telemetry`
- [ ] Есть собранный desktop артефакт в `apps/desktop-electron/dist`.
- [ ] Web renderer собирается и вшивается в desktop package.

## 2) Runtime smoke (manual, test env)

- [ ] Приложение стартует и показывает UI Boltorezka.
- [ ] Авторизация открывается штатно (SSO redirect без ошибок).
- [ ] Подключение к комнате выполняется.
- [ ] Микрофон mute/unmute работает.
- [ ] Screen share start/stop работает.

## 3) Reconnect and stability smoke

- [ ] Кратковременный network flap: reconnect восстанавливается.
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:reconnect`
- [ ] Sleep/wake ноутбука: сессия восстанавливается без crash.
- [ ] 30+ минут voice-сессии без критичных runtime errors.

## 4) Security smoke

- [ ] Renderer не имеет доступа к Node API (`nodeIntegration=false`).
- [ ] `contextIsolation=true`, `sandbox=true`.
- [ ] Внешние ссылки открываются во внешнем браузере, не внутри app window.

## 5) Release gate policy

- [ ] Все desktop изменения идут через feature branch.
- [ ] Перед merge в `main`: foundation smoke + runtime smoke на test.
- [ ] Перед `prod`: merge в `main` -> test gate -> smoke -> явное подтверждение.
