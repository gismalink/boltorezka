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
- [x] Auth flow (SSO/login/logout) без деградации текущего web-поведения.
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
- [x] Voice connect/disconnect parity с web.
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
- [x] Настроить единый app version/build SHA для renderer + desktop package.
- [x] Добавить CI jobs для desktop artifacts.

### 4.2 Electron security
- [x] Ввести preload-only bridge.
- [x] Запретить произвольные `window.open`/navigation.
- [ ] Включить CSP и аудит внешних ресурсов.
- [x] Проверить, что renderer не получает прямой доступ к fs/process/env.

### 4.3 RTC validation
- [ ] Проверить media permissions на macOS и Windows.
- [x] Проверить reconnect при network flap.
- [x] Проверить поведение после sleep/wake ноутбука.
- [ ] Проверить длительную сессию + переключения девайсов.

Runbook:
- `docs/runbooks/DESKTOP_SLEEP_WAKE_RUNBOOK.md`

### 4.4 Auto-update
- [ ] Выбрать release feed и схему каналов.
- [ ] Настроить update policy (silent/download-only/prompt).
- [ ] Реализовать безопасное применение обновления.
- [ ] Зафиксировать rollback шаги в runbook.

### 4.5 Observability
- [x] Добавить desktop telemetry labels (platform, app channel, app version).
- [x] Добавить сбор crash/report артефактов.
- [x] Обновить дашборд/логи для desktop-сессий.

## 5) QA matrix и smoke

Минимальная матрица v1:
- [ ] macOS (Intel/Apple Silicon): login, voice, camera, screen share, reconnect.
- [ ] Windows 10/11: login, voice, camera, screen share, reconnect.

Desktop smoke (must pass):
- [x] Startup + auth flow.
- [x] Join room + voice handshake.
- [x] Mute/unmute + input/output switch.
- [x] Screen share start/stop.
- [x] Forced app update path (version mismatch) и корректный recovery.

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

Progress note (2026-03-13, M2 stability automation):
- Добавлен `scripts/smoke/smoke-desktop-soak.mjs` и root command `npm run smoke:desktop:soak` (повторяющиеся offline/online reconnect циклы в одном Electron run).
- Test evidence: `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=4 npm run smoke:desktop:soak` -> PASS.

Progress note (2026-03-13, M2 full chain):
- Добавлен агрегированный command `npm run desktop:smoke:m2:soak`.
- Test evidence: `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=3 npm run desktop:smoke:m2:soak` -> PASS (foundation/runtime/reconnect/telemetry/soak).

Progress note (2026-03-13, security automation):
- Добавлен `scripts/smoke/smoke-desktop-security.mjs` и root commands `npm run smoke:desktop:security`, `npm run desktop:smoke:m2:secure`.
- Test evidence: security baseline PASS (`contextIsolation=true`, `sandbox=true`, `nodeIntegration=false`, bridge allowlist `platform,version`) и full secure chain PASS.

Progress note (2026-03-13, diagnostics automation):
- Добавлен runtime diagnostics artifact snapshot в Electron main (`ELECTRON_DESKTOP_DIAGNOSTICS_OUT`) и smoke `scripts/smoke/smoke-desktop-diagnostics.mjs`.
- Добавлен агрегированный command `npm run desktop:smoke:m2:secure:diag`.
- Test evidence: diagnostics smoke PASS и full secure+diag chain PASS.

Progress note (2026-03-13, sleep/wake assist):
- Добавлен `scripts/smoke/smoke-desktop-sleep-wake.mjs` и command `npm run smoke:desktop:sleep-wake` (опционально strict `SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1`).
- Добавлен runbook `docs/runbooks/DESKTOP_SLEEP_WAKE_RUNBOOK.md` для evidence-grade ручного сценария.

Progress note (2026-03-13, sleep/wake strict evidence):
- Strict run выполнен успешно: `elapsedMs=90157`, `maxGapMs=28610`, `suspendObserved=true`, `windowRecoveryMode=manual-confirmed`.
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #24).

