# LOG_RETENTION_1DAY_RUNBOOK

Purpose: enforce max 1-day retention for datowave operational logs on macOS server.

## Scope

- `~/srv/datowave/.deploy/*.log|*.tsv|*.out|*.err`
- `~/srv/edge/logs/*.log|*.out|*.err`
- `/tmp/livekit-media-smoke*.log`, `/tmp/deploy-livekit*.log`, `/tmp/datowave-smoke*.log`

## Script

- Cleaner script: `scripts/ops/cleanup-server-logs.sh`
- Retention setting: `LOG_RETENTION_DAYS` (default `1`)

Manual run:

```bash
cd ~/srv/datowave
bash ./scripts/ops/cleanup-server-logs.sh
```

## Periodic Run (launchd)

- Preferred installer: `scripts/ops/scheduler/install-launchd-job.sh cleanup-server-logs`
- Source-of-truth job manifest: `scripts/ops/scheduler/jobs/cleanup-server-logs.env`

Install/refresh on server:

```bash
cd ~/srv/datowave
bash ./scripts/ops/scheduler/install-launchd-job.sh cleanup-server-logs
```

Verify agent:

```bash
launchctl print "gui/$(id -u)/com.datowave.scheduler.cleanup-server-logs" | sed -n '1,80p'
```

Execution history:

```bash
tail -n 30 ~/srv/datowave/.deploy/scheduler/executions.ndjson
```

## Notes

- Docker Desktop JSON log files are managed by Docker internals on macOS host and are not directly pruned by this script.
- This policy targets repository and operational log artifacts we control directly.
