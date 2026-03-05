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

- [ ] Вынести negotiation flags/state в единый manager (`apps/web/src/hooks/rtc/voiceCallNegotiationState.ts`).
- [ ] Добавить offer retry budget + fairness queue (`manual`, `video-sync`, `ice-restart`) в `apps/web/src/hooks/rtc/voiceCallOfferPolicy.ts`.
- [ ] Оставить video effects default=`none` до завершения hardening.

## Phase 3 - Observability

- [ ] Добавить counters/histograms для RTC (`offer/glare/reconnect/state-lag`) в `apps/api/src/routes/realtime.ts`.
- [ ] Задокументировать SLO и triage для RTC в `docs/runbooks/VOICE_BASELINE_RUNBOOK.md` и `docs/operations/SMOKE_CI_MATRIX.md`.

## Phase 4 - Smoke and deploy gates

- [ ] Расширить smoke проверки late-join replay + camera convergence в `scripts/smoke/smoke-realtime.mjs` и `scripts/smoke/smoke-realtime-media-browser.mjs`.
- [ ] Добавить pass/fail gate для `call.initial_state` в `scripts/deploy/postdeploy-smoke-test.sh`.
- [ ] Включить optional extended RTC gate в `.github/workflows/test-smoke.yml`.

## Phase 5 - Controlled rollout

- [ ] Ввести feature flags: `initial_state_replay`, `negotiation_manager_v2`, `offer_queue`.
- [ ] После стабильных метрик сформировать decision package по SFU-migration в `docs/architecture/SFU_MIGRATION_PLAN.md`.

## Acceptance gates

- [ ] 3 подряд test-прогона без пустых remote camera windows.
- [ ] Мгновенное выключение remote camera в UI при `localVideoEnabled=false`.
- [ ] Late join получает корректный media-state до первых delta-событий.
- [ ] Rollback по feature flags без code revert.
