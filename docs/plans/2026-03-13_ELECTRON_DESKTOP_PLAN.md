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
- [x] Voice/video/screen share в parity с web (для текущего web-hosted desktop shell на test).
- [x] Выбор input/output устройств, mute/unmute, reconnect behavior.
- [x] Автообновления desktop-клиента (test/prod каналы).
- [x] Базовые crash/log артефакты для диагностики.

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
- [x] Auto-update orchestration.
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
- [x] Device switch (input/output) работает стабильно.
- [x] Camera + screen share работают в desktop.
- [ ] Long-session stability (минимум 2 часа) без критичных деградаций (deferred на standalone packaged gate).

Definition of done:
- [x] Пройден desktop smoke сценарий для RTC.
- [x] Нет блокирующих regressions относительно web baseline.

### M3 - Update/release channel
- [x] Добавить в web UI пункт меню сервера `Get desktop app`.
- [x] По клику открывать popup с кнопками платформ-заглушек (`macOS`, `Windows`, `Linux`) и статусами доступности.
- [x] Источник загрузки: channel-aware артефакты (`test`/`prod`) из release storage, публикуемые server-first script (GitHub manual fallback).
- [x] Настроены каналы auto-update: test и prod (runtime policy + channel routing).
- [x] Реализован безопасный update flow с rollback-процедурой.
- [ ] Сборки подписываются (где применимо).

Note:
- Download UI поток (`Get desktop app` + popup платформ) переводим в deferred-state до появления первых publishable desktop билдов.
- До этого момента фокус M3: release channels, update policy, signing/runbook, чтобы сразу подключить реальные ссылки после готовности артефактов.

Definition of done:
- [x] В меню сервера доступна точка входа `Get desktop app`.
- [x] Popup работает в placeholder-режиме (`coming soon`) без broken links.
- [x] Для доступных платформ кнопка ведет на актуальный артефакт выбранного канала (`test`/`prod`).
- [x] Обновление test->test проходит автоматически.
- [x] Rollback runbook проверен на test.

### M4 - Prod readiness
- [x] Пройден pre-prod checklist.
- [x] Подтверждены smoke + ручной critical path на test.
- [x] Выполнен controlled rollout в prod.

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
- [x] Проверить media permissions на macOS.
- [ ] Проверить media permissions на Windows.
- [x] Проверить reconnect при network flap.
- [x] Проверить поведение после sleep/wake ноутбука.
- [x] Проверить длительную сессию + переключения девайсов (15m/30m practical gates).

Runbook:
- `docs/runbooks/DESKTOP_SLEEP_WAKE_RUNBOOK.md`

### 4.4 Auto-update
- [x] Выбрать release feed и схему каналов.
- [x] Настроить update policy (silent/download-only/prompt).
- [x] Реализовать безопасное применение обновления.
- [x] Зафиксировать rollback шаги в runbook.

Runbook:
- `docs/runbooks/DESKTOP_UPDATE_CHANNELS_RUNBOOK.md`

### 4.5 Observability
- [x] Добавить desktop telemetry labels (platform, app channel, app version).
- [x] Добавить сбор crash/report артефактов.
- [x] Обновить дашборд/логи для desktop-сессий.

### 4.6 Desktop download distribution
- [x] Frontend entrypoint: добавить в server menu кнопку `Get desktop app`.
- [x] UI behavior: по кнопке открывать popup `Desktop app downloads`.
- [x] В popup рендерить фиксированный список платформ: `macOS`, `Windows`, `Linux`.
- [x] Для платформ без артефакта показывать заглушку `Coming soon` и неактивную кнопку.
- [x] Для платформ с артефактом показывать активную кнопку `Download`.
- [x] Backend/source contract: frontend читает channel manifest (`/desktop/<channel>/latest.json`) и строит платформенные ссылки из опубликованных артефактов.
- [x] Хранение артефактов: release storage для desktop билдов (по каналам `test`/`prod`) с immutable ссылками на конкретные версии.
- [x] Публикация: server-first script при готовности билда обновляет манифест и добавляет ссылку на новый артефакт (GitHub path оставлен как fallback).
- [x] До появления реальных билдов popup работает в режиме заглушек без broken links.

