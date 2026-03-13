# Electron Desktop Plan (2026-03-13)

Цель: выпустить desktop-версию Boltorezka с максимальным переиспользованием текущего web-клиента, без регрессий в realtime/voice/video и с соблюдением текущего GitOps-процесса (feature -> test -> smoke -> main -> prod).

## 0) Decision summary

- [x] Базовая платформа для v1: Electron.
- [x] Подход: тонкая desktop-оболочка вокруг текущего React/Vite renderer.
- [x] Принцип: доменная логика остается в web-части; main/preload только для desktop-интеграций.
- [x] Rollout policy: test-first, prod только после test smoke и явного подтверждения.

## 1) Scope v1

In scope (MVP):
- [ ] Запуск Boltorezka как standalone desktop app (macOS + Windows).
- [ ] Auth flow (SSO/login/logout) без деградации текущего web-поведения.
- [ ] Voice/video/screen share в parity с web.
- [ ] Выбор input/output устройств, mute/unmute, reconnect behavior.
- [ ] Автообновления desktop-клиента (test/prod каналы).
- [ ] Базовые crash/log артефакты для диагностики.

Out of scope (v1.1+):
- [ ] Tray-first UX и background call mode.
- [ ] Offline mode.
- [ ] Linux release как production target.
- [ ] Расширенные deep-link сценарии и rich notifications.

## 2) Архитектурный профиль

Renderer (существующий web app):
- [x] Переиспользуется без форка бизнес-логики.
- [x] Runtime env для desktop отделен от web env (префикс `DESKTOP_`/`ELECTRON_`).

Main process:
- [x] Управление окном, lifecycle, single-instance lock.
- [ ] Auto-update orchestration.
- [x] Без прямой доменной логики и без доступа renderer к Node API.

Preload bridge:
- [x] Строгий allowlist IPC API.
- [x] Typed contract между renderer и main.
- [x] Без передачи секретов в renderer.

Security defaults:
- [x] `contextIsolation=true`.
- [x] `sandbox=true`.
- [x] `nodeIntegration=false`.
- [x] Навигация/внешние ссылки ограничены и контролируются.

## 3) Milestones и deliverables

### M1 - Foundation (каркас)
- [x] Создан пакет `apps/desktop-electron`.
- [x] Dev режим: окно грузит локальный web dev server.
- [x] Prod режим: окно грузит собранный web dist.
- [x] Базовый packaging для macOS test build.

Definition of done:
- [x] Приложение стартует локально и в packaged режиме.
- [x] Нет критичных security warnings в конфиге Electron.

### M2 - RTC/media parity
- [ ] Voice connect/disconnect parity с web.
- [ ] Device switch (input/output) работает стабильно.
- [ ] Camera + screen share работают в desktop.
- [ ] Long-session stability (минимум 2 часа) без критичных деградаций.

Definition of done:
- [ ] Пройден desktop smoke сценарий для RTC.
- [ ] Нет блокирующих regressions относительно web baseline.

### M3 - Update/release channel
- [ ] Настроены каналы auto-update: test и prod.
- [ ] Реализован безопасный update flow с rollback-процедурой.
- [ ] Сборки подписываются (где применимо).

Definition of done:
- [ ] Обновление test->test проходит автоматически.
- [ ] Rollback runbook проверен на test.

### M4 - Prod readiness
- [ ] Пройден pre-prod checklist.
- [ ] Подтверждены smoke + ручной critical path на test.
- [ ] Выполнен controlled rollout в prod.

Definition of done:
- [ ] Первый production desktop release доступен целевой аудитории.
- [ ] Подготовлены on-call инструкции и triage flow.

## 4) Execution checklist (по потокам)

### 4.1 Repository and build
- [x] Добавить `apps/desktop-electron/package.json` + build scripts.
- [x] Добавить корневые команды (например `desktop:dev`, `desktop:build`).
- [ ] Настроить единый app version/build SHA для renderer + desktop package.
- [ ] Добавить CI jobs для desktop artifacts.

### 4.2 Electron security
- [x] Ввести preload-only bridge.
- [x] Запретить произвольные `window.open`/navigation.
- [ ] Включить CSP и аудит внешних ресурсов.
- [x] Проверить, что renderer не получает прямой доступ к fs/process/env.

### 4.3 RTC validation
- [ ] Проверить media permissions на macOS и Windows.
- [ ] Проверить reconnect при network flap.
- [ ] Проверить поведение после sleep/wake ноутбука.
- [ ] Проверить длительную сессию + переключения девайсов.

### 4.4 Auto-update
- [ ] Выбрать release feed и схему каналов.
- [ ] Настроить update policy (silent/download-only/prompt).
- [ ] Реализовать безопасное применение обновления.
- [ ] Зафиксировать rollback шаги в runbook.

### 4.5 Observability
- [x] Добавить desktop telemetry labels (platform, app channel, app version).
- [ ] Добавить сбор crash/report артефактов.
- [ ] Обновить дашборд/логи для desktop-сессий.

## 5) QA matrix и smoke

Минимальная матрица v1:
- [ ] macOS (Intel/Apple Silicon): login, voice, camera, screen share, reconnect.
- [ ] Windows 10/11: login, voice, camera, screen share, reconnect.

