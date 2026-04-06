# Datowave Status Snapshot

## Текущее состояние (2026-03-06)

Update (2026-03-15):

Update (2026-04-06):

- RTC stability hardening workstream переведен в completed:
	- acceptance-gates закрыты по evidence (`feature-log` + `test-results`),
	- archived artifact: `docs/plans/completed/2026-04-06_RTC_STABILITY_HARDENING_PLAN.md`,
	- исторические детали инкрементов зафиксированы в `docs/status/feature-log/2026-03-06.md` и `docs/status/feature-log/2026-03-07.md`.

- Desktop M3 update/release track переведен на server-first build/publish flow:
	- `scripts/deploy/build-desktop-server-and-publish.sh` публикует channel-aware desktop artifacts в edge static web-root.
	- Публичные test endpoints `/desktop/test/latest.json` и `/desktop/test/mac/latest-mac.yml` подтверждены.
- Добавлен и подтвержден automation smoke для updater distribution contract:
	- `npm run smoke:desktop:update-feed`.
- Postdeploy gate расширен новым check:
	- `SMOKE_DESKTOP_UPDATE_FEED_STATUS` в `last-smoke-summary.env`.
	- full `deploy-test-and-smoke` cycle PASS с `desktop_update_feed=pass`.
- Устранен regression risk test static sync:
	- `deploy-test-from-ref.sh` теперь сохраняет `desktop/` subtree при web static refresh.
- Выполнен controlled prod rollout из `origin/main` на SHA `a19185a6f7e354f91a52608c4fa408964dca279c`.
- Prod post-checks подтверждены:
	- `GET /health` -> `200`, `api/db/redis=ok`, `appBuildSha=a19185a6f7e354f91a52608c4fa408964dca279c`.
	- `GET /v1/auth/mode` -> `mode=sso`.
	- `smoke:web:version-cache` (prod URL) -> PASS.
	- `smoke:desktop:update-feed` (`channel=prod`) -> PASS.
- Реализован frontend download entrypoint для desktop distribution:
	- в server menu добавлен tab `Desktop app`,
	- UI читает `/desktop/<channel>/latest.json` и рендерит matrix `macOS/Windows/Linux` с `Download` только для опубликованных артефактов.
- Выполнен signed RC dispatch (`desktop-artifacts`, `release_channel=test`, `signed=true`) на `origin/main`:
	- run завершился `FAIL` на `build-macos-latest` и `build-windows-latest` из-за отсутствующих GitHub signing secrets,
	- release-grade signing gate остается blocked до заполнения required secrets и повторного цикла.

- Prod и test работают в GitOps-модели с test-first циклом; последние smoke в test — PASS.
- React web остаётся default UI path; deploy-скрипты используют API + Caddy static sync mode по умолчанию (`--no-deps`, `FULL_RECREATE=1` только по явному флагу).
- Voice baseline зафиксирован канонически (`relay + TURN TLS/TCP`) и дополнен live-применением audio quality updates через realtime event.
- Закрыт web UX hardening по media permissions: persistent denied banner + lock контролов + единый control bar (desktop/mobile).
- Закрыт video UX/runtime инкремент в web:
	- sender-side видео-эффекты (`none` / `8-bit` / `ASCII`) с server-side control panel,
	- owner preview в Server Video tab,
	- server controls: resolution/fps/effect params, ASCII color, video-window min/max resize width,
	- video windows: drag за любую область + resize за любой угол (handles on hover),
	- local camera mirrored (`scaleX(-1)`) для self-view consistency.
- Закрыт frontend compatibility gate:
	- `index.html` no-store/no-cache,
	- hash-assets immutable,
	- единый build SHA в web bundle + API `/version`,
	- auto-reload клиента при новой версии,
	- smoke `smoke:web:version-cache` в postdeploy gate.
- Закрыт dual-path readiness в `test`:
	- добавлен отдельный static delivery path `https://test.boltorezka.gismalink.art/__web/`,
	- split-smoke (`SMOKE_API_URL` + `SMOKE_WEB_BASE_URL`) — PASS.
- Активирован внешний static delivery path в test ingress (web-default + API path routing):
	- `edge/ingress/caddy/Caddyfile` переключён на split routing (`/v1*|/health|/version|/metrics` -> API, остальные пути -> web static),
	- postdeploy smoke PASS на decoupled схеме (`apiServeStatic=0`).
- Выполнена стабилизация на Caddy-only static serving (без внутреннего nginx слоя):
	- static bundle синхронизируется в `edge/ingress/static/boltorezka/test` при test deploy,
	- test rollout/smoke PASS на SHA `7f319e9`.
- Закрыт runtime UX пункт по устройствам ввода:
	- при system `devicechange` в active call выполняется auto-refresh outgoing mic track (включая `default` route).
- Закрыт browser-level denied-media E2E путь:
	- добавлен headless smoke `smoke:web:denied-media:browser` (Playwright),
	- интеграция в `smoke:web:e2e` как opt-in stage через `SMOKE_E2E_DENIED_MEDIA_BROWSER=1`.
- Зафиксирован post-MVP performance gate и пороги GO/NO-GO:
	- документ `docs/operations/PERFORMANCE_GATE.md`.
- Закрыт Phase 0 (Discovery & ADR):
	- утверждён канонический пакет `docs/architecture/PHASE0_MVP_ADR.md` (MVP boundaries + ADR summary).
- Закрыт Phase 3 (Voice / WebRTC MVP):
	- утверждён канонический policy-пакет `docs/runbooks/PHASE3_VOICE_WEBRTC_MVP_POLICY.md` (room-size contract + graceful degradation policy).
- Исторически был подготовлен kickoff-пакет для Phase 5 (iOS/macOS):
	- scope note `docs/plans/2026-03-04_PHASE5_IOS_MACOS_SCOPE_NOTE.md` сохранен как non-active planning artifact и не отражает текущий delivery stack.
- Legacy deprecation (Phase D) переведен в completed; в open workstreams больше не является текущим фокусом.
- RTC stability execution workstream закрыт и заархивирован в completed-план.
- Зафиксировано решение sequencing:
	- Phase 1 RTC стартует сразу,
	- текущие `Phase 6` hardening/runbook пункты идут параллельно как supporting track,
	- policy unchanged: `test` first, `prod` только по явному подтверждению.
- Последний test rollout/smoke от `origin/main` (SHA `10b6fd5`) — PASS.
- Выполнен refresh pre-prod decision package под актуальные gate-правила и evidence (`docs/runbooks/PREPROD_DECISION_PACKAGE.md`).

## Канонические документы

- План и open tasks: `docs/plans/2026-04-06_FULL_PROJECT_EXECUTION_PLAN.md`
- Реализованные изменения/evidence: `docs/status/FEATURE_LOG.md`
- Voice baseline runbook: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Pre-prod gate details: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
