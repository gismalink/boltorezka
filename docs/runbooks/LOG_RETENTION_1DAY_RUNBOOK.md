# LOG_RETENTION_1DAY_RUNBOOK

Purpose: enforce max 1-day retention for boltorezka operational logs on macOS server.

## Scope

- `~/srv/boltorezka/.deploy/*.log|*.tsv|*.out|*.err`
- `~/srv/edge/logs/*.log|*.out|*.err`
- `/tmp/sfu-media-smoke*.log`, `/tmp/deploy-sfu*.log`, `/tmp/boltorezka-smoke*.log`

## Script

- Cleaner script: `scripts/ops/cleanup-server-logs.sh`
- Retention setting: `LOG_RETENTION_DAYS` (default `1`)

Manual run:

```bash
cd ~/srv/boltorezka
bash ./scripts/ops/cleanup-server-logs.sh
```

## Periodic Run (launchd)

- LaunchAgent template: `infra/launchd/com.boltorezka.log-cleanup.plist`
- Installer script: `scripts/ops/install-log-cleanup-launchd.sh`

Install/refresh on server:

```bash
cd ~/srv/boltorezka
bash ./scripts/ops/install-log-cleanup-launchd.sh
```

Verify agent:

```bash
launchctl print "gui/$(id -u)/com.boltorezka.log-cleanup" | sed -n '1,80p'
```

## Notes

- Docker Desktop JSON log files are managed by Docker internals on macOS host and are not directly pruned by this script.
- This policy targets repository and operational log artifacts we control directly.