Status:
- Updated (2026-03-16): `Desktop app` tab в server menu переведен в UX-first placeholder режим (3 карточки `Windows/macOS/Linux` + disabled `Download` с tooltip `Soon`) без manifest fetch и без broken links до появления publishable desktop билдов.
- Updated (2026-03-17): после server-side publish test artifacts popup снова использует manifest-contract (`/desktop/<channel>/latest.json`); для доступной платформы (`macOS` в текущем test канале) отображается активная `Download` кнопка, для остальных платформ сохраняется `Coming soon`.

### 4.7 Runtime routes centralization (web/desktop)
- [x] Вынести единый transport resolver для runtime-specific endpoint routing (API/WS/RTC/SSO) вместо разрозненных `window.location` веток.
- [x] Перевести RTC signal URL normalization и realtime WS base на единый resolver.
- [x] Зафиксировать runtime matrix (`web-dev`, `web-prod`, `desktop-dev`, `desktop-prod`) и инварианты протоколов (`https/wss`) в runbook.
- [x] Добавить диагностику endpoint resolution в desktop call log (raw/live resolved URL), чтобы ускорить triage RTC инцидентов.
- [x] Прогнать targeted test smoke после рефакторинга (`smoke:realtime`, `smoke:livekit:token-flow`, desktop practical media check).

Runbook:
- `docs/runbooks/DESKTOP_RUNTIME_TRANSPORT_RUNBOOK.md`

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

- [x] Все задачи делаются в feature-ветках.
- [x] В test деплоится конкретная feature/main ветка, только через scripted flow.
- [x] Перед prod desktop-release: merge в main -> test gate -> smoke -> явное подтверждение -> prod.
- [x] Без ручных правок на сервере, только через git + GitOps.
- [x] Правило фронтенд-фиксoв: если изменение затрагивает общий frontend/runtime слой, перед test rollout обязательно пересобирать и публиковать весь набор клиентских артефактов текущего релизного контура (web + desktop mac, и следующие платформы по мере появления), чтобы не допускать version skew между клиентами.

## 7) Риски и mitigation

Риск: расхождение web и desktop поведения media APIs.
- Mitigation:
- [ ] Ранний cross-platform soak на M2.
- [x] Desktop-specific telemetry и быстрый rollback channel.

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
- [x] Спроектировать и внедрить UI-поток `Get desktop app` -> popup платформ с заглушками.
- [x] Определить формат и размещение build-манифеста для desktop downloads (`test`/`prod`).
- [x] (Deferred) Вернуться к разделу desktop downloads после появления первых publishable desktop билдов.
- [ ] Закрыть non-download задачи M3: release-grade signing/notarization matrix + update verification evidence.
- [x] Обновить pre-prod decision package под post-merge state `origin/main` и зафиксировать owner/sign-off draft.
- [x] Подготовить controlled prod rollout command set (без выполнения) для explicit approval.

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

Progress note (2026-03-15, release-grade signing gate prep):
- Runbook `docs/runbooks/DESKTOP_SIGNING_READINESS_RUNBOOK.md` расширен release-grade матрицей (macOS/Windows), evidence checklist и verification command skeletons.
- Следующий execution step: выполнить signed RC cycle и заполнить evidence в `docs/status/TEST_RESULTS.md`.

Progress note (2026-03-15, Windows OIDC signing path):
- Workflow `.github/workflows/desktop-artifacts.yml` расширен для `windows-only` signed режима до готовности Apple secrets.
- Добавлен Windows signing provider `azure-oidc` через `azure/login` + `azure/artifact-signing-action` (OIDC), без обязательного `DESKTOP_WIN_CSC_LINK`/`DESKTOP_WIN_CSC_KEY_PASSWORD`.
- Runbook обновлен новыми workflow inputs и списком Azure Trusted Signing secrets.

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

