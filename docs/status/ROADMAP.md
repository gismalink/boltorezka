# Boltorezka v2 Roadmap (links-only)

Этот roadmap хранит только ссылки на отдельные плановые/канонические документы.
Детали реализации и выполненные инкременты ведутся в `docs/status/FEATURE_LOG.md`.

## Open workstreams

- Phase 5 (iOS/macOS kickoff scope): `docs/plans/PHASE5_IOS_MACOS_SCOPE_NOTE.md`.
- Legacy static deprecation: `docs/runbooks/LEGACY_PUBLIC_DEPRECATION_PLAN.md`.

### Phase 5 — iOS & macOS (open)

- [ ] Shared Swift package + базовые MVP-экраны.
- [ ] Lifecycle обработка audio interruptions/background.

### Phase 6 — Hardening & Release Readiness (open)

- [ ] Нагрузочные и reconnect/failure тесты.
- [ ] Security review (authz, rate limits, abuse prevention).
- [ ] Финальные runbook: deploy/smoke/rollback/incident response.

## Execution plan (open items only)

- [x] Legacy deprecation — Phase D: подготовить decommission change-set для сворачивания runtime-coupling API/static после стабилизации cutover.
- [ ] Legacy deprecation — Phase D: провести test rehearsal decommission + rollback по runbook и зафиксировать evidence.
- [ ] Legacy deprecation — Phase D: после стабилизации обновить финальные runbooks/contracts/release note по итоговому статусу deprecation.
- [ ] #6 Выполнить hardening batch для Phase 6: reconnect/failure сценарии + security review checklist с evidence.
- [ ] #7 Сформировать финальный runbook bundle (`deploy/smoke/rollback/incident response`) и синхронизировать docs index.

## Canonical plans & policies

- Architecture baseline: `docs/architecture/ARCHITECTURE.md`.
- Phase 0 (MVP boundaries + ADR): `docs/architecture/PHASE0_MVP_ADR.md`.
- Phase 3 (Voice/WebRTC MVP policy): `docs/runbooks/PHASE3_VOICE_WEBRTC_MVP_POLICY.md`.
- Voice baseline runbook: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`.
- Performance gate: `docs/operations/PERFORMANCE_GATE.md`.
- Pre-prod decision package: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`.
- Discord channel tree plan: `docs/plans/DISCORD_CHANNEL_TREE_PLAN.md`.

## Status & evidence

- Current snapshot: `docs/status/STATUS.md`.
- Feature evidence log: `docs/status/FEATURE_LOG.md`.
- Feature log index (daily entries): `docs/status/feature-log/README.md`.
