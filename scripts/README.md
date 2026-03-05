# Scripts Map

This folder contains operational scripts grouped by purpose.

## Quick Navigation

- `deploy/`:
  - `deploy-test-from-ref.sh` - deploy test from a git ref.
  - `deploy-test-and-smoke.sh` - deploy test and run post-deploy smoke.
  - `deploy-prod-from-ref.sh` - deploy prod from a git ref.
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
  - `smoke-auth-bootstrap.sh` - bootstrap test users/tokens for smoke.
- root scripts:
  - `verify-all.sh` - single local entrypoint for verify + optional smoke toggles.
  - `ws-load.mjs` - websocket load generator for room/chat traffic.

## Common Flows

- Fast test rollout + smoke:
  - `TEST_REF=origin/feature/<name> npm run deploy:test:smoke`
- Test-only post-deploy smoke:
  - `npm run smoke:test:postdeploy`
- Prod rollout (only after test validation):
  - `PROD_REF=origin/main npm run deploy:prod`
- Local verify pipeline:
  - `npm run check`

## Notes

- Keep test-first: use `deploy:test:smoke` before any prod rollout.
- Prefer scripts over manual command chains for reproducible operations.
- `scripts/examples/` is intentionally not used for active runbooks; canonical scripts are in `deploy/` and `smoke/`.