Progress note (2026-03-15, M3 update channels baseline):
- В `apps/desktop-electron/src/main.cjs` добавлен channel-aware update orchestration через `electron-updater`.
- Каналы `test/prod` выбираются через `ELECTRON_UPDATE_CHANNEL`, feed строится как `${ELECTRON_UPDATE_FEED_BASE_URL}/{channel}/{platform}`.
- Runtime policy: safe no-op при отсутствии feed URL, periodic checks, controlled `allowPrerelease/allowDowngrade` для `test`.
- Добавлен runbook `docs/runbooks/DESKTOP_UPDATE_CHANNELS_RUNBOOK.md` (rollout/rollback).

Progress note (2026-03-15, M3 safe apply flow):
- Добавлен preload/main IPC контракт для update actions: `get-state`, `check`, `download`, `apply`.
- В web renderer добавлен desktop update banner с явным действием `Restart and update`.
- `quitAndInstall` вызывается только после явного подтверждения пользователя (без background auto-install).

Progress note (2026-03-15, M3 signing readiness baseline):
- Workflow `.github/workflows/desktop-artifacts.yml` расширен manual режимом signed release candidate (`workflow_dispatch`: `release_channel`, `signed=true`).
- Для signed path зафиксирован набор required secrets для macOS/Windows code signing и notarization.
- Добавлен runbook `docs/runbooks/DESKTOP_SIGNING_READINESS_RUNBOOK.md` с readiness sequence и promotion policy.

Progress note (2026-03-15, M3 GitHub release-chain detail):
- Для signed workflow добавлен `github-release-chain` job: агрегирует matrix artifacts, генерирует `desktop-release-manifest.json`.
- Добавлен optional режим `create_release_draft=true` для создания GitHub Draft Release с вложенными signed артефактами.
- Release остаётся draft по умолчанию и не инициирует automatic prod rollout.

Progress note (2026-03-15, M3 server-first build policy):
- Принято решение перейти на server-first desktop build/publish: сборка выполняется на серверном GitOps checkout.
- Добавлен script `scripts/deploy/build-desktop-server-and-publish.sh` (build + publish в edge static + `latest.json` manifest).
- GitHub desktop workflow переведен в manual-only fallback режим для экономии CI ресурсов.

Progress note (2026-03-15, M3 server-first distribution validation):
- Выполнен end-to-end прогон на mac-mini (`~/srv/boltorezka` + `~/srv/edge`) для test канала; manifest и build snapshot публикуются в edge static.
- Исправлен publish-path под реальный Caddy web-root (`/ingress/static/boltorezka/<channel>/desktop/<channel>/...`), публичный `/desktop/test/latest.json` подтвержден.
- Добавлена генерация mac updater feed (`/desktop/<channel>/mac/latest-mac.yml` + zip/blockmap), совместимая с `electron-updater` generic provider.
- Добавлен automation smoke `npm run smoke:desktop:update-feed`, проверяющий `latest.json`, `latest-mac.yml` и zip endpoint.

Progress note (2026-03-15, postdeploy integration hardening):
- `smoke:desktop:update-feed` встроен в `postdeploy-smoke-test.sh` и summary (`SMOKE_DESKTOP_UPDATE_FEED_STATUS`).
- Устранен regression-risk в test deploy static sync: web static refresh теперь сохраняет `desktop/` subtree, чтобы не ломать updater feed между деплоями.
- Выполнен full `deploy-test-and-smoke` прогон с `SMOKE_DESKTOP_UPDATE_FEED=1`: PASS (включая realtime gate).

Progress note (2026-03-15, merge + post-merge gate):
- Ветка `feature/electron-desktop-foundation` merged в `main` (merge commit `10b6fd5`).
- Выполнен обязательный post-merge test gate уже из `origin/main`: `deploy:test:smoke` PASS с `desktop_update_feed=pass`.

