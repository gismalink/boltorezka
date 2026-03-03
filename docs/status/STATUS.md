# Boltorezka Status Snapshot

## Текущее состояние (2026-03-03)

- Prod и test работают в GitOps-модели с test-first циклом; последние smoke в test — PASS.
- React web остаётся default UI path; deploy-скрипты используют API-only mode по умолчанию (`--no-deps`, `FULL_RECREATE=1` только по явному флагу).
- Voice baseline зафиксирован канонически (`relay + TURN TLS/TCP`) и дополнен live-применением audio quality updates через realtime event.
- Закрыт web UX hardening по media permissions: persistent denied banner + lock контролов + единый control bar (desktop/mobile).

## Канонические документы

- План и open tasks: `docs/status/ROADMAP.md`
- Реализованные изменения/evidence: `docs/status/FEATURE_LOG.md`
- Voice baseline runbook: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Pre-prod gate details: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
