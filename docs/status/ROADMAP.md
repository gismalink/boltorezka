# Boltorezka v2 Roadmap (links-only)

Этот roadmap хранит только ссылки на отдельные плановые/канонические документы.
Детали реализации и выполненные инкременты ведутся в `docs/status/FEATURE_LOG.md`.

Последняя синхронизация: `2026-03-07` (SFU Stage 3 closed in test, Stage 4 readiness active).

## Open workstreams

- RTC stability hardening (active): `docs/status/RTC_STABILITY_ROADMAP.md`.
- Phase 5 (iOS/macOS kickoff scope): `docs/plans/2026-03-04_PHASE5_IOS_MACOS_SCOPE_NOTE.md`.
- SFU migration decision package: `docs/plans/2026-03-06_SFU_MIGRATION_PLAN.md`.

## Recently completed

- Legacy static deprecation (Phase D): `docs/runbooks/legacy/LEGACY_PUBLIC_DEPRECATION_PLAN.md`.

### Phase 5 — iOS & macOS (open)

- [ ] Shared Swift package + базовые MVP-экраны.
- [ ] Lifecycle обработка audio interruptions/background.

### Phase 6 — Hardening & Release Readiness (open)

- [ ] Нагрузочные и reconnect/failure тесты.
- [ ] Security review (authz, rate limits, abuse prevention).
- [ ] Финальные runbook: deploy/smoke/rollback/incident response.

## Execution plan (open items only)

- [x] #6.1 RTC plan Phase 1: canonical media-state + `call.initial_state` replay в server/client контрактах.
- [x] #6.2 RTC plan Phase 2: negotiation manager + offer fairness queue + stable defaults.
- [x] #6.3 RTC plan Phase 3-4: RTC observability + smoke/postdeploy gates.
- [ ] #6 Выполнить hardening batch для Phase 6: reconnect/failure сценарии + security review checklist с evidence.
- [ ] #7 Сформировать финальный runbook bundle (`deploy/smoke/rollback/incident response`) и синхронизировать docs index.

## Sequencing decision (2026-03-06)

- Выбран путь: сразу стартуем `docs/status/RTC_STABILITY_ROADMAP.md` с Phase 1.
- Пункты `#6` и `#7` не откладываются, но идут как параллельный supporting workstream и закрываются по мере накопления evidence из RTC hardening.
- Политика релиза не меняется: `test` first, `prod` только после явного подтверждения.

## Canonical plans & policies

- Architecture baseline: `docs/architecture/ARCHITECTURE.md`.
- Phase 0 (MVP boundaries + ADR): `docs/architecture/PHASE0_MVP_ADR.md`.
- SFU migration decision package: `docs/plans/2026-03-06_SFU_MIGRATION_PLAN.md`.
- Phase 3 (Voice/WebRTC MVP policy): `docs/runbooks/PHASE3_VOICE_WEBRTC_MVP_POLICY.md`.
- Voice baseline runbook: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`.
- DB backup runbook: `docs/operations/DB_BACKUP_RUNBOOK.md`.
- Performance gate: `docs/operations/PERFORMANCE_GATE.md`.
- Pre-prod decision package: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`.
- Discord channel tree plan: `docs/plans/2026-02-28_DISCORD_CHANNEL_TREE_PLAN.md`.

## Status & evidence

- Current snapshot: `docs/status/STATUS.md`.
- Feature evidence log: `docs/status/FEATURE_LOG.md`.
- Feature log index (daily entries): `docs/status/feature-log/README.md`.
