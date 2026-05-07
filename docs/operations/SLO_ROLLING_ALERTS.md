# SLO Rolling Alerts (5m/30m)

Дата: 2026-03-09  
Статус: active for `test` monitoring and pre-prod decision support

## 1) Purpose

This runbook introduces a lightweight rolling SLO monitor on top of `/v1/telemetry/summary` counters.
It produces:

- rolling window evaluation (`5m`, `30m`),
- alert status (`pass|alert`),
- report artifact: `.deploy/slo/last-slo-report.md`,
- env artifact: `.deploy/slo/last-slo-eval.env`.

## 2) Command

From repo root:

```bash
SLO_BASE_URL=https://test.datowave.com \
SLO_BEARER_TOKEN=<admin-bearer> \
npm run slo:check
```

Important:

- `SLO_BEARER_TOKEN` must be admin/super_admin (required by `/v1/telemetry/summary`).
- Do not commit token values.

Scheduler-friendly fallback (no secret in git):

- `SLO_BEARER_TOKEN_FILE=.deploy/smoke-auth-livekit-gate.env`
- `SLO_BEARER_TOKEN_FILE_KEY=SMOKE_TEST_BEARER_TOKEN`

## 3) Default thresholds

- `SLO_MIN_ACK_5M=20`
- `SLO_MIN_ACK_30M=80`
- `SLO_NACK_RATE_5M=0.12`
- `SLO_NACK_RATE_30M=0.08`
- `SLO_RECONNECT_SPIKE_30M=60`
- `SLO_INITIAL_STATE_LAG_AVG_MS_30M=15000`
- `SLO_LARGE_RETENTION_FAIL_30M_MAX=0`

Additional guard:
- rolling 30m sum of `chat_storage_large_retention_*_delete_fail` must stay `<= SLO_LARGE_RETENTION_FAIL_30M_MAX`.

In strict mode (`SLO_STRICT=1`), alert state exits non-zero.

## 4) Scheduler integration

Job file:

- `scripts/ops/scheduler/jobs/slo-rolling-gate.env`
- by default this job uses `SLO_BEARER_TOKEN_FILE` fallback instead of hardcoded token.

Run manually:

```bash
bash ./scripts/ops/scheduler/run-job.sh slo-rolling-gate
```

Install periodic launchd task (example every 5 minutes):

```bash
bash ./scripts/ops/scheduler/install-launchd-job.sh \
  --job-id slo-rolling-gate \
  --interval 300
```

## 5) Artifacts for pre-prod package

Collect before sign-off:

- `.deploy/slo/last-slo-report.md`
- `.deploy/slo/last-slo-eval.env`
- latest `.deploy/last-smoke-summary.env`

Use these artifacts together with smoke/compare evidence in:

- `docs/runbooks/PREPROD_DECISION_PACKAGE.md`

## 6) Notes and limits

- Source endpoint is counter-based, so rolling windows are derived from snapshot deltas.
- Fresh monitoring quality depends on regular scheduler cadence (recommended: 5 minutes).
- Keep retention bounded (`SLO_RETENTION_MINUTES`, default 1440).
