# RTC Stability Roadmap (Discord-inspired, incremental)

## Scope and intent

- Цель: закрыть текущие риски по consistency/reconnect/visibility без полного архитектурного переворота.
- Подход: `test` first, поэтапно, с feature flags и обратимостью.
- Non-goal: немедленная миграция на новый media backend/SFU стек.

## Current decision (2026-03-06)

- Приоритет: сразу приступаем к новому RTC-плану, потому что он напрямую закрывает текущие пользовательские регрессии (camera state, late join, reconnect).
- Параллельно: финализируем текущий Phase 6 runbook/security evidence как supporting workstream, без блокировки Phase 1.
- Rollout policy: только `test`, `prod` только после явного подтверждения.

## Phase 1 - State consistency foundation

- [x] Добавить серверный canonical media-state store (`roomSlug + userId`) в `apps/api/src/routes/realtime.ts`.
- [x] Добавить `call.initial_state` snapshot/replay на `room.join` в `apps/api/src/ws-protocol.ts` и `apps/api/src/routes/realtime.ts`.
- [x] Применять replay на клиенте до обычных дельт в `apps/web/src/services/wsMessageController.ts`.
- [x] Синхронизировать UI maps первого рендера в `apps/web/src/App.tsx` и `apps/web/src/hooks/useVoiceRoomStateMaps.ts`.
- [x] Держать строгую политику remote-video visibility (live-track only + immediate clear on camera off) в `apps/web/src/hooks/rtc/useVoiceCallRuntime.ts` и `apps/web/src/hooks/rtc/voiceCallPeerConnectionHandlers.ts`.

## Phase 2 - Negotiation reliability

- [x] Вынести negotiation flags/state в единый manager (`apps/web/src/hooks/rtc/voiceCallNegotiationState.ts`).
- [x] Добавить offer retry budget + fairness queue (`manual`, `video-sync`, `ice-restart`) в `apps/web/src/hooks/rtc/voiceCallOfferPolicy.ts`.
- [x] Оставить video effects default=`none` до завершения hardening.

## Phase 3 - Observability

- [x] Добавить counters/histograms для RTC (`offer/glare/reconnect/state-lag`) в `apps/api/src/routes/realtime.ts`.
- [x] Задокументировать SLO и triage для RTC в `docs/runbooks/VOICE_BASELINE_RUNBOOK.md` и `docs/operations/SMOKE_CI_MATRIX.md`.

Progress (2026-03-06):
- Добавлены `call_initial_state_sent` и `call_initial_state_participants_total` в server metrics (`apps/api/src/routes/realtime.ts`) как первый шаг observability для replay-path.

## Phase 4 - Smoke and deploy gates

- [x] Расширить smoke проверки late-join replay + camera convergence в `scripts/smoke/smoke-realtime.mjs` и `scripts/smoke/smoke-realtime-media-browser.mjs`.
- [x] Добавить pass/fail gate для `call.initial_state` в `scripts/deploy/postdeploy-smoke-test.sh`.
- [x] Включить optional extended RTC gate в `.github/workflows/test-smoke.yml`.

Progress (2026-03-06):
- `scripts/smoke/smoke-realtime.mjs` уже проверяет `call.initial_state` replay строго (`SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1`).
- `scripts/smoke/smoke-realtime-media-browser.mjs` проверяет `call.video_state` off/on convergence в обе стороны (A->B, B->A).

Status (2026-03-06):
- `#6.3` закрыт: observability + smoke/deploy gates внедрены и валидированы в test.

## Phase 5 - Controlled rollout

- [x] Ввести feature flags: `initial_state_replay`, `negotiation_manager_v2`, `offer_queue`.
- [ ] После стабильных метрик сформировать decision package по SFU-migration в `docs/architecture/SFU_MIGRATION_PLAN.md`.

Progress (2026-03-06):
- Добавлены runtime toggles для controlled rollback без code revert:
	- `RTC_FEATURE_INITIAL_STATE_REPLAY` (API),
	- `VITE_RTC_FEATURE_INITIAL_STATE_REPLAY` (Web),
	- `VITE_RTC_FEATURE_NEGOTIATION_MANAGER_V2` (Web),
	- `VITE_RTC_FEATURE_OFFER_QUEUE` (Web).

## Acceptance gates

- [ ] 3 подряд test-прогона без пустых remote camera windows.
- [ ] Мгновенное выключение remote camera в UI при `localVideoEnabled=false`.
- [ ] Late join получает корректный media-state до первых delta-событий.
- [ ] Rollback по feature flags без code revert.