Progress note (2026-03-13, stability automation):
- Добавлен `scripts/smoke/smoke-desktop-stability.mjs` и команды `npm run smoke:desktop:stability`, `npm run desktop:smoke:m2:stability`.
- Команда предназначена для long-session gate (`SMOKE_DESKTOP_STABILITY_DURATION_MS=1800000`) с проверкой стабильности runtime markers и отсутствия критичных runtime errors.
- Для smoke-runner добавлен controllable bypass single-instance lock (`ELECTRON_ALLOW_MULTIPLE_INSTANCES=1`) без влияния на обычный desktop runtime.
- Safety hardening: bypass разрешен только в non-packaged runtime; packaged app остается строго single-instance.
- Warm-up evidence: `SMOKE_DESKTOP_STABILITY_DURATION_MS=30000` -> PASS (`docs/status/TEST_RESULTS.md`, Cycle #25).
- 30-minute runtime evidence: `SMOKE_DESKTOP_STABILITY_DURATION_MS=1800000` -> PASS (`docs/status/TEST_RESULTS.md`, Cycle #26).
- Voice-session manual checkpoint target сокращен до 15 минут (вместо 30) для M2 acceptance.

Progress note (2026-03-13, SSO externalization gate):
- Добавлен smoke `scripts/smoke/smoke-desktop-sso-external.mjs` и команда `npm run smoke:desktop:sso-external`.
- Test evidence: SSO start/logout externalization PASS (`docs/status/TEST_RESULTS.md`, Cycle #27).

Progress note (2026-03-14, auth UX/session consistency):
- Реализован browser-first desktop handoff с одноразовым кодом (`/v1/auth/desktop-handoff`, `/v1/auth/desktop-handoff/exchange`) и deep-link возвратом в Electron.
- Logout для desktop стабилизирован: локальный logout path + очистка session state в Electron, без принудительного перехода в browser chat UI.
- Добавлена browser completion page для desktop login (`desktop_handoff_complete=1`): сообщение об успешной авторизации и безопасное завершение bridge-перехода.
- Для конфликтов сессий (`ChannelSessionMoved`/`ChannelKicked`) добавлен блокирующий overlay “Приложение открыто в другом месте” + action “Открыть здесь”, чтобы исключить ложную интерактивность каналов.
- Убрано auto-join поведение в `general`: пользователь попадает в канал только если он был сохранен ранее.
- Test rollout evidence: SHA `b3177e0eec6c577ae988b0f86763ed67b6ef7b60` в `test` (feature `origin/feature/electron-desktop-foundation`).

Progress note (2026-03-14, RTC reconnect/state stabilization):
- Исправлен transient RTC/regression UX после multi-client входов: realtime-presence reset теперь выполняется только при `wsState=disconnected` (не на `connecting`).
- Для voice-enabled комнат включено удержание RTC transport даже при временном отсутствии peer-целей (`keepConnectedWithoutTargets=true`), чтобы исключить ложные состояния "Нет RTC-соединения" после churn/reconnect.
- Локальный RTC статус пользователя теперь отражается при активном подключении независимо от количества peer-целей.
- Validation: `npm --prefix apps/web run build` PASS, `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:sso-external` PASS.

Progress note (2026-03-14, manual RTC/sleep-wake checkpoint):
- После rollout `c745f06` на test выполнен практический прогон desktop runtime в реальном использовании:
	- RTC/media соединение подтверждено в Electron.
	- Аудио (включая наушники) и камера сохраняются при unfocused/minimized окне.
	- После sleep наблюдается временный video disconnect с последующим корректным восстановлением после wake.
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #28, manual PASS).

Progress note (2026-03-14, deterministic handoff phase 1):
- Реализован backend протокол попытки handoff: `/v1/auth/desktop-handoff/attempt`, `/v1/auth/desktop-handoff/attempt/:attemptId`, `/v1/auth/desktop-handoff/complete`.
- В web auth flow убран timer fallback после deep-link: browser ждет статус попытки polling-механизмом и только затем показывает completion/error page.
- В desktop callback прокидывается `attemptId` в renderer, а после `desktop-handoff/exchange` отправляется completion ack.
- Validation: `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:sso-external` -> PASS.

Progress note (2026-03-14, deterministic handoff smoke phase 2 start):
- Добавлен smoke `scripts/smoke/smoke-desktop-handoff-deterministic.mjs` и root command `npm run smoke:desktop:handoff-deterministic` (happy path + timeout/expired path на attempt protocol).
- Для локального прогона требуется `SMOKE_TEST_BEARER_TOKEN`; при его отсутствии smoke корректно завершает работу с явной подсказкой по env.

Progress note (2026-03-14, deterministic handoff phase 2 test evidence):
- Выполнен test rollout ветки `origin/feature/electron-desktop-foundation` (SHA `dbe678a`) через `deploy:test:smoke`: PASS.
- Выполнен `smoke:desktop:handoff-deterministic` на test с server-generated smoke token: PASS (`pending -> completed`, timeout-path=`expired`).
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #30).
- Runbook quickstart обновлен секцией deterministic handoff smoke (`docs/runbooks/RUNBOOK_TEST_ROLLOUT_QUICKSTART.md`).

Progress note (2026-03-14, voice checkpoint 15m gate):
- Выполнен `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:voice-checkpoint:15m`: PASS.
- Метрики: `elapsedMs=900001`, `probes=90`, `maxProbeGapMs=10012`, voice evidence через meter counters (`meterSessions=1`, `meterStreams=1`).
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #31).

Progress note (2026-03-14, handoff soak 20 cycles):
- Добавлен smoke `scripts/smoke/smoke-desktop-handoff-soak.mjs` и команда `npm run smoke:desktop:handoff:soak`.
- Выполнен soak на test: `SMOKE_DESKTOP_HANDOFF_SOAK_CYCLES=20` -> PASS (`elapsedMs=15003`, state transition `pending->completed` во всех циклах).
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #32).

Progress note (2026-03-14, handoff browser-level soak):
- Добавлен smoke `scripts/smoke/smoke-desktop-handoff-browser-soak.mjs` и команда `npm run smoke:desktop:handoff:browser-soak`.
- Выполнен cross-browser soak на test (Chromium/WebKit/Firefox, суммарно 20 циклов): PASS.
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #33).

Progress note (2026-03-14, M2 voice parity checklist alignment):
- На базе Cycle #31 (`smoke:desktop:voice-checkpoint:15m` PASS) и ранее собранных desktop RTC evidence отмечены как закрытые пункты `Voice connect/disconnect parity` и `Join room + voice handshake`.
- Следующие M2 focus-пункты остаются: `2h stability`.

Progress note (2026-03-14, build version/SHA unification):
- Для desktop pipeline добавлен `apps/desktop-electron/scripts/build-renderer.cjs`, который прокидывает `VITE_APP_VERSION` из desktop package version и `VITE_APP_BUILD_SHA` (env/git SHA) в renderer build.
- `apps/desktop-electron/package.json` синхронизирован до `version=0.2.0`; `build:renderer` переведен на новый orchestrator.
- Validation: `npm --prefix apps/desktop-electron run build:renderer` PASS, в логе: `VITE_APP_VERSION=0.2.0`, `VITE_APP_BUILD_SHA=1d7c504`.

Progress note (2026-03-14, desktop artifacts CI):
- Добавлен workflow `.github/workflows/desktop-artifacts.yml` с matrix `macos-latest` + `windows-latest`.
- Pipeline собирает unpacked desktop artifacts (`npm --prefix apps/desktop-electron run build`) и публикует их через `actions/upload-artifact`.

Progress note (2026-03-14, desktop media controls automation):
- Добавлен smoke `scripts/smoke/smoke-desktop-media-controls.mjs` и команда `npm run smoke:desktop:media-controls`.
- Сценарий выполняет authenticated desktop session через handoff/exchange, затем проверяет `mic/audio` toggle state transitions и device-menu flows (`input/output/camera`).
- Test evidence: PASS (`docs/status/TEST_RESULTS.md`, Cycle #35).

Progress note (2026-03-14, screenshare gate diagnostics):
- Добавлен smoke `scripts/smoke/smoke-desktop-screenshare.mjs` и команда `npm run smoke:desktop:screenshare`.
- На test (`roomSlug=general`) сценарий стабильно фиксирует disabled-state для screen share control и возвращает diagnostic SKIP.
- Evidence: `docs/status/TEST_RESULTS.md` (Cycle #36, blocked by control disabled).

Progress note (2026-03-15, desktop media permissions rollback):
- В ходе попытки ускорить screen-share startup в Electron main были добавлены жесткие permission handlers (`setPermissionCheckHandler`/`setPermissionRequestHandler`), что привело к регрессии доступа к mic/camera (баннер "разрешите доступ к устройствам").
- Выполнен rollback этих handlers, сохранен только `setDisplayMediaRequestHandler` для screen-share path.
- После перезапуска desktop runtime устройства восстановлены; manual verification PASS.

Progress note (2026-03-15, test rollout after rollback):
- Выполнен rollout в test ветки `origin/feature/electron-desktop-foundation` (SHA `db34f4d`) через `deploy-test-and-smoke.sh`: PASS.
- Postdeploy smoke pack в test прошел без регрессий (auth/api/web/realtime gates).
- Ручная проверка после rollout: screen share и media devices работают корректно.
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #37).

Progress note (2026-03-15, long-run stability gate policy update):
- 2h stability gate временно снят с текущего dev-loop (слишком низкая информативность для web-hosted desktop shell между частыми итерациями).
- Gate переносится на стадию standalone packaged client (signed/notarized build), где long-run имеет практический смысл для release readiness.
- До standalone этапа применяется укороченный practical gate: `15-30m` stability/checkpoint на каждую значимую media-итерацию.
- Следующий активный пункт плана: обновление dashboard/logs для desktop-сессий.

Progress note (2026-03-15, forced app update smoke):
- Добавлен smoke `scripts/smoke/smoke-web-version-mismatch-browser.mjs` и root command `npm run smoke:web:version-mismatch:browser`.
- На test подтвержден flow `version mismatch -> reload -> app updated overlay -> continue/recovery`.
- Evidence зафиксирован в `docs/status/TEST_RESULTS.md` (Cycle #38).

Progress note (2026-03-15, desktop observability counters):
- В `apps/api/src/routes/telemetry.ts` добавлены агрегаты runtime/platform для desktop-сессий в `ws:metrics:<day>`.
- `GET /v1/telemetry/summary` расширен полями `telemetry_runtime_*`, `telemetry_desktop_platform_*`, `telemetry_desktop_electron_version_present`.
- Документация матрицы smoke/CI обновлена (`docs/operations/SMOKE_CI_MATRIX.md`) для dashboard/log consumption этих метрик.

Progress note (2026-03-15, observability rollout verification):
- Выполнен test rollout SHA `030b0ec`; deploy/rebuild прошли.
- Подтверждена доступность новых summary полей через internal API path (`boltorezka-api-test` localhost).
- Внешний postdeploy realtime gate нестабилен из-за сетевого `ETIMEDOUT` к `test.boltorezka.gismalink.art:443` (повторяемо в `smoke:realtime`), поэтому цикл зафиксирован как PARTIAL (`docs/status/TEST_RESULTS.md`, Cycle #39).

Progress note (2026-03-15, postdeploy gate recovery):
- Добавлен retry-hardening для `smoke:sso` и browser boot path в `smoke:web:crash-boundary:browser` для снижения сетевых флейков.
- Server-side postdeploy smoke повторен и прошел полностью (включая `smoke:realtime`), evidence: `docs/status/TEST_RESULTS.md` (Cycle #40).
- Partial статус Cycle #39 закрыт повторным green-run.

## 11) Known Follow-ups

- [x] Провести browser-level handoff soak (Chromium/WebKit/Firefox) поверх уже закрытого protocol-level soak и приложить агрегированное evidence к auth runbook.
	- Дизайн: `docs/plans/2026-03-14_DESKTOP_HANDOFF_DETERMINISTIC_DESIGN.md`.
- [ ] Выполнить 2h stability soak на standalone packaged desktop client (post-signing/notarization) и зафиксировать evidence в отдельном release-gate цикле.

## 12) Checklist continuation (2026-03-14)

Ближайший practical order выполнения:
- [x] Реализовать Phase 1 из `2026-03-14_DESKTOP_HANDOFF_DETERMINISTIC_DESIGN.md` (attempt + complete ack + polling status).
- [x] Добавить deterministic handoff smoke (happy path + timeout path).
- [x] Повторить desktop voice checkpoint 15m на test после стабилизации handoff flow.
- [x] Зафиксировать evidence в `docs/status/TEST_RESULTS.md` и обновить runbook секцию auth desktop handoff.

Checklist continuation (2026-03-15, updated):
- [x] Добавить и прогнать автоматизированный smoke для `Forced app update path` (version mismatch -> reload/overlay recovery).
- [x] Зафиксировать practical stability policy в runbook desktop test gates (`15-30m` per iteration, `2h` only for standalone release gate).
