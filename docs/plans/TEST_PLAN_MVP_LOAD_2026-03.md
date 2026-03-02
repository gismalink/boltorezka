# Boltorezka Test Plan (MVP + Realtime + Load)

Дата: 2026-03-02  
Область: web client + api/realtime in `test` env (`test.boltorezka.gismalink.art`)

## 1) Цели

- Подтвердить стабильность MVP-потока (SSO -> room join -> chat -> basic voice state).
- Подтвердить корректность новых message lifecycle правил:
  - `chat.edit` / `chat.delete` только для своих сообщений,
  - окно 10 минут,
  - корректные `nack` коды при нарушении политики.
- Проверить мобильный UX (tab behavior, channel settings popup fit, disconnect control).
- Оценить запас по нагрузке для API/WS и ранние bottleneck’и.

## 2) Scope / Non-scope

### In scope

- HTTP endpoints: `/health`, `/v1/auth/mode`, `/v1/auth/ws-ticket`, `/v1/rooms/:slug/messages`.
- WS events: `room.join`, `room.leave`, `chat.send`, `chat.edit`, `chat.delete`, `call.*` relay baseline.
- UI web/mobile-web behavior (responsive <= 800px).

### Out of scope (для этого цикла)

- Native iOS/macOS клиенты.
- TURN bandwidth стресс-тест на production масштабе.
- Long-haul soak > 24h.

## 3) Test environments

- Primary: `test` server (`test.boltorezka.gismalink.art`).
- Optional local repeat: docker host env (`infra/docker-compose.host.yml`).

## 4) Gate criteria

- **GO (MVP functional):**
  - smoke:sso PASS,
  - smoke:api PASS,
  - smoke:realtime PASS (`reconnectOk=true`),
  - manual mobile checks PASS,
  - no critical errors in `boltorezka-api-test` logs (`--tail=300`).
- **NO-GO:**
  - regressions in auth/room join/message send,
  - message edit/delete policy bypass,
  - массовые `nack`/disconnect spikes,
  - popup/mobile controls unusable.

## 5) Test matrix

### 5.1 MVP functional

1. SSO login/logout flow (Google + Yandex path where available).
2. Room join/leave and presence propagation in two browser sessions.
3. Chat send + idempotency duplicate protection.
4. History pagination cursors.
5. Voice connect/disconnect baseline and ws reconnect after network flap.

### 5.2 New message lifecycle cases

1. Edit own message within 10 minutes -> `chat.edited` broadcast.
2. Delete own message within 10 minutes -> `chat.deleted` broadcast.
3. Edit чужого сообщения -> `nack Forbidden`.
4. Delete чужого сообщения -> `nack Forbidden`.
5. Edit after 10 minutes -> `nack EditWindowExpired`.
6. Delete after 10 minutes -> `nack DeleteWindowExpired`.
7. ArrowUp from empty input -> edit latest own editable message.

### 5.3 Mobile UX cases

1. Tab persistence on resize (mobile <-> desktop <-> mobile).
2. Room select should not force switch to Chat tab.
3. Channel settings popup fully visible with internal scroll.
4. Mobile disconnect button works and leaves active room cleanly.

## 6) Performance and load plan

### 6.1 Baseline metrics capture (before/after each run)

- `GET /health` latency (p50/p95)
- Redis `ws:metrics:<day>` counters:
  - `ack_sent`, `nack_sent`, `chat_sent`, `chat_idempotency_hit`, `call_signal_sent`
- Container stats:
  - CPU, RSS, network RX/TX for `boltorezka-api-test`, `redis`, `db`, `turn`

### 6.2 API micro-load (HTTP)

- Tooling: `k6` or `autocannon`.
- Profiles:
  - **P1:** 20 rps, 5 min (`/health`, `/v1/auth/mode`, `/v1/rooms/:slug/messages` with token)
  - **P2:** 60 rps, 10 min mixed read-heavy
  - **P3:** spike 0 -> 150 rps for 60 sec, then 30 rps steady
- Acceptance:
  - p95 `/health` < 300ms,
  - p95 `/v1/rooms/:slug/messages` < 600ms,
  - error rate < 1% (excluding expected 401/403 test cases).

### 6.3 WS/load (realtime)

- Tooling: custom `ws` script or Artillery WS scenario.
- Profiles:
  - **W1:** 100 concurrent sockets, join same room, ping + chat.send each 15s (10 min)
  - **W2:** 250 concurrent sockets, mixed join/leave churn (15 min)
  - **W3:** 400 sockets short stress (5 min), no call relay
- Checks:
  - stable ack ratio (`ack_sent` growth ~= emitted requests),
  - reconnect success > 99%,
  - `nack_sent` baseline only for intended negative scenarios,
  - no repeated critical errors in api logs.

### 6.4 Call signaling relay load (optional this cycle)

- 40 paired clients in same room emitting `call.offer/answer/ice` bursts.
- Validate relay delivery ratio and absence of `TargetNotInRoom` anomalies for valid pairs.

## 7) Execution order (recommended)

1. Standard deploy to test branch + postdeploy smoke (`deploy:test:smoke`).
2. Manual MVP/mobile regression pack (15-20 min).
3. API micro-load P1/P2.
4. WS load W1.
5. Analyze logs/metrics; decide whether run P3/W2.
6. Produce summary report (GO/NO-GO + bottlenecks + next actions).

## 8) Reporting template

- Build/ref: `<git sha>`
- Env/time window: `<UTC range>`
- Functional pass/fail table
- Load profiles executed + p95/error rate
- WS metrics deltas (`ack_sent`, `nack_sent`, `chat_sent`, `chat_idempotency_hit`)
- Container resource peaks
- Decision: `GO test stable` / `NO-GO`
- Follow-ups: top 3 remediation actions with owner

## 9) Immediate next run commands

```bash
ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/tailwind-user-dock npm run deploy:test:smoke'
ssh mac-mini 'cd ~/srv/boltorezka && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host ps'
ssh mac-mini 'cd ~/srv/boltorezka && docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host logs --tail=300 boltorezka-api-test'
```

## 10) Execution snapshot (2026-03-02, cycle #1)

- Deploy/smoke ref: `origin/feature/tailwind-user-dock` (`50f89b3`) on `test`.
- Functional smoke: PASS (`smoke:sso`, `smoke:api`, `smoke:realtime`, `reconnectOk=true`).
- P1 API load executed:
  - `/health`: avg `146.43 ms`, p99 `1027 ms`, 6k requests.
  - `/v1/auth/mode`: avg `100.54 ms`, p99 `350 ms`, 6k requests.
- Post-load API log scan (`error|fatal|exception|panic`): no critical matches.
- Status: cycle #1 accepted, proceed to P2 + W1 in next iteration.