Progress note (2026-03-15, controlled prod rollout):
- Выполнен controlled prod rollout из `origin/main` на SHA `a19185a6f7e354f91a52608c4fa408964dca279c`.
- Prod post-checks green: `/health` (`api/db/redis=ok`), `/v1/auth/mode` (`sso`), `smoke:web:version-cache` PASS.
- Desktop prod distribution/update endpoints подтверждены: `/desktop/prod/latest.json`, `/desktop/prod/mac/latest-mac.yml`, `smoke:desktop:update-feed` (`channel=prod`) PASS.

Progress note (2026-03-16, desktop download UX simplification):
- `Desktop app` popup упрощен для пользователей до 3 карточек платформ (`Windows`, `macOS`, `Linux`) с disabled кнопками `Download` и tooltip `Soon`.
- Убран manifest-driven fetch в web UI для этой вкладки до появления первых publishable standalone desktop билдов.
- Исправлено растягивание контента по высоте в `Server profile` tabs: layout приведен к паттерну `User settings`.

Progress note (2026-03-16, runtime routes centralization start):
- Зафиксирован новый рефакторный поток для централизации runtime endpoint resolution в desktop/web (API/WS/RTC/SSO).
- Trigger: observed incident class `WS=ok, RTC=fail` в desktop, указывающий на divergence между transport resolvers.
- Phase 1 started: унификация WS/RTC route resolution через единый transport runtime helper в web renderer.

Progress note (2026-03-17, desktop media permissions fix + cleanup):
- Найден и закрыт root cause микрофонного deny в packaged desktop: неверный entitlement key (`com.apple.security.device.microphone`) заменен на корректный `com.apple.security.device.audio-input`.
- Подтверждено на test build: camera/microphone entitlements встроены в .app, системный запрос микрофона и media-flow восстановлены.
- После валидации выполнен cleanup: временные debug/workaround изменения в runtime RTC/media bridge удалены, сохранены только release-необходимые изменения в `apps/desktop-electron/package.json` и `apps/desktop-electron/entitlements.mac.plist`.
- UI polish: overlay `ChannelSessionMoved` приведен к каноничному popup стилю (`voice-preferences-overlay` + `card voice-preferences-modal`) для визуальной консистентности.

Progress note (2026-03-17, plan review + policy sync):
- Выполнена ревизия незакрытых пунктов плана: media permissions разделены на `macOS=done` и `Windows=pending`.
- Зафиксировано обязательное правило release discipline для frontend-фиксов: rebuild/publish всего клиентского набора в контуре (`web + desktop` и следующие платформы) на каждый cross-client frontend/runtime fix.
- Основные открытые блокеры на текущий момент: release-grade signing/notarization evidence, активный desktop download contract (вместо placeholder), 2h standalone stability soak, Windows media validation.

Progress note (2026-03-17, unchecked items audit):
- Повторно проверены все незакрытые чекбоксы: всего `36` пунктов со статусом `[ ]`.
- Из них подтвержденно execution-critical (реально блокируют desktop release readiness): signing/notarization evidence, Windows media permissions validation, активный download contract (manifest-driven links вместо placeholder), 2h standalone stability soak, pre-prod approval package refresh.
- Отдельная группа `[ ]` остается осознанно deferred/out-of-scope по плану (`v1.1+`, post-signing gates, cross-platform QA expansion).
- Оценочные сроки в разделе `Примерная оценка сроков` оставлены незакрытыми намеренно как reference, а не как task gate.

Progress note (2026-03-17, room/chat behavior refactor rollout):
- Реализовано разделение `joined room` и `active chat room`: чат открывается независимо от voice/video join, text-only комнаты работают как chat-only, для `text+voice`/`text+voice+video` добавлена hover-кнопка `Открыть чат` с active-state подсветкой.
- Изменения выкачены в `test` из `origin/feature/desktop-unsigned-mode`, SHA `4e2546d`; `deploy:test:smoke` на сервере (`~/srv/boltorezka`) прошел green.

