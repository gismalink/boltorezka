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
  - `smoke-sso-routing.mjs` - SSO start/logout redirect contract smoke.
  - `smoke-domain-redirect-map.mjs` - legacy->datowave redirect map smoke with path/query checks.
  - `smoke-realtime.mjs` - WS protocol and signaling baseline smoke.
  - `smoke-web-version-cache.mjs` - version/cache compatibility smoke.
  - `smoke-web-static-contract.mjs` - static web contract smoke.
  - `smoke-web-denied-media.mjs` - denied media state smoke.
  - `smoke-web-denied-media-browser.mjs` - browser denied media smoke.
  - `smoke-web-e2e.sh` - end-to-end browser smoke.
  - `smoke-auth-link-hosts.mjs` - validate reset/verify/invite links use allowed datowave hosts (manual links or synthetic auto mode).
  - `smoke-auth-bootstrap.sh` - bootstrap test users/tokens for smoke (supports optional third user for 3-way race checks).
- root scripts:
  - `verify-all.sh` - single local entrypoint for verify + optional smoke toggles.
  - `ws-load.mjs` - websocket load generator for room/chat traffic.
- `ops/`:
  - `backup-postgres-all.sh` - backup all Postgres DBs (test/prod) to host storage outside Docker.
  - `cleanup-server-logs.sh` - prune operation logs by retention policy.
  - `chat-legacy-inline-cleanup.sh` - one-off reversible cleanup of legacy inline `data:image/...;base64` payloads in chat messages.
  - `chat-orphan-cleanup.sh` - periodic cleanup of orphan chat attachment objects via admin API.
  - `rotate-turn-credentials.sh` - rotate TURN static credentials in `infra/.env.host` and write rotation marker/history files.
  - `bootstrap-vps-ssh-key.sh` - interactive SSH key bootstrap for new VPS hosts.
  - `provision-turn2-vps.sh` - provision dedicated TURN2 server on VPS (Docker + certbot + ufw).
  - `provision-turn2-vps-native.sh` - provision dedicated TURN2 directly on host (coturn systemd, swap tuning, optional Docker cleanup) for low-memory VPS.
  - `livekit-test-up.sh` - start LiveKit in test profile (`livekit-test`).
  - `livekit-test-check.sh` - check LiveKit test status and logs.
  - `livekit-test-down.sh` - stop LiveKit test service.
  - `scheduler/` - portable scheduled jobs interface (job manifests, runner, launchd adapter).

## Common Flows

  - `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`
  - `npm run smoke:test:postdeploy`
  - `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:update-feed`
  - `npm run smoke:redirect-map` (default: test redirect cases)
  - `SMOKE_REDIRECT_SCOPE=prod npm run smoke:redirect-map` (prod redirect cases)
  - `SMOKE_AUTH_LINK_URLS='<url1>,<url2>' npm run smoke:auth:links`
  - `npm run smoke:auth:links:auto` (synthetic invite/reset/verify links on datowave host)
  - `TEST_REF=origin/feature/<name> npm run deploy:test:livekit`
  - `PROD_REF=origin/main npm run deploy:prod`
  - `DESKTOP_REF=origin/feature/<name> DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.datowave.com npm run deploy:desktop:server`
  - `DESKTOP_REF=origin/main DESKTOP_CHANNEL=test DESKTOP_SIGNING_MODE=unsigned DESKTOP_PUBLIC_BASE_URL=https://test.datowave.com npm run deploy:desktop:server`
  - `npm run check`
  - `npm run scheduler:list`
  - `npm run scheduler:run -- backup-postgres-all`
  - `TURN_ROTATE_APPLY=1 npm run turn:rotate`
  - `npm run livekit:test:up`
  - `npm run livekit:test:check`

 Публикация desktop артефактов в edge static web-root (`ingress/static/boltorezka/<channel>/desktop/<channel>/<sha>/...`) + генерация `latest.json`
 - Для electron-updater дополнительно формируется `ingress/static/boltorezka/<channel>/desktop/<channel>/mac/latest-mac.yml` и копируются `*-mac.zip` + `*.blockmap`.

- Keep test-first: use `deploy:test:smoke` before any prod rollout.
  - `npm run scheduler:run -- backup-postgres-all`
