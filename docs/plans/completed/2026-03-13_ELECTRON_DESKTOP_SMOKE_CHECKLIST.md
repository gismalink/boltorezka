# Electron Desktop Smoke Checklist (2026-03-13)

Цель: минимальный обязательный smoke для desktop foundation и pre-test gate в ветке desktop задач.

## 1) Foundation smoke (обязательный)

- [x] Сборка desktop foundation проходит:
  - `npm run desktop:smoke`
- [x] Runtime desktop smoke проходит:
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:runtime`
- [x] Telemetry desktop smoke проходит:
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:telemetry`
- [x] Есть собранный desktop артефакт в `apps/desktop-electron/dist`.
- [x] Web renderer собирается и вшивается в desktop package.

## 2) Runtime smoke (manual, test env)

- [x] Приложение стартует и показывает UI Datowave.
- [x] Авторизация открывается штатно (SSO redirect без ошибок).
- [x] Подключение к комнате выполняется.
- [x] Микрофон mute/unmute работает.
- [x] Screen share start/stop работает.

## 3) Reconnect and stability smoke

- [x] Кратковременный network flap: reconnect восстанавливается.
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:reconnect`
- [x] Reconnect soak automation (несколько циклов подряд) проходит.
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com SMOKE_DESKTOP_SOAK_CYCLES=8 npm run smoke:desktop:soak`
- [x] Sleep/wake ноутбука: сессия восстанавливается без crash.
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1 npm run smoke:desktop:sleep-wake`
- [x] 15+ минут voice-сессии без критичных runtime errors.
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:voice-checkpoint:15m`
- [x] 2h long-run stability soak (standalone packaged desktop gate) — закрыт practical evidence циклом `>=3h` на standalone test build (Cycle #57/#59, PASS).
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com SMOKE_DESKTOP_STABILITY_DURATION_MS=7200000 npm run smoke:desktop:stability`
  - Policy: выполняется только на этапе standalone packaged client (post-signing/notarization).

## 4) Security smoke

- [x] Renderer не имеет доступа к Node API (`nodeIntegration=false`).
- [x] `contextIsolation=true`, `sandbox=true`.
- [x] Внешние ссылки открываются во внешнем браузере, не внутри app window.
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:security`

## 5) Release gate policy

- [x] Все desktop изменения идут через feature branch.
- [x] Перед merge в `main`: foundation smoke + runtime smoke на test.
- [x] Перед `prod`: merge в `main` -> test gate -> smoke -> явное подтверждение.

## 6) Progress note (2026-03-13)

- [x] M2 smoke automation slice закрыт на test: `desktop:smoke`, `smoke:desktop:runtime`, `smoke:desktop:reconnect`, `smoke:desktop:telemetry` — PASS.
- [x] Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #17, SHA `704b7df`).
- [x] Full chain с soak (`desktop:smoke:m2:soak`) прошел на test, evidence: `docs/status/TEST_RESULTS.md` (Cycle #20).
- [x] Security baseline smoke (`smoke:desktop:security`) и полный chain (`desktop:smoke:m2:secure`) прошли на test, evidence: `docs/status/TEST_RESULTS.md` (Cycle #21).
- [x] Diagnostics artifact smoke (`smoke:desktop:diagnostics`) и полный chain (`desktop:smoke:m2:secure:diag`) прошли на test, evidence: `docs/status/TEST_RESULTS.md` (Cycle #22).
- [x] Sleep/wake assist automation added: `smoke:desktop:sleep-wake` + runbook `docs/runbooks/DESKTOP_SLEEP_WAKE_RUNBOOK.md` (strict evidence run pending).
- [x] Strict sleep/wake evidence run прошел (`suspendObserved=true`, `windowRecoveryMode=manual-confirmed`), evidence: `docs/status/TEST_RESULTS.md` (Cycle #24).
- [x] Stability soak automation added: `smoke:desktop:stability` + aggregate command `desktop:smoke:m2:stability` (30m evidence run pending).
- [x] Stability warm-up run прошел (`durationMs=30000`, `probes=3`), evidence: `docs/status/TEST_RESULTS.md` (Cycle #25).
- [x] 30-минутный runtime stability soak прошел (`durationMs=1800000`, `probes=60`), evidence: `docs/status/TEST_RESULTS.md` (Cycle #26).
- [x] Voice-session specific 15m checkpoint прошел, evidence: `docs/status/TEST_RESULTS.md` (Cycle #31).
- [x] Media controls smoke (mic/audio/device menus) прошел, evidence: `docs/status/TEST_RESULTS.md` (Cycle #35).
- [x] Test rollout после rollback desktop permissions прошел, manual подтверждение screen share/devices, evidence: `docs/status/TEST_RESULTS.md` (Cycle #37).
- [x] Forced app update path (version mismatch -> recovery) проверен автоматизированным smoke, evidence: `docs/status/TEST_RESULTS.md` (Cycle #38).
- [x] Зафиксирована practical stability policy в runbook (`15-30m` per iteration, `2h` только на standalone release gate).
- [x] Runtime manual smoke и release gate policy синхронизированы с актуальным evidence (Cycles #59, #50, #51).