Desktop smoke (must pass):
- [ ] Startup + auth flow.
- [ ] Join room + voice handshake.
- [ ] Mute/unmute + input/output switch.
- [ ] Screen share start/stop.
- [ ] Forced app update path (version mismatch) и корректный recovery.

## 6) GitOps rollout policy (desktop)

- [ ] Все задачи делаются в feature-ветках.
- [ ] В test деплоится конкретная feature/main ветка, только через scripted flow.
- [ ] Перед prod desktop-release: merge в main -> test gate -> smoke -> явное подтверждение -> prod.
- [ ] Без ручных правок на сервере, только через git + GitOps.

## 7) Риски и mitigation

Риск: расхождение web и desktop поведения media APIs.
- Mitigation:
- [ ] Ранний cross-platform soak на M2.
- [ ] Desktop-specific telemetry и быстрый rollback channel.

Риск: сложность code signing/notarization и задержка релиза.
- Mitigation:
- [ ] Вынести signing pipeline в отдельный milestone.
- [ ] Иметь test channel без blocking прод-пайплайна.

Риск: регрессии безопасности из-за неверной Electron-конфигурации.
- Mitigation:
- [ ] Security checklist как hard gate до prod.
- [ ] Code review правил preload/IPC и запрет broad bridge API.

Риск: незакрытые пункты session/cookie hardening могут всплыть в desktop prod stage.
- Mitigation:
- [x] Для M1/M2 test validation использовать текущий cookie primary режим (`AUTH_COOKIE_MODE=1`) как базовый, без блокировки desktop разработки.
- [x] До desktop prod readiness закрыть auth/session hardening пункты класса P1: SLO/baseline мониторинг (rolling gate PASS, 2026-03-13).
- [ ] Держать desktop release gate зависимым от актуального статуса `docs/plans/2026-03-11_SESSION_COOKIE_CUTOVER_CHECKLIST.md`.

## 8) Примерная оценка сроков

- [ ] M1 Foundation: 2-3 рабочих дня.
- [ ] M2 RTC/media parity: 3-5 рабочих дней.
- [ ] M3 Update/release: 2-3 рабочих дня.
- [ ] M4 Prod readiness: 2-3 рабочих дня.

Итого ориентир для первого production-ready релиза: 2-4 недели (в зависимости от signing/update и объема cross-platform QA).

## 9) Следующие шаги (next action)

- [x] Создать feature-ветку `feature/electron-desktop-foundation`.
- [x] Добавить каркас `apps/desktop-electron` и базовые команды запуска/сборки.
- [x] Подготовить отдельный desktop smoke checklist документ (test gate).
- [x] После M1 выполнить первый test rollout и зафиксировать результаты в `docs/status`.

## 10) Progress notes

Progress note (2026-03-13, M1 foundation):
- Desktop shell scaffold внедрен: `apps/desktop-electron` (`main.cjs`, `preload.cjs`, packaging config, root scripts `desktop:*`).
- Добавлен typed bridge в web renderer (`apps/web/src/desktopBridge.ts`, runtime markers в `main.tsx`).
- Добавлен desktop smoke script: `npm run desktop:smoke` (`scripts/smoke/smoke-desktop-foundation.sh`).
- Первый test rollout ветки `feature/electron-desktop-foundation` прошел (`deploy:test:smoke` PASS, SHA `524583dc041c3f9a12cf3d748c7d264cb90e2c11`).

Progress note (2026-03-13, M2 observability start):
- В `trackClientEvent` добавлены runtime labels для desktop/web (`runtime`, `platform`, `electronVersion`) для всех client telemetry событий.

Progress note (2026-03-13, M2 validation start):
- Добавлен desktop runtime smoke (`scripts/smoke/smoke-desktop-runtime.mjs`) с запуском Electron shell через Playwright и проверкой runtime markers (`runtime=desktop`, `platform`, `electronVersion`).

Progress note (2026-03-13, M2 reconnect start):
- Добавлен desktop reconnect smoke (`scripts/smoke/smoke-desktop-reconnect.mjs`) с симуляцией network flap (`setOffline`) и последующим reload/проверкой runtime markers.

Progress note (2026-03-13, M2 telemetry sanity):
- Добавлен desktop telemetry smoke (`scripts/smoke/smoke-desktop-telemetry.mjs`) с проверкой `desktop_smoke_probe` payload (`meta.runtime=desktop`, `meta.platform`, `meta.electronVersion`).

Progress note (2026-03-13, M2 validation checkpoint):
- Пройден полный M2 smoke automation цикл на test (`desktop:smoke:m2`): foundation/runtime/reconnect/telemetry — PASS.
- Результат зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #17, `origin/feature/electron-desktop-foundation`, SHA `704b7df`).

Progress note (2026-03-13, auth hardening dependency):
- P1 пункты `rate limits` и `structured auth logs/audit trail` закрыты.
- `SLO/baseline` evidence закрыт server-side прогоном `~/srv/boltorezka/scripts/ops/scheduler/run-job.sh slo-rolling-gate`: `SLO_ROLLING_STATUS=pass`, `SLO_ROLLING_ALERT_COUNT=0` (2026-03-13T17:52:39Z).