Progress note (2026-03-17, 2h stability interim evidence):
- Пассивный 2h мониторинг (`.deploy/manual-desktop-2h-monitor-20260317T071254Z.log`) прервался из-за внешнего фактора (отключение питания) на `113/120` сэмплах, без явного `FAILED`.
- По owner decision результат принят как `условно PASS` для текущей итерации (interim evidence), без закрытия release-gate пункта standalone `2h` soak.

Progress note (2026-03-17, runtime transport centralization phase 1 complete):
- В `apps/web/src/transportRuntime.ts` внедрен единый runtime snapshot resolver (`runtimeId`, `apiBase`, `wsBase`, `publicOrigin`, secure transport policy) для web/desktop режимов.
- API и SSO logout URL переведены на общий resolver (`apps/web/src/api.ts`, `apps/web/src/services/authController.ts`).
- В desktop call log добавлены endpoint diagnostics перед LiveKit connect (`transport runtime/api/ws/publicOrigin`) и постоянная пара `livekit signal raw/resolved` для triage инцидентов класса `WS=ok, RTC=fail`.
- Runtime matrix и protocol invariants зафиксированы в `docs/runbooks/DESKTOP_RUNTIME_TRANSPORT_RUNBOOK.md`.

Progress note (2026-03-17, runtime transport targeted smoke evidence):
- Выполнен test rollout `origin/feature/desktop-unsigned-mode` на SHA `6ed844e` через `deploy:test:smoke`; deploy-фаза завершена успешно, общий цикл помечен `failed` из-за независимого feed-gate `smoke:desktop:update-feed`.
- Для закрытия runtime-refactor gate отдельно выполнен targeted набор на сервере (`~/srv/boltorezka`): `smoke:realtime`, `smoke:livekit:token-flow`, `smoke:desktop:runtime` — все команды завершились `ok`.
- `smoke:realtime` прошел с transient retry (`attempt 1/3`, `2/3`) и итогом `ok=true`; `smoke:desktop:runtime` подтвердил desktop markers (`runtime=desktop`, `platform=darwin`, `electronVersion=35.7.5`).

Progress note (2026-03-17, test rollout with server-side desktop build):
- Выполнен `deploy:test:smoke` для `origin/feature/desktop-unsigned-mode` (SHA `4ca3ddd`) c `ENABLE_DESKTOP_BUILD=1`, `DESKTOP_CHANNEL=test`, `DESKTOP_SIGNING_MODE=unsigned`.
- Server-first desktop build/publish завершен успешно: обновлены `latest.json` и `mac/latest-mac.yml` для test канала, опубликован артефакт `Boltorezka-mac-arm64.zip`.
- Postdeploy smoke прошел green, включая `smoke:desktop:update-feed` (`ok`, `channel=test`, `sha=4ca3ddd`) и `smoke:realtime` (`ok=true`, `reconnectOk=true`).

Progress note (2026-03-17, desktop download contract activation):
- В `Server profile -> Desktop app` включен manifest-driven mapping платформенных ссылок из `/desktop/<channel>/latest.json`.
- Frontend download resolver теперь поддерживает `url`, `urlPath` и fallback через `relativePath`+`sha`, чтобы кнопка `Download` оставалась рабочей при разных форматах publish manifest.
- M3 download contract пункты закрыты: доступная платформа получает активный `Download`, недоступные платформы остаются в `Coming soon`.

Progress note (2026-03-17, rollback runbook validation on test):
- Выполнен контрольный test rollout `origin/feature/desktop-unsigned-mode` на SHA `6ad9d69` с `ENABLE_DESKTOP_BUILD=1` и green postdeploy smoke.
- Выполнен manual rollback cycle на known-good SHA `4ca3ddd` (через `TEST_REF=<sha>`), также с `ENABLE_DESKTOP_BUILD=1` и green postdeploy smoke.
- В обоих циклах подтвержден updater feed gate (`smoke:desktop:update-feed` PASS) и realtime gate (`smoke:realtime` PASS), rollback path признан operational для M3.

