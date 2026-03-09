# TURN Credential Rotation Runbook

Purpose: rotate static TURN credentials on host env by schedule and keep an auditable freshness marker for postdeploy smoke gates.

## Scope

- Environment file: `infra/.env.host`
- Variables rotated:
  - `TURN_USERNAME`
  - `TURN_PASSWORD`
- Optional synchronized values:
  - `TEST_VITE_RTC_ICE_SERVERS_JSON`
  - `PROD_VITE_RTC_ICE_SERVERS_JSON`

## Rotation Script

- Script: `scripts/ops/rotate-turn-credentials.sh`
- NPM shortcut: `npm run turn:rotate`

Dry-run (default, no write):

```bash
cd ~/srv/boltorezka
npm run turn:rotate
```

Apply rotation:

```bash
cd ~/srv/boltorezka
TURN_ROTATE_APPLY=1 npm run turn:rotate
```

## Scheduler Integration

- Job manifest: `scripts/ops/scheduler/jobs/turn-credentials-rotate.env`
- Default schedule: every 28 days (`2419200` seconds)
- Install/update launchd job:

```bash
cd ~/srv/boltorezka
bash ./scripts/ops/scheduler/install-launchd-job.sh turn-credentials-rotate
```

Verify launchd registration:

```bash
launchctl print "gui/$(id -u)/com.boltorezka.scheduler.turn-credentials-rotate" | sed -n '1,80p'
```

## Metadata and Audit

On successful rotation the script writes:

- Freshness marker: `.deploy/turn-credentials-last-rotation.env`
  - `TURN_ROTATED_AT_UTC`
  - `TURN_ROTATE_ENV_FILE`
  - `TURN_ROTATED_USERNAME_SHA256`
  - `TURN_ROTATED_BY`
- History append log: `.deploy/turn-credentials-rotation.log`

Secrets are not logged to stdout and are not written to audit logs.

## Smoke Gate Coupling

`postdeploy-smoke-test.sh` checks rotation freshness by default:

- Marker file: `.deploy/turn-credentials-last-rotation.env`
- Maximum age: `SMOKE_TURN_ROTATION_MAX_AGE_DAYS=35`
- Strict mode: `SMOKE_TURN_ROTATION_STRICT=1`

If marker is missing or stale, smoke fails in strict mode.

## Operational Notes

- Keep test-first policy for rollout validation after credential rotation.
- Do not commit host env files or generated rotation metadata to git.
- If ICE JSON values are managed elsewhere, set `TURN_ROTATE_UPDATE_ICE_JSON=0` and update those values via your secret/config workflow.
