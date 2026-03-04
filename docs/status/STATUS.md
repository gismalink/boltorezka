# Boltorezka Status Snapshot

## Текущее состояние (2026-03-04)

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
- Подготовлен kickoff-пакет для Phase 5 (iOS/macOS):
	- зафиксирован scope note `docs/plans/PHASE5_IOS_MACOS_SCOPE_NOTE.md` (MVP boundaries + shared Swift package bootstrap contract).
- Активирован следующий execution workstream:
	- `docs/runbooks/LEGACY_PUBLIC_DEPRECATION_PLAN.md` как текущий план для оставшегося decommission cleanup (Phase D).
- Последний test rollout/smoke по feature ветке (`origin/feature/video-stream-overlay-chat-toggle`, SHA `94c8d0e`) — PASS.
- Выполнен refresh pre-prod decision package под актуальные gate-правила и evidence (`docs/runbooks/PREPROD_DECISION_PACKAGE.md`).

## Канонические документы

- План и open tasks: `docs/status/ROADMAP.md`
- Реализованные изменения/evidence: `docs/status/FEATURE_LOG.md`
- Voice baseline runbook: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Pre-prod gate details: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
