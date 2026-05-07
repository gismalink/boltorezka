# Scheduler Portability Runbook

Purpose: manage recurring operational jobs through a single manifest interface with consistent execution logs, while allowing different schedulers (launchd now, cron/systemd later).

## 1) Interface and layout

Source of truth:
- Job manifests: `scripts/ops/scheduler/jobs/*.env`

Execution runtime:
- Runner: `scripts/ops/scheduler/run-job.sh`
- Shared config helpers: `scripts/ops/scheduler/common.sh`
- Job list: `scripts/ops/scheduler/list-jobs.sh`

launchd adapter (macOS):
- Plist renderer: `scripts/ops/scheduler/render-launchd-plist.sh`
- Installer: `scripts/ops/scheduler/install-launchd-job.sh`

## 2) Job manifest contract

Required fields:
- `JOB_ID` - unique stable id (`[a-z0-9._-]`)
- `JOB_COMMAND` - command executed via `bash -lc` in `JOB_WORKDIR`

Optional fields:
- `JOB_ENABLED` - `1` (default) or `0`
- `JOB_WORKDIR` - default `~/srv/datowave`
- `JOB_TIMEOUT_SECONDS` - optional timeout
- `JOB_LOG_RETENTION_DAYS` - per-job log retention (default `14`)
- `JOB_SCHEDULE_KIND` - scheduling hint (currently `interval` used by launchd adapter)
- `JOB_SCHEDULE_VALUE` - interval in seconds when `JOB_SCHEDULE_KIND=interval`
- `JOB_ENV_<KEY>` - exported to runtime environment as `<KEY>`

Current manifests:
- `scripts/ops/scheduler/jobs/backup-postgres-all.env`
- `scripts/ops/scheduler/jobs/chat-large-retention-cleanup.env`
- `scripts/ops/scheduler/jobs/chat-orphan-cleanup.env`
- `scripts/ops/scheduler/jobs/cleanup-server-logs.env`
- `scripts/ops/scheduler/jobs/slo-rolling-gate.env`
- `scripts/ops/scheduler/jobs/turn-credentials-rotate.env`

## 3) Logging model

Structured execution log:
- `~/.deploy/scheduler/executions.ndjson`

Per-run stdout/stderr logs:
- `~/.deploy/scheduler/logs/<job-id>/<timestamp>.out.log`
- `~/.deploy/scheduler/logs/<job-id>/<timestamp>.err.log`

Runner guarantees:
- Lock per job (`/tmp/datowave-scheduler-<job-id>.lock`) to avoid overlapping runs.
- `started` and final (`success`/`failed`/`skipped_locked`) events in NDJSON.
- Per-job log retention cleanup.

## 4) Manual operations

List registered jobs:

```bash
cd ~/srv/datowave
bash ./scripts/ops/scheduler/list-jobs.sh
```

Run one job immediately:

```bash
cd ~/srv/datowave
bash ./scripts/ops/scheduler/run-job.sh backup-postgres-all
```

Inspect latest executions:

```bash
tail -n 30 ~/srv/datowave/.deploy/scheduler/executions.ndjson
```

## 5) Install on macOS launchd

Per job install/update:

```bash
cd ~/srv/datowave
bash ./scripts/ops/scheduler/install-launchd-job.sh backup-postgres-all
bash ./scripts/ops/scheduler/install-launchd-job.sh chat-large-retention-cleanup
bash ./scripts/ops/scheduler/install-launchd-job.sh chat-orphan-cleanup
bash ./scripts/ops/scheduler/install-launchd-job.sh cleanup-server-logs
bash ./scripts/ops/scheduler/install-launchd-job.sh slo-rolling-gate
bash ./scripts/ops/scheduler/install-launchd-job.sh turn-credentials-rotate
```

Verification:

```bash
launchctl print "gui/$(id -u)/com.datowave.scheduler.backup-postgres-all" | sed -n '1,80p'
launchctl print "gui/$(id -u)/com.datowave.scheduler.chat-large-retention-cleanup" | sed -n '1,80p'
launchctl print "gui/$(id -u)/com.datowave.scheduler.chat-orphan-cleanup" | sed -n '1,80p'
launchctl print "gui/$(id -u)/com.datowave.scheduler.cleanup-server-logs" | sed -n '1,80p'
launchctl print "gui/$(id -u)/com.datowave.scheduler.slo-rolling-gate" | sed -n '1,80p'
launchctl print "gui/$(id -u)/com.datowave.scheduler.turn-credentials-rotate" | sed -n '1,80p'
```

## 6) Portability guidance for new servers

The manifest (`jobs/*.env`) stays unchanged across platforms; only adapter changes.

- launchd (current): `install-launchd-job.sh`
- cron/systemd (future): create thin adapter that reads same manifest fields and calls `run-job.sh <job-id>`

Recommended migration order:
1. Sync repository to new server.
2. Verify jobs with manual `run-job.sh`.
3. Implement/install host scheduler adapter.
4. Validate `executions.ndjson` and per-run logs after first automatic triggers.

## 7) Safety notes

- Keep secrets out of manifest files and git. Use host env or scheduler-specific secure env injection.
- Use absolute host paths in job commands only when required by target scheduler.
- Keep test-first policy for any scheduler changes that affect deploy/production operations.
