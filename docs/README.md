# Docs Index

## Structure

- `status/` — status snapshot, roadmap, feature evidence log
  - [STATUS](status/STATUS.md)
  - [ROADMAP](status/ROADMAP.md)
  - [FEATURE_LOG](status/FEATURE_LOG.md)
  - [TEST_RESULTS](status/TEST_RESULTS.md)
  - [FEATURE_LOG_INDEX](status/feature-log/README.md)
  - [2026-03-02_TAILWIND_ZERO_SCSS_CHECKLIST](status/checklists/2026-03-02_TAILWIND_ZERO_SCSS_CHECKLIST.md)
- `runbooks/` — operational checklists and rollout/deploy runbooks
  - [RUNBOOK_TEST_DEPLOY](runbooks/RUNBOOK_TEST_DEPLOY.md)
  - [RUNBOOK_TEST_ROLLOUT_QUICKSTART](runbooks/RUNBOOK_TEST_ROLLOUT_QUICKSTART.md)
  - [SFU_STAGE1_DARK_LAUNCH_RUNBOOK](runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md)
  - [SFU_STAGE2_CANARY_RUNBOOK](runbooks/SFU_STAGE2_CANARY_RUNBOOK.md)
  - [SFU_STAGE3_DEFAULT_SFU_TEST_RUNBOOK](runbooks/SFU_STAGE3_DEFAULT_SFU_TEST_RUNBOOK.md)
  - [SFU_STAGE4_PROD_READINESS_PACKAGE](runbooks/SFU_STAGE4_PROD_READINESS_PACKAGE.md)
  - [LIVEKIT_TEST_FOUNDATION_RUNBOOK](runbooks/LIVEKIT_TEST_FOUNDATION_RUNBOOK.md)
  - [VOICE_BASELINE_RUNBOOK](runbooks/VOICE_BASELINE_RUNBOOK.md)
  - [PHASE3_VOICE_WEBRTC_MVP_POLICY](runbooks/PHASE3_VOICE_WEBRTC_MVP_POLICY.md)
  - [LOG_RETENTION_1DAY_RUNBOOK](runbooks/LOG_RETENTION_1DAY_RUNBOOK.md)
  - [PREPROD_CHECKLIST](runbooks/PREPROD_CHECKLIST.md)
  - [PREPROD_DECISION_PACKAGE](runbooks/PREPROD_DECISION_PACKAGE.md)
  - [workflow-checklist](runbooks/workflow-checklist.md)
  - [legacy runbooks index](runbooks/legacy/README.md)
- `contracts/` — HTTP/WS contracts and OpenAPI artifact
  - [API_CONTRACT_V1](contracts/API_CONTRACT_V1.md)
  - [WS_CONTRACT_V1](contracts/WS_CONTRACT_V1.md)
  - [SFU_SESSION_CONTRACT](contracts/SFU_SESSION_CONTRACT.md)
  - [OPENAPI_V1](contracts/OPENAPI_V1.yaml)
- `operations/` — smoke/CI matrices and operational quality gates
  - [DB_BACKUP_RUNBOOK](operations/DB_BACKUP_RUNBOOK.md)
  - [SCHEDULER_PORTABILITY_RUNBOOK](operations/SCHEDULER_PORTABILITY_RUNBOOK.md)
  - [SMOKE_CI_MATRIX](operations/SMOKE_CI_MATRIX.md)
  - [FRONTEND_VERSIONING_POLICY](operations/FRONTEND_VERSIONING_POLICY.md)
  - [PERFORMANCE_GATE](operations/PERFORMANCE_GATE.md)
- `architecture/` — architecture-level documentation
  - [ARCHITECTURE](architecture/ARCHITECTURE.md)
  - [PHASE0_MVP_ADR](architecture/PHASE0_MVP_ADR.md)
  - [AUTH_SESSION_STORAGE_ADR_2026-03-11](architecture/2026-03-11_ADR_AUTH_SESSION_STORAGE.md)
  - [RNNOISE_CLIENT_TECH_DESIGN_2026-03-12](architecture/2026-03-12_RNNOISE_CLIENT_TECH_DESIGN.md)
- `plans/` — scoped design/product plans
  - [SFU_MIGRATION_PLAN](plans/2026-03-06_SFU_MIGRATION_PLAN.md)
  - [SFU_STAGE0_EXECUTION_PLAN](plans/2026-03-06_SFU_STAGE0_EXECUTION_PLAN.md)
  - [SESSION_COOKIE_CUTOVER_CHECKLIST_2026-03-11](plans/2026-03-11_SESSION_COOKIE_CUTOVER_CHECKLIST.md)
  - [DISCORD_CHANNEL_TREE_PLAN](plans/2026-02-28_DISCORD_CHANNEL_TREE_PLAN.md)
  - [2026-03_TEST_PLAN_MVP_LOAD](plans/2026-03-02_TEST_PLAN_MVP_LOAD.md)
  - [PHASE5_IOS_MACOS_SCOPE_NOTE](plans/2026-03-04_PHASE5_IOS_MACOS_SCOPE_NOTE.md)

## Legacy policy

- Закрытые/исторические runbook-документы переносятся в `docs/runbooks/legacy/`.
- Legacy-документы не удаляются, если в них есть release evidence или исторические ссылки из `status/feature-log`.
