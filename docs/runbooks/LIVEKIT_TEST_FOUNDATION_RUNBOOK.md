# LiveKit Test Foundation Runbook

Purpose: raise and validate LiveKit as a dedicated SFU media-plane in `test` contour without changing default routing for production traffic.

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

## 3) Keep current routing unchanged

Foundation stage does not switch application routing by itself.

Current default still controlled by:
- `TEST_RTC_MEDIA_TOPOLOGY_DEFAULT`
- `TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS`
- `TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS`

LiveKit integration and `mediaTopology=livekit` adapter are Stage B/C tasks.

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
