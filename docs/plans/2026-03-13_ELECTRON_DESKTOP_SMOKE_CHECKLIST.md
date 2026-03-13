# Electron Desktop Smoke Checklist (2026-03-13)

Цель: минимальный обязательный smoke для desktop foundation и pre-test gate в ветке desktop задач.

## 1) Foundation smoke (обязательный)

- [x] Сборка desktop foundation проходит:
  - `npm run desktop:smoke`
- [x] Runtime desktop smoke проходит:
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:runtime`
- [x] Telemetry desktop smoke проходит:
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:telemetry`
- [x] Есть собранный desktop артефакт в `apps/desktop-electron/dist`.
- [x] Web renderer собирается и вшивается в desktop package.

## 2) Runtime smoke (manual, test env)

- [ ] Приложение стартует и показывает UI Boltorezka.
- [ ] Авторизация открывается штатно (SSO redirect без ошибок).
- [ ] Подключение к комнате выполняется.
- [ ] Микрофон mute/unmute работает.
- [ ] Screen share start/stop работает.

## 3) Reconnect and stability smoke

- [x] Кратковременный network flap: reconnect восстанавливается.
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:reconnect`
- [x] Reconnect soak automation (несколько циклов подряд) проходит.
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=8 npm run smoke:desktop:soak`
- [ ] Sleep/wake ноутбука: сессия восстанавливается без crash.
- [ ] 30+ минут voice-сессии без критичных runtime errors.

## 4) Security smoke

- [x] Renderer не имеет доступа к Node API (`nodeIntegration=false`).
- [x] `contextIsolation=true`, `sandbox=true`.
- [x] Внешние ссылки открываются во внешнем браузере, не внутри app window.
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:security`

## 5) Release gate policy

- [x] Все desktop изменения идут через feature branch.
- [ ] Перед merge в `main`: foundation smoke + runtime smoke на test.
- [ ] Перед `prod`: merge в `main` -> test gate -> smoke -> явное подтверждение.

## 6) Progress note (2026-03-13)

- [x] M2 smoke automation slice закрыт на test: `desktop:smoke`, `smoke:desktop:runtime`, `smoke:desktop:reconnect`, `smoke:desktop:telemetry` — PASS.
- [x] Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #17, SHA `704b7df`).
- [x] Full chain с soak (`desktop:smoke:m2:soak`) прошел на test, evidence: `docs/status/TEST_RESULTS.md` (Cycle #20).
- [x] Security baseline smoke (`smoke:desktop:security`) и полный chain (`desktop:smoke:m2:secure`) прошли на test, evidence: `docs/status/TEST_RESULTS.md` (Cycle #21).
- [x] Diagnostics artifact smoke (`smoke:desktop:diagnostics`) и полный chain (`desktop:smoke:m2:secure:diag`) прошли на test, evidence: `docs/status/TEST_RESULTS.md` (Cycle #22).
