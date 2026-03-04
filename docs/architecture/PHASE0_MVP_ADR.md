# Phase 0 — MVP Boundaries & ADR (Canonical)

Дата фиксации: 2026-03-04  
Статус: Approved for current MVP scope

## 1) MVP boundaries (approved)

### 1.1 Participants / room scale (MVP)

- Voice/video runtime remains P2P-first with TURN relay baseline.
- Practical planning envelope for current contour:
  - voice/chat active room target: up to `~50` relay-active participants in conservative mode,
  - elevated test profile reached higher synthetic values, but product limit для MVP фиксируем консервативно.
- For larger groups, MVP policy: split into multiple rooms/channels instead of single oversized call session.

### 1.2 Retention (MVP)

- Message and room data retention is DB-backed with standard operational backups.
- Ephemeral realtime artifacts (presence/ws-ticket/session routing) are Redis-scoped and intentionally short-lived.
- No additional long-term media retention pipeline is included in MVP scope.

### 1.3 Platforms (MVP)

- Primary GA target in current MVP cycle: Web.
- iOS/macOS are planned phases (post-MVP) and not part of current release gate.

## 2) ADR summary (approved)

### ADR-001: Signaling architecture

- Decision: single backend runtime (`boltorezka-api`) handles HTTP API + WS signaling.
- Rationale: lower operational complexity, simpler ownership, sufficient current scale.
- Consequence: revisit split-service architecture only after measured scale pressure.

### ADR-002: Media topology

- Decision: WebRTC P2P with TURN relay baseline (`relay + turns:gismalink.art:5349?transport=tcp`).
- Rationale: robust path for restrictive/mobile networks and predictable behavior in test/prod.
- Consequence: explicit room-size constraints remain required; SFU path stays post-MVP evolution.

### ADR-003: Auth/session model

- Decision: SSO-first auth (`AUTH_MODE=sso`) + local JWT session + short-lived ws-ticket for realtime handshake.
- Rationale: centralized identity flow, clear boundary between web session and realtime connect ticket.
- Consequence: smoke/deploy gate must validate SSO + ws-ticket/realtime path on every rollout.

## 3) Canonical references

- Architecture baseline: `docs/architecture/ARCHITECTURE.md`
- Voice baseline: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Pre-prod gate: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
- Test/load evidence: `docs/status/TEST_RESULTS.md`

## 4) Out of scope for this Phase 0 package

- Final SFU architecture selection and migration timeline.
- Platform-specific iOS/macOS lifecycle hardening.
- Full production abuse/security hardening package (tracked in later phases).
