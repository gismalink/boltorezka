# Boltorezka Status Snapshot

Дата: 2026-02-28
Обновляется вручную как короткий single-pane summary.

## Release/Gate

- Текущий статус: **NO-GO** для `prod`.
- Причина: не заполнены owner/sign-off поля в pre-prod gate.
- `prod` допускается только из `origin/main` после explicit approval.

## Latest verified test evidence

- Branch: `origin/feature/web-header-profile-menu`
- Last verified test deploy SHA: `c52890d`
- Smoke status:
  - `smoke:sso` — PASS
  - `smoke:realtime` — PASS
  - `reconnectOk=true`
  - `smoke:web:e2e` — PASS
  - `SMOKE_CALL_SIGNAL=1` relay — PASS

## Roadmap quick state

- Contracts/docs milestone (Phase 1) — complete.
- Realtime MVP core (Phase 2) — complete.
- React web productionization (Phase 4) — in progress.
- Voice/WebRTC production readiness (Phase 3) — pending.
- Hardening/release readiness (Phase 6) — pending.

## Open items to reach GO

1. Зафиксировать `Release Owner` и `Rollback Owner`.
2. Зафиксировать rollback ref (`known-good main SHA`).
3. Подтвердить target ref `origin/main@<sha>` для prod rollout.
4. Получить explicit `GO` и выполнить rollout по runbook.

## Canonical refs

- `docs/ROADMAP.md`
- `docs/PREPROD_DECISION_PACKAGE.md`
- `docs/PREPROD_CHECKLIST.md`
- `docs/FEATURE_LOG.md`
