# Phase 5 Scope Note — iOS/macOS (Post-MVP)

Дата фиксации: 2026-03-04  
Статус: Historical planning artifact (non-active)

> Важно: этот документ не отражает текущий delivery stack.
> Текущий active client stack: Web + Electron Desktop.
> Native iOS/macOS (SwiftUI) в активной разработке сейчас отсутствуют.

## 1) Purpose

Документ фиксирует стартовый scope `Phase 5` для iOS/macOS и минимальный bootstrap-контракт общего Swift package, без преждевременного расширения продуктового объёма.

## 2) MVP boundaries for Phase 5 handoff

### In scope (Phase 5 bootstrap)

- Общий Swift package как единый core слой для iOS/macOS:
  - `DatowaveCoreModels`
  - `DatowaveNetworking`
  - `DatowaveRealtime`
  - `DatowaveCallEngine`
- Базовые экраны (MVP-level):
  - auth/session entry,
  - room list + open room,
  - text timeline read/send,
  - voice connect/disconnect + mute/deafen controls.
- Единый wire-contract parity с web (`/v1/*` + WS envelope v1).

### Out of scope (for current handoff)

- Продвинутые video effects/UI parity с web.
- SFU migration и новая media topology.
- Push/callkit integrations, advanced background optimizations.

## 3) Shared package bootstrap contract

### 3.1 Core models

- Модели строго синхронизированы с backend/domain naming:
  - `User`, `Room`, `Message`, `PresenceMember`, `CallState`.
- Один источник правды для enum/state mapping (`room kind`, `presence`, `call status`).

### 3.2 Networking layer

- HTTP client:
  - supports `/v1` API contract,
  - bearer token/session refresh handling,
  - deterministic error envelope mapping.
- Realtime client:
  - WS envelope v1 (`type`, `requestId`, `payload`),
  - ack/nack handling,
  - reconnect with bounded exponential backoff.

### 3.3 Call engine baseline

- WebRTC config parity policy:
  - relay-first baseline for production-shaped networks,
  - TURN/STUN inputs from secure runtime config (no hardcoded secrets).
- Runtime controls parity:
  - connect/disconnect,
  - mute/deafen,
  - safe recovery after route/interruption events.

## 4) Non-functional constraints

- Security:
  - no secrets in repository,
  - auth/session and ws-ticket flows follow existing backend policy.
- Observability:
  - structured event logging for connect/reconnect/fail states,
  - minimal telemetry parity with web quality gates.
- Release discipline:
  - test-first remains mandatory,
  - no prod gating by Phase 5 deliverables until explicit decision update.

## 5) Acceptance criteria for “Phase 5 kickoff ready”

1. Scope and boundaries formally documented (this note).
2. Shared package module contract approved by backend/web parity review.
3. Initial backlog tickets decomposed by package/module responsibility.
4. Dependencies/risks recorded (auth, realtime, call engine, mobile lifecycle).

## 6) Canonical references

- Architecture baseline: `docs/architecture/ARCHITECTURE.md`
- Phase 0 boundaries/ADR: `docs/architecture/PHASE0_MVP_ADR.md`
- Voice baseline: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Phase 3 policy: `docs/runbooks/PHASE3_VOICE_WEBRTC_MVP_POLICY.md`
- Planning source: `docs/plans/2026-04-06_FULL_PROJECT_EXECUTION_PLAN.md`