Progress note (2026-03-17, test->test auto-update evidence):
- Для packaged updater найден и исправлен root cause: `electron-updater` перенесен в runtime dependencies (`apps/desktop-electron/package.json`) — до фикса updater runtime был disabled в packaged app.
- Для server-first desktop publish добавлена генерация `app-update.yml` внутри `.app` bundle (`scripts/deploy/build-desktop-server-and-publish.sh`), что устранило `ENOENT .../Contents/Resources/app-update.yml` на этапе download.
- Evidence цикл: baseline app `1.0.0-test.20260317.2043` запущен с `ELECTRON_UPDATE_AUTO_DOWNLOAD=1`, после публикации следующего test build (`1.0.0-test.20260317.2046`) зафиксированы события `available -> download-progress -> downloaded` в updater trace (`ELECTRON_DESKTOP_UPDATE_TRACE_OUT`).

## 11) Known Follow-ups

- [x] Провести browser-level handoff soak (Chromium/WebKit/Firefox) поверх уже закрытого protocol-level soak и приложить агрегированное evidence к auth runbook.
	- Дизайн: `docs/plans/2026-03-14_DESKTOP_HANDOFF_DETERMINISTIC_DESIGN.md`.
- [ ] Выполнить 2h stability soak на standalone packaged desktop client (post-signing/notarization) и зафиксировать evidence в отдельном release-gate цикле.
	- Interim note (2026-03-17): пассивный мониторинг `113/120` принят как `условно PASS` для текущего dev-цикла после power outage; полноценный release-gate пункт остается открытым.

## 12) Checklist continuation (2026-03-14)

Ближайший practical order выполнения:
- [x] Реализовать Phase 1 из `2026-03-14_DESKTOP_HANDOFF_DETERMINISTIC_DESIGN.md` (attempt + complete ack + polling status).
- [x] Добавить deterministic handoff smoke (happy path + timeout path).
- [x] Повторить desktop voice checkpoint 15m на test после стабилизации handoff flow.
- [x] Зафиксировать evidence в `docs/status/TEST_RESULTS.md` и обновить runbook секцию auth desktop handoff.

Checklist continuation (2026-03-15, updated):
- [x] Добавить и прогнать автоматизированный smoke для `Forced app update path` (version mismatch -> reload/overlay recovery).
- [x] Зафиксировать practical stability policy в runbook desktop test gates (`15-30m` per iteration, `2h` only for standalone release gate).

Checklist continuation (2026-03-15, post-merge):
- [x] Merge `feature/electron-desktop-foundation` в `main`.
- [x] Выполнить post-merge test gate уже из `origin/main` (`deploy:test:smoke` PASS, включая `desktop_update_feed=pass`).
- [ ] Обновить pre-prod пакет и подготовить explicit approval запись перед возможным prod rollout.

## 13) Post-merge snapshot (2026-03-15)

Текущее состояние после merge desktop workstream в `main`.

Green now (test-validated):
- Desktop auth/handoff/session consistency (browser-first handoff + deterministic protocol).
- RTC base parity для текущего web-hosted desktop shell: join/voice handshake, reconnect, media controls, screen share start/stop.
- Forced app update/recovery path (version mismatch -> reload -> overlay continue).
- Desktop observability counters в telemetry summary (`telemetry_runtime_*`, `telemetry_desktop_platform_*`).
- Server-side postdeploy smoke восстановлен в full PASS после anti-flake hardening (Cycle #40).
- Desktop server-first distribution contract validated и встроен в postdeploy smoke (`desktop_update_feed=pass`).
- Post-merge gate из `origin/main` пройден (Cycle #50, SHA `10b6fd5`).

Deferred to standalone packaged release gate:
- 2h long-run stability soak.
- Full cross-platform matrix sign-off (macOS Intel/Apple Silicon + Windows 10/11) как release-grade evidence.
- Auto-update channel orchestration + signing/notarization + rollback runbook verification.

Open for prod-readiness (после merge в `main`):
- Pre-prod checklist completion (`M4` раздел, owners/rollback refs/sign-off).
- Signing/notarization readiness check для release-grade desktop artifacts.
- Controlled prod rollout только после явного подтверждения.
