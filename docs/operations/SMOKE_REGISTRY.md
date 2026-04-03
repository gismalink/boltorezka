# Smoke Registry

Короткий справочник по статусу smoke-команд.

## Active (в регулярных gate)

- `smoke:sso`
- `smoke:api`
- `smoke:auth:session`
- `smoke:auth:cookie-negative`
- `smoke:auth:cookie-ws-ticket`
- `smoke:web:version-cache`
- `smoke:web:crash-boundary:browser`
- `smoke:realtime`
- `smoke:desktop:update-feed`
- `smoke:multiserver:age-gate`
- `smoke:multiserver:role-matrix`

## Canary / Optional (включать по флагу или по задаче)

- `smoke:web:rnnoise:browser`
  - postdeploy default: `SMOKE_WEB_RNNOISE_BROWSER=0`
  - smoke:all default: `SMOKE_ALL_RUN_RNNOISE_BROWSER=0`
- `smoke:chat:object-storage`
- `smoke:chat:orphan-cleanup`
- `smoke:minio:storage`
- `smoke:realtime:media`
- `smoke:livekit:media`
- `smoke:livekit:token-flow`

## Retired

- `scripts/deploy/deploy-test-sfu-default.sh` (retired)
- `scripts/smoke/compare-p2p-sfu-baseline.sh` (retired)
- `scripts/smoke/compare-sfu-livekit-baseline.sh` (retired)

## Правило актуализации

- Любое изменение default-gate в `scripts/deploy/postdeploy-smoke-test.sh` или `scripts/smoke/run-all-smokes.sh` синхронно отражать в этом реестре и в `docs/operations/SMOKE_CI_MATRIX.md`.
