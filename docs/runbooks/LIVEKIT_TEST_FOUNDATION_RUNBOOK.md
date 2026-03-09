# LiveKit Test Foundation Runbook

Purpose: validate LiveKit runtime in `test` contour and keep rollout gates aligned with current livekit-only baseline.

Scope:
- `test` only.
- GitOps-first.
- No `prod` rollout in this runbook.

## 1) Preconditions

- Branch with LiveKit foundation changes is deployed to `~/srv/boltorezka` in `test`.
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
cd ~/srv/boltorezka
npm run livekit:test:up
```

Verify service + logs:

```bash
cd ~/srv/boltorezka
npm run livekit:test:check
```

Expected:
- `boltorezka-livekit-test` is `Up`.
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
curl -X POST "https://test.boltorezka.gismalink.art/v1/auth/livekit-token" \
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
cd ~/srv/boltorezka
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
