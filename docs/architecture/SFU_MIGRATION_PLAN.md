# SFU Migration Plan (Decision Package)

Date: 2026-03-06  
Status: Approved as decision package for post-Phase-5 execution

## 1) Purpose

This document defines when and how Boltorezka should move from the current P2P/TURN baseline to SFU topology, with measurable entry gates, rollback policy, and incremental rollout steps.

## 2) Current baseline and constraints

Current media baseline:
- Topology: WebRTC P2P + TURN relay-first.
- Signaling/runtime hardening: Phase 6.1-6.3 completed.
- Controlled rollout toggles (Phase 5):
  - `RTC_FEATURE_INITIAL_STATE_REPLAY`
  - `VITE_RTC_FEATURE_INITIAL_STATE_REPLAY`
  - `VITE_RTC_FEATURE_NEGOTIATION_MANAGER_V2`
  - `VITE_RTC_FEATURE_OFFER_QUEUE`

Observed constraints requiring SFU-ready planning:
- 3-way race/live-room scenarios are not strict-gated and can stay unstable under current P2P behavior.
- P2P complexity grows non-linearly with room size, reconnect churn, and mixed network quality.
- Camera convergence and late-join consistency are now guarded, but scaling behavior still depends on client-side mesh state.

## 3) Decision matrix

Option A: keep P2P only
- Pros: lowest immediate implementation cost.
- Cons: limited room scalability, rising reconnect/signaling complexity.
- Decision: rejected as long-term path.

Option B: hybrid topology (P2P default, SFU for larger rooms)
- Pros: safe migration, preserves small-room efficiency, reduces risk.
- Cons: routing/control complexity and dual-mode testing burden.
- Decision: selected.

Option C: full SFU-only switch
- Pros: single media topology and predictable large-room behavior.
- Cons: highest migration risk and blast radius.
- Decision: deferred.

## 4) Entry gates for SFU implementation start

Implementation work starts when all gates below are true for test contour:
1. At least 3 consecutive `deploy:test:smoke` runs pass with replay gate enabled.
2. No regressions in `call.initial_state` smoke assertions.
3. Reconnect path remains healthy (`call_reconnect_joined` observed with no critical errors).
4. No active rollback by Phase 5 feature toggles for 48h after latest RTC changes.

## 5) Target architecture (hybrid)

Control plane:
- Existing `boltorezka-api` remains source of truth for auth, room membership, and signaling authorization.

Media routing:
- Add SFU service as media plane for rooms above threshold.
- Keep TURN for fallback and constrained networks.

Room policy:
- Small rooms: keep P2P path.
- Large/unstable rooms: route through SFU.
- Routing decision must be deterministic and exposed in room/session metadata.

## 6) Migration stages

Stage 0: Readiness and contracts
- Define SFU session contract (`join`, `publish`, `subscribe`, `leave`) and capability envelope for clients.
- Extend observability schema with SFU-specific metrics.

Stage 1: Dark launch in test
- Deploy SFU in test only.
- Keep P2P as default.
- Introduce room-level switch `mediaTopology=sfu|p2p` in test tooling.

Stage 2: Canary rooms
- Enable SFU only for selected internal rooms/users.
- Compare setup success, reconnect quality, and camera consistency against P2P baseline.

Stage 3: Hybrid default in test
- Auto-route rooms above threshold to SFU.
- Keep manual rollback to P2P path.

Stage 4: Production readiness package
- Promote to prod only from `main` and only after explicit approval.
- Include final rollout/rollback runbook evidence.

## 7) Success criteria

Hard criteria:
- Realtime smoke remains green with replay gate strict.
- Call setup success ratio does not regress compared to current baseline.
- Reconnect stability improves for multi-party scenarios.
- No increase in severe incident rate during canary period.

Operational criteria:
- Clear on-call triage flow for SFU failure classes.
- Rollback can be executed without code revert.

## 8) Rollback policy

Rollback trigger examples:
- sustained call setup degradation,
- reconnect failures above threshold,
- severe media one-way-audio/video incidents.

Rollback actions:
1. Disable SFU room routing for test/prod contour.
2. Force P2P path for new sessions.
3. Keep active sessions until disconnect where possible, then rejoin on P2P.
4. Preserve metrics and incident timeline for postmortem.

## 9) Risks and mitigations

Risk: dual topology complexity.
- Mitigation: keep one canonical routing decision source and explicit telemetry labels.

Risk: client version mismatch during rollout.
- Mitigation: maintain version compatibility checks and cache/version smoke gates.

Risk: operational overhead.
- Mitigation: stage-based rollout with test-first policy and scripted smoke enforcement.

## 10) Ownership and evidence

Owners:
- Realtime/API: backend owner.
- WebRTC runtime: web owner.
- Deploy/runbook: operations owner.

Evidence sources:
- `docs/status/FEATURE_LOG.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- `docs/operations/SMOKE_CI_MATRIX.md`
- postdeploy summary and Redis `ws:metrics:<day>` snapshots.

## 11) Canonical links

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/PHASE0_MVP_ADR.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- `docs/status/RTC_STABILITY_ROADMAP.md`
