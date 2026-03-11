# LiveKit Full Transition Checklist
Date: 2026-03-09
Scope: full runtime transition to LiveKit-only media topology and release closure.

## 1) Runtime De-legacy (LiveKit-only)

- [x] API runtime topology model is LiveKit-only (`apps/api/src/config.ts`, `apps/api/src/routes/realtime.ts`).
- [x] Shared WS/API topology types are LiveKit-only (`apps/api/src/ws-protocol.types.ts`, `apps/web/src/types.ts`).
- [x] Web runtime topology parsing/defaults are LiveKit-only (`apps/web/src/App.tsx`, `apps/web/src/services/wsMessageController.ts`, `apps/web/src/hooks/useRealtimeChatLifecycle.ts`).
- [x] Host compose/env removed legacy topology vars (`infra/docker-compose.host.yml`, `infra/.env.host.example`).
- [x] Postdeploy realtime topology gate is fixed to LiveKit expectation (`scripts/deploy/postdeploy-smoke-test.sh`, `scripts/smoke/smoke-realtime.mjs`, `scripts/smoke/run-all-smokes.sh`, `scripts/smoke/smoke-web-e2e.sh`).
- [x] Legacy SFU deploy/compare scripts retired (`scripts/deploy/deploy-test-sfu-default.sh`, `scripts/smoke/compare-p2p-sfu-baseline.sh`, `scripts/smoke/compare-sfu-livekit-baseline.sh`).

## 2) Release And Ops Closure (migrated from target checklist)

- [ ] Нет критичных инцидентов в последние 48 часов.
- [ ] Принято явное подтверждение на `prod` rollout.
- [ ] Smoke `test`/`prod` проходит полностью.

## 3) Validation Notes

- Validation note (2026-03-09): legacy `p2p/sfu` topology branches removed from active runtime paths; media topology contract is now `livekit` only.
- Validation note (2026-03-09): ingress policy uses `/rtc*` signaling with `/rtc/v1* -> /rtc*` bridge for client compatibility; deprecated `/livekit/rtc*` routes explicitly return `404`.
- Validation note (2026-03-09): release-gate items above are intentionally kept open until production change window decision.
