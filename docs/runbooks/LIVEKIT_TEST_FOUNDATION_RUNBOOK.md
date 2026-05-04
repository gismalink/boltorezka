# LiveKit Test Foundation Runbook

Purpose: validate LiveKit runtime in `test` contour and keep rollout gates aligned with current livekit-only baseline.

Scope:
- `test` only.
- GitOps-first.
- No `prod` rollout in this runbook.

## 1) Preconditions

- Branch with LiveKit foundation changes is deployed to `~/srv/datowave` in `test`.
- `infra/.env.host` contains:
  - `LIVEKIT_TEST_API_KEY`
  - `LIVEKIT_TEST_API_SECRET`
  - `TEST_LIVEKIT_SIGNAL_PORT`
  - `TEST_LIVEKIT_TCP_PORT`
  - `TEST_LIVEKIT_RTC_PORT_START`
  - `TEST_LIVEKIT_RTC_PORT_END`
- Router/NAT has UDP forward for configured LiveKit RTC range.

Recommended baseline (validated):
- `TEST_LIVEKIT_RTC_PORT_START=34000`
- `TEST_LIVEKIT_RTC_PORT_END=34999`
- `TEST_LIVEKIT_TCP_PORT=7881`
- `LIVEKIT_TEST_API_SECRET` length >= 32 chars

## 2) Deploy foundation in test

On server:

```bash
cd ~/srv/datowave
npm run livekit:test:up
```

Verify service + logs:

```bash
cd ~/srv/datowave
npm run livekit:test:check
```

Expected:
- `datowave-livekit-test` is `Up`.
- Logs do not contain repeated fatal bootstrap errors.

## 3) Routing baseline

Current runtime baseline is livekit-only.

Operational checks in `test` should confirm:
- `TEST_LIVEKIT_ENABLED=1` (or env-specific equivalent in host profile),
- realtime smoke reports `expectedMediaTopology=livekit`,
- no legacy topology override variables are used in active deploy profile.

## 3.1) Stage B token minting check

Enable API-side tokening in `test` env:

```bash
TEST_LIVEKIT_ENABLED=1
TEST_LIVEKIT_URL=ws://<public-ip-or-domain>:7880
TEST_LIVEKIT_TOKEN_TTL_SEC=1800
```

Smoke call (requires bearer token):

```bash
curl -X POST "https://test.datowave.com/v1/auth/livekit-token" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  --data '{"roomSlug":"test-room"}'
```

Expected response fields:
- `token`
- `url`
- `room`
- `identity`
- `expiresInSec`

## 4) Rollback (test)

Stop LiveKit service only:

```bash
cd ~/srv/datowave
npm run livekit:test:down
```

Re-check compose state:

```bash
docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host ps
```

## 5) Operational notes

- Keep LiveKit secrets only in host env (`infra/.env.host`), never in git.
- If ports conflict, adjust `TEST_LIVEKIT_*` in env and re-run `livekit:test:up`.
- For deploy windows use GitOps scripts from `~/srv/edge/scripts/*` per server policy.

## 6) Strict routing policy (current)

Current ingress policy is strict and clean:
- only `/rtc*` is supported for LiveKit signaling,
- deprecated `/livekit/rtc*` paths return explicit `404`,
- `/rtc/v1*` is bridged to `/rtc*` to suppress client fallback 404 noise with current LiveKit server profile.

Required alignment:
- API `livekit-token` response must return base signal URL (without `/livekit` suffix),
- web runtime must connect via returned base URL,
- any environment still returning `/livekit` is considered misconfigured and must be fixed at source.

Operational verification:
1. `https://<domain>/rtc/validate` returns `401`.
2. `https://<domain>/rtc/v1/validate` returns `401`.
3. `https://<domain>/livekit/rtc/validate` returns `404`.
4. Postdeploy smoke remains green (`SMOKE_STATUS=pass`, `SMOKE_LIVEKIT_GATE_STATUS=pass`, `SMOKE_LIVEKIT_MEDIA_STATUS=pass`).

## 6) Exit checklist: remove compatibility bridge

Use this checklist before deleting `/rtc/v1* -> /rtc*` rewrite rules in edge ingress.

1. Upgrade `livekit/livekit-server` image in `infra/docker-compose.host.yml` for both `livekit-test` and `livekit-prod` profiles.
2. In `test`, verify native endpoints (without ingress rewrite fallback):
  - `https://test.datowave.com/rtc/v1/validate` returns `401` (not `404`).
  - `https://test.datowave.com/rtc/v1` no longer fails with `404` during browser connect.
3. Run full `test` gate after upgrade:
  - `TEST_REF=origin/<branch> npm run deploy:test:smoke`.
  - `SMOKE_STATUS=pass`, `SMOKE_LIVEKIT_GATE_STATUS=pass`, `SMOKE_LIVEKIT_MEDIA_STATUS=pass`.
4. Remove rewrite rules from `edge/ingress/caddy/Caddyfile` for both `test.datowave.com` and `datowave.com`.
5. Recreate Caddy container after config update to avoid stale bind-mount inode:
  - `cd ~/srv/edge/ingress && docker compose up -d --force-recreate edge-caddy`.
6. Re-validate in `prod`:
  - `https://datowave.com/rtc/v1/validate` returns `401`.
  - `https://datowave.com/version` returns `200`.

Rollback rule: if any step fails, re-enable compatibility rewrite and redeploy ingress before continuing rollout.
