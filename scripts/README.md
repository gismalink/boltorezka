# Scripts Map

This folder contains operational scripts grouped by purpose.

## Quick Navigation

- `deploy/`:
  - `deploy-test-from-ref.sh` - deploy test from a git ref.
  - `deploy-test-and-smoke.sh` - deploy test and run post-deploy smoke.
  - `deploy-prod-from-ref.sh` - deploy prod from a git ref.
  - `build-desktop-server-and-publish.sh` - build desktop artifacts on server and publish into edge static downloads + channel manifest.
  - `postdeploy-smoke-test.sh` - server-side smoke suite after deploy.
  - `seed-chatset.sql` - idempotent SQL seed for chat/category baseline.
- `smoke/`:
  - `smoke-api.mjs` - API contract smoke.
  - `smoke-sso-redirect.mjs` - SSO redirect/mode smoke.
  - `smoke-realtime.mjs` - WS protocol and signaling baseline smoke.
  - `smoke-web-version-cache.mjs` - version/cache compatibility smoke.
  - `smoke-web-static-contract.mjs` - static web contract smoke.
  - `smoke-web-denied-media.mjs` - denied media state smoke.
  - `smoke-web-denied-media-browser.mjs` - browser denied media smoke.
  - `smoke-web-e2e.sh` - end-to-end browser smoke.
  - `smoke-auth-bootstrap.sh` - bootstrap test users/tokens for smoke (supports optional third user for 3-way race checks).
- root scripts:
  - `verify-all.sh` - single local entrypoint for verify + optional smoke toggles.
  - `ws-load.mjs` - websocket load generator for room/chat traffic.
- `ops/`:
  - `backup-postgres-all.sh` - backup all Postgres DBs (test/prod) to host storage outside Docker.
  - `cleanup-server-logs.sh` - prune operation logs by retention policy.
  - `rotate-turn-credentials.sh` - rotate TURN static credentials in `infra/.env.host` and write rotation marker/history files.
  - `livekit-test-up.sh` - start LiveKit in test profile (`livekit-test`).
  - `livekit-test-check.sh` - check LiveKit test status and logs.
  - `livekit-test-down.sh` - stop LiveKit test service.
  - `scheduler/` - portable scheduled jobs interface (job manifests, runner, launchd adapter).

## Common Flows

  - `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`
  - `npm run smoke:test:postdeploy`
  - `TEST_REF=origin/feature/<name> npm run deploy:test:livekit`
  - `PROD_REF=origin/main npm run deploy:prod`
  - `DESKTOP_REF=origin/feature/<name> DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art npm run deploy:desktop:server`
  - `npm run check`
  - `npm run scheduler:list`
  - `npm run scheduler:run -- backup-postgres-all`
  - `TURN_ROTATE_APPLY=1 npm run turn:rotate`
  - `npm run livekit:test:up`
  - `npm run livekit:test:check`

 Публикация desktop артефактов в edge static web-root (`ingress/static/boltorezka/<channel>/desktop/<channel>/<sha>/...`) + генерация `latest.json`

- Keep test-first: use `deploy:test:smoke` before any prod rollout.
  - `npm run scheduler:run -- backup-postgres-all`
