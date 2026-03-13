# Boltorezka Test Results

Отдельный журнал результатов тестов/нагрузки.

## 2026-03-13 — Cycle #21 (Desktop security baseline + secure chain)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`78955dd`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:security`: PASS
  - contextIsolation: `true`
  - sandbox: `true`
  - nodeIntegration: `false`
  - webSecurity: `true`
  - preload bridge keys: `platform,version`
  - popupBlocked: `true`
- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=2 npm run desktop:smoke:m2:secure`: PASS

### Scope covered by this cycle

- Добавлен и валидирован desktop security smoke (webPreferences + renderer isolation + bridge allowlist),
- Подтвержден агрегированный `desktop:smoke:m2:secure` command для M2 regression на feature/test.

### Decision

- Cycle #21: PASS.
- Security smoke может использоваться как обязательный desktop pre-merge gate вместе с M2 chain.

## 2026-03-13 — Cycle #20 (Desktop M2 plus soak chain)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`46b8f4d`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=3 npm run desktop:smoke:m2:soak`: PASS
  - `desktop:smoke`: PASS
  - `smoke:desktop:runtime`: PASS
  - `smoke:desktop:reconnect`: PASS
  - `smoke:desktop:telemetry`: PASS
  - `smoke:desktop:soak`: PASS (`cycles=3`)

### Scope covered by this cycle

- Подтвержден единый end-to-end M2 automation command с интегрированным reconnect soak gate,
- Снижен операционный риск ручного запуска нескольких desktop smoke команд по отдельности.

### Decision

- Cycle #20: PASS.
- `desktop:smoke:m2:soak` можно использовать как основной M2 regression command на feature/test этапах.

## 2026-03-13 — Cycle #19 (Desktop reconnect soak automation)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`a6f232d`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=4 npm run smoke:desktop:soak`: PASS
  - runtime: `desktop`
  - platform: `darwin`
  - electronVersion: `35.7.5`
  - reconnect cycles: `4/4`

### Scope covered by this cycle

- Добавлен repeatable soak smoke для desktop reconnect stability (многократный network flap в одном Electron run),
- Сформирован automation evidence слой между single reconnect smoke и долгим ручным soak.

### Decision

- Cycle #19: PASS.
- M2 stability automation расширен новым `smoke:desktop:soak` gate.

## 2026-03-13 — Cycle #18 (Rolling SLO gate evidence)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Contour: server-side scheduler job (`~/srv/boltorezka/scripts/ops/scheduler/run-job.sh slo-rolling-gate`)

### Functional gate

- `slo-rolling-gate`: PASS
  - `SLO_ROLLING_STATUS=pass`
  - `SLO_ROLLING_ALERT_COUNT=0`
  - `SLO_ROLLING_TS=2026-03-13T17:52:39.405Z`

### Scope covered by this cycle

- Подтвержден актуальный rolling SLO baseline gate для auth/reconnect на test,
- Снят оставшийся блокер по `SLO/baseline` для desktop prod-readiness dependency chain.

### Decision

- Cycle #18: PASS.
- SLO gate evidence добавлен в cookie/session и desktop plan документы.

## 2026-03-13 — Cycle #17 (Electron M2 telemetry stabilization)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`704b7df`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:telemetry`: PASS
  - runtime: `desktop`
  - platform: `darwin`
  - electronVersion: `35.7.5`
- `npm run desktop:smoke:m2`: PASS
  - `desktop:smoke` (foundation build): PASS
  - `smoke:desktop:runtime`: PASS
  - `smoke:desktop:reconnect`: PASS
  - `smoke:desktop:telemetry`: PASS

### Scope covered by this cycle

- Закрыта стабилизация desktop telemetry smoke на test contour,
- Подтверждён полный M2 smoke-цикл (foundation/runtime/reconnect/telemetry),
- Runtime telemetry labels (`runtime/platform/electronVersion`) подтверждены в desktop execution path.

### Decision

- Cycle #17: PASS.
- M2 automation slice готов к следующему этапу (sleep/wake evidence и дальнейшие desktop hardening шаги).

## 2026-03-04 — Cycle #16 (RTC row/camera hotfix local smoke)

- Environment: local web preview (`http://127.0.0.1:4173`)
- Build ref: working tree (post-merge fixes)

### Functional gate

- `npm --prefix apps/web run build`: PASS
- `npm run smoke:web:e2e`: FAIL (no `SMOKE_BEARER_TOKEN` / `SMOKE_WS_TICKET`, auto-ticket path unavailable в локальном окружении)
- `SMOKE_WEB_BASE_URL=http://127.0.0.1:4173 npm run smoke:web:denied-media:browser`: PASS
  - denied banner visible,
  - request media access CTA visible.
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<token> npm run smoke:web:e2e`: FAIL (`[smoke:realtime] timeout: ack for call.offer`).
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<token> SMOKE_E2E_CALL_SIGNAL=0 SMOKE_E2E_RECONNECT=0 npm run smoke:web:e2e`: PASS.
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<token> SMOKE_CALL_SIGNAL=1 SMOKE_RECONNECT=0 npm run smoke:realtime`: FAIL-fast с явной причиной (`second ticket from another user required`).

### Root cause + fix

- Root cause: call-signal smoke запускался с двумя ws-ticket одного и того же userId; для non-text channels второй join эвиктит первый socket (`ChannelSessionMoved`), из-за чего `call.offer` ack не мог стабильно пройти.
- Fix: `scripts/smoke-web-e2e.sh` обновлён — auto-ticket path генерирует `SMOKE_WS_TICKET_SECOND` из другого пользователя (`SMOKE_USER_EMAIL_SECOND` или автоматически `email <> SMOKE_USER_EMAIL`).
- Guardrail: `scripts/smoke-realtime.mjs` теперь валит сценарий call-signal сразу с понятной ошибкой при same-user pair вместо timeout.

### Scope covered by this cycle

- Исправлен RTC/video sender baseline для peer-соединений (fix кейса «не видят камеры друг друга»),
- Упрощён RTC badge в списке участников до `rtc` с state-based styling (transparent / blinking / connected),
- Восстановлена цветовая семантика текущего пользователя (default orange, speaking blue как у остальных).

### Decision

- Cycle #16: PARTIAL PASS.
- Full-default `smoke:web:e2e` остаётся нестабильным в call-signal stage (`call.offer` ack timeout).

## 2026-03-04 — Cycle #15 (origin/main rollout validation)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/main` (`29ad7be`)
- Ingress ref: `edge/main` (`095b504`)

### Functional gate

- `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Проверен full test rollout уже от `main` после merge feature-пакета,
- Caddy-only static delivery mode остаётся стабильным на main.

### Decision

- Cycle #15: PASS.
- `main` готов к следующему pre-prod sign-off этапу (без prod rollout до explicit approval).

## 2026-03-04 — Cycle #14 (full test deploy after preprod refresh)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`94c8d0e`)
- Ingress ref: `edge/main` (`095b504`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Full test rollout подтверждён на актуальном SHA после обновления pre-prod пакета,
- Caddy-only static delivery и API split routing остаются стабильными.

### Decision

- Cycle #14: PASS.
- Test contour ready for next pre-prod sign-off review stage.

## 2026-03-04 — Cycle #13 (Caddy-only static serving migration)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`7f319e9`)
- Ingress ref: `edge/main` (`095b504`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Удалён внутренний nginx слой для web static serving,
- static bundle синхронизируется в edge Caddy static directory,
- web/API split routing и cache policy валидированы на test.

### Decision

- Cycle #13: PASS.
- Caddy-only static serving подтверждён в test.

## 2026-03-04 — Cycle #12 (external static path rollout, decoupled API/web)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`2906b08`)
- Ingress ref: `edge/main` (`91db6c8`, split web/api routing)

### Functional gate

- `npm run smoke:test:postdeploy`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Test contour switched to external static delivery path (`web-default`),
- API static serving kept disabled (`API_SERVE_STATIC=0`) without regression in postdeploy gate.

### Decision

- Cycle #12: PASS.
- Legacy deprecation Phase D finalized for test contour.

## 2026-03-04 — Cycle #11 (browser-level denied-media headless E2E)

- Environment: local web (`http://localhost:5173`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (working tree)

### Functional gate

- `SMOKE_WEB_BASE_URL=http://localhost:5173 npm run smoke:web:denied-media:browser`: PASS
  - denied banner visible,
  - request media access CTA visible.

### Scope covered by this cycle

- Browser-level headless validation of denied-media UX path (runtime DOM, not source-only check).

### Decision

- Cycle #11: PASS.
- Roadmap пункт `Browser-level E2E: denied media permissions UX` переведён в completed.

## 2026-03-04 — Cycle #10 (audio input devicechange auto-update)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`b931324`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `health`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Runtime auto-refresh outgoing audio track on system `devicechange` during active call,
- explicit call-log visibility for auto-update success/failure.

### Decision

- Cycle #10: PASS.
- Roadmap пункт по system devicechange handling для input device переведён в completed.

## 2026-03-04 — Cycle #9 (version-cache gate + dual-path readiness)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`edb033f`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `health`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Dual-path validation (separate static path)

- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art/__web npm run smoke:web:static` — PASS.
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art/__web SMOKE_EXPECT_BUILD_SHA=edb033fa61aaeb71df24f78d3055b8c3f1c49f1d npm run smoke:web:version-cache` — PASS.

### Scope covered by this cycle

- build-version compatibility gate (`/version` + client auto-reload),
- anti-cache policy (`index.html` no-store, hash-assets immutable),
- separate static delivery path readiness in test (`/__web/`).

### Decision

- Cycle #9: PASS.
- Roadmap пункт `deprecation dry-run (dual-path readiness + rollback rehearsal)` переведён в completed.

## 2026-03-04 — Cycle #8 (feature video runtime/control increments)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`1c40a14`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `health`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- sender-side video effects runtime (`none` / `8-bit` / `ASCII`),
- owner preview and conditional server settings,
- ASCII controls (cell size, contrast, color),
- video windows drag/resize UX and server min/max resize bounds,
- compact server video slider layout.

### Decision

- Cycle #8: PASS.
- Изменения готовы к дальнейшему test-first циклу и накоплению pre-prod evidence.

## 2026-03-02 — Cycle #1 (MVP gate + API load P1)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/tailwind-user-dock` (`50f89b3`)

### Functional gate

- `server-quick-check`: PASS
- `npm run smoke:test:postdeploy`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:realtime`: PASS (`reconnectOk=true`)

### API load P1 (20 rps, 5 min)

- `GET /health`
  - avg: `146.43 ms`
  - p50: `106 ms`
  - p97.5: `642 ms`
  - p99: `1027 ms`
  - max: `1608 ms`
  - requests: `6k`

- `GET /v1/auth/mode`
  - avg: `100.54 ms`
  - p50: `90 ms`
  - p97.5: `281 ms`
  - p99: `350 ms`
  - max: `792 ms`
  - requests: `6k`

### Post-load checks

- API logs (`--tail=300`, grep `error|fatal|exception|panic`): no critical matches.

### Decision

- Cycle #1: PASS
- Next step: run P2 (`60 rps, 10 min`) + W1 (`100 concurrent WS, 10 min`) and capture TURN/api traffic deltas.

## 2026-03-02 — Cycle #2 (P2 + WS capacity probe)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/tailwind-user-dock` (`50f89b3`)

### API load P2 (60 connections, pipelining 10, 10 min)

- `GET /health`
  - avg: `185.48 ms`
  - p50: `130 ms`
  - p97.5: `599 ms`
  - p99: `758 ms`
  - max: `9993 ms`
  - requests: `1,929,350`
  - errors: `130` (`timeouts`)

### Realtime WS load

- W1 (`100 clients`, `10 min`):
  - connected: `100/100` (failures `0`)
  - sent: `8,252`
  - ack: `4,265`
  - nack: `4,087`
  - errors: `99`

- W2 probe (`200 clients`, `5 min`):
  - connected: `200/200` (failures `0`)
  - sent: `9,460`
  - ack: `4,949`
  - nack: `4,711`
  - errors: `199`

- Diagnostic rerun (`100 clients`, `2 min`, with code breakdown):
  - `nackCodes`: `NoActiveRoom=914`
  - `errorCodes`: `ChannelSessionMoved=99`
  - note: this probe used one JWT subject for all clients, so nack/error are dominated by session semantics (not socket-connect limit).

### Traffic and TURN observations

- Container net counters (baseline -> post):
  - `boltorezka-api-test`: `5.33MB / 7.25MB` -> `841MB / 1.11GB`
  - approx delta: `+835.7MB` recv, `+1.10GB` sent.

- `boltorezka-turn` net counters: `3.4GB / 2.71GB` -> `3.4GB / 2.71GB` (no measurable change).
- TURN socket sample (`ss -uan`, `ss -tan` inside container): `0 / 0` before, during and after these runs.

### Decision

- P2 API: PASS with low timeout share (`130 / 1,929,350` ~= `0.0067%`).
- Realtime gateway accepts at least `200` concurrent WS connections in this scenario.
- Current WS chat load probe is constrained by single-user session behavior; a multi-user token set is required for clean per-user chat throughput ceiling.
- TURN capacity was not exercised (no media relay allocations in these runs).

## 2026-03-02 — Cycle #3 (clean multi-user WS capacity)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/tailwind-user-dock` (`50f89b3`)

### Setup

- Seeded synthetic test users in `test` DB: `300` (`wsload_...@example.test`).
- `ws-load` updated to support token pool (`SMOKE_BEARER_TOKENS`) and round-robin assignment per client.

### Realtime WS load (unique users)

- W3 (`100 clients`, `5 min`, unique user tokens):
  - connected: `100/100` (failures `0`)
  - sent: `4,320`
  - ack: `4,420`
  - nack: `0`
  - errors: `0`
  - chatMessages: `211,972`

- W4 (`200 clients`, `5 min`, unique user tokens):
  - connected: `200/200` (failures `0`)
  - sent: `10,282`
  - ack: `10,436`
  - nack: `0`
  - errors: `0`
  - chatMessages: `948,713`

### Traffic and TURN observations (W4 window)

- Container net counters (baseline -> post):
  - `boltorezka-api-test`: `867MB / 1.26GB` -> `942MB / 2.03GB`
  - approx delta: `+75MB` recv, `+770MB` sent.

- `boltorezka-turn` net counters: no measurable change.
- TURN socket sample (`ss -uan`, `ss -tan`): `0 / 0` before and after.

### Decision

- Clean chat/realtime capacity (without single-session collisions) is confirmed at `200` concurrent active WS users on current test stack.
- TURN relay capacity remains unvalidated by these runs (media relay was not generated).

## 2026-03-03 — Cycle #4 (TURN relay allocation stress, test)

- Environment: `test` (`boltorezka-turn`)
- TURN config under test: relay UDP/TCP range `30000-30100` (101 ports)

### Method

- Tool: `turnutils_uclient` inside TURN container.
- Auth: production-like long-term TURN credentials from `infra/.env.host`.
- Peer mode: external peer `8.8.8.8` (loopback peer is rejected by TURN policy with `403 Forbidden IP`).

### Baseline after TURN restart

- Socket baseline (`/proc/net/*`): `udp_lines=17`, `tcp_lines=17`.

### Stable run (under limit)

- Scenario: `m=20`, `timeout 90`, `-c -e 8.8.8.8`.
- Result: PASS (run held until timeout, no `508`).
- Mid-run sockets: `udp_lines=61`, `tcp_lines=17` (delta `+44` UDP sockets vs baseline).

### Over-limit run

- Scenario: `m=50`, same flags, clean restart before run.
- Result: FAIL as expected with `error 508 (Cannot create socket)` and exit code `255`.

### Decision

- TURN relay capacity is now empirically exercised.
- Practical ceiling for this test profile is reached between `20` and `50` concurrent TURN clients (with this `uclient` mode allocating ~2+ relay sockets per client).
- With relay range size `101`, practical planning value is `~45-50` simultaneously relay-active clients for this profile; above that, expect `508` allocation failures.
- For target `~100 TURN sockets`: current config is consistent with roughly `~50` simultaneously relay-active participants in 1-allocation-per-media-stream pair patterns.
- Network `docker stats` NetIO for this cycle is not representative (client and TURN ran in same container namespace via localhost path).

## 2026-03-03 — Cycle #5 (TURN range 30000-31000 + large run + parallel telemetry)

- Environment: `test` (`boltorezka-turn`)
- TURN recreated with expanded range override: `TURN_MIN_PORT=30000`, `TURN_MAX_PORT=31000`.
- Port publish verification: `30000-31000/tcp` and `30000-31000/udp` are active on host.

### Large TURN run #1

- Scenario: `turnutils_uclient ... -m 300 -c -e 8.8.8.8 -r 3480` with `timeout 180`.
- Result: PASS (process ended by timeout, no `508`, no `Forbidden`).

### Large TURN run #2 (stress above #1)

- Scenario: `turnutils_uclient ... -m 500 -c -e 8.8.8.8 -r 3480` with `timeout 120`.
- Result: reached allocation limit (`error 508 (Cannot create socket)` observed).

### Parallel system telemetry (during large runs)

- TURN sockets (`/proc/net`):
  - baseline after recreate: `udp=17`, `tcp=17`
  - peak during run: `udp=917`, `tcp=17`
  - stable elevated plateau observed: `udp≈704`, `tcp=17`

- Container load snapshot (peak observed):
  - `boltorezka-turn`: CPU up to `18.63%`, RSS up to `63.7MiB`
  - `boltorezka-api-test`: near baseline (`~0.1-0.3% CPU`, `~92MiB` RSS)
  - `boltorezka-db-test` / `redis-test`: low/steady background load.

- Notes on network counters:
  - `docker stats` NetIO for TURN changed minimally in this harness because generator ran in container namespace and traffic path is mostly local.

### Decision

- Expanding relay range from `101` to `1001` ports significantly raised practical TURN headroom.
- Confirmed safe operating point at least `m=300` for this test profile.
- `m=500` already hits socket creation failures, so practical planning zone is below this level.
- For operations planning: start with conservative cap `~300` relay-active clients for this profile and treat `500` as over-limit until finer sweep confirms exact threshold.

## 2026-03-03 — Cycle #6 (combined concurrent load: TURN + WS + API)

- Environment: `test`
- Scenario (simultaneous):
  - `200 WS clients`
  - `200 TURN relay allocations`
  - `60 rps API`

### TURN media profile (Opus-like target)

- Tool profile: `turnutils_uclient -m 200 -n 10000 -l 100 -z 20 -c -e 8.8.8.8 -r 3480`.
- Approx payload bitrate per flow: `100 bytes / 20 ms` ~= `40 kbps` (within requested `32-48 kbps` band).
- Approx aggregate payload target for 200 flows: `~8 Mbps`.

### Component results

- TURN run (`timeout 180`): PASS by timeout (`exit 124` expected), `error 508=0`, `Forbidden=0`.
- WS run (`200 unique users`, `180s`):
  - connected: `200/200` (failures `0`)
  - sent: `19,116`
  - ack: `19,164`
  - nack: `0`
  - errors: `0`
- API run (`autocannon -R 60 -d 180`):
  - total requests: `10,693` (`200` only)
  - avg latency: `106.43 ms`
  - p50: `82 ms`, p97.5: `402 ms`, p99: `543 ms`

### Parallel telemetry (same window)

- TURN sockets (`/proc/net`):
  - baseline: `udp=17`, `tcp=17`
  - during load plateau: `udp=264`, `tcp=64`
  - post-run before reset: `udp=217`, `tcp=17`
  - after reset: `udp=17`, `tcp=17`

- Container CPU/RSS peaks observed:
  - `boltorezka-turn`: CPU up to `0.72%` in sampled window, RSS up to `27.26MiB`
  - `boltorezka-api-test`: CPU up to `25.56%`, RSS up to `141.1MiB`
  - `boltorezka-db-test`: CPU up to `4.24%`
  - `boltorezka-redis-test`: CPU up to `1.99%`

- NetIO deltas (sample window):
  - `boltorezka-api-test`: from `~1.01GB/2.60GB` to `~1.07GB/3.03GB` (approx `+60MB` rx, `+430MB` tx)
  - `boltorezka-turn`: minor change (`~260kB/236kB` -> `~278kB/254kB`) due local-generator harness path.

### Decision

- Combined target scenario is sustainable in test under current config.
- API is the dominant resource consumer in this mixed run; TURN remained low CPU in sampled interval.
- TURN socket behavior remained stable for `200` allocations with this profile and returned to baseline after restart.

## 2026-03-03 — Cycle #7 (10-minute combined run, same profile)

- Environment: `test`
- Simultaneous scenario (10 minutes):
  - `200 WS clients` (`WS_LOAD_DURATION_SEC=600`)
  - `200 TURN allocations` (`timeout 600`)
  - `60 rps API` (10 x 60s windows)

### TURN profile (Opus-like target)

- `turnutils_uclient -m 200 -n 10000 -l 100 -z 20 -c -e 8.8.8.8 -r 3480`
- Target payload bitrate per flow: `~40 kbps` (`100 bytes / 20 ms`), aggregate `~8 Mbps`.

### Results

- TURN (`600s`): PASS by timeout (`exit 124` expected), `error 508=0`, `Forbidden=0`.
- WS (`600s`):
  - connected: `200/200` (failures `0`)
  - sent: `53,190`
  - ack: `53,362`
  - nack/errors: `0/0`
  - chatMessages: `5,082,201`
- API (`60 rps`, minute windows):
  - total requests: `35,865`
  - avg latency mean (10 min): `89.25 ms`
  - p95 mean (minute-level): `283.9 ms`
  - p99 mean (minute-level): `364.7 ms`
  - worst minute: `p95=494 ms`, `p99=620 ms`
  - errors/timeouts: `0/0`

### CPU p95/p99 (sampled window)

- Sampling source: container monitor every 10s (available samples range `10..60`).
- `boltorezka-api-test`: avg `4.16%`, p95 `7.21%`, p99 `7.96%`, max `8.31%`.
- `boltorezka-turn`: avg `0.03%`, p95 `0.05%`, p99 `0.06%`, max `0.06%`.
- `boltorezka-db-test`: avg `1.50%`, p95 `4.92%`, p99 `5.45%`, max `5.66%`.
- `boltorezka-redis-test`: avg `1.31%`, p95 `2.56%`, p99 `2.79%`, max `2.85%`.

### NetIO and sockets

- API NetIO grew during run (from baseline `~1.07GB/3.03GB` to monitor-end `~1.46GB/5.49GB`).
- TURN NetIO in this harness remained low-variance due local path specifics.
- TURN socket samples in captured monitor window remained at `udp=17`, `tcp=17`.

### Decision

- 10-minute mixed profile is stable at target load (`200 WS + 200 TURN + 60 rps API`).
- API remains primary resource hotspot; TURN CPU headroom is high for this synthetic profile.

## 2026-03-03 — Operational baseline (derived from cycles #5/#6/#7)

### Recommended operating caps (test baseline)

- Mixed steady profile: `200 WS + 200 TURN allocations + 60 rps API` for at least `10 min`.
- TURN planning cap for this synthetic profile: use `~300` as conservative upper bound.
- TURN `m=500` is over-limit in current setup (`error 508` observed), do not use as normal operating target.

### Suggested alert thresholds (initial)

- API latency guardrail for this profile: alert if minute-level `p99 > 700 ms` for `>=3` consecutive minutes.
- API error guardrail: alert on any non-zero minute `errors/timeouts` during steady `60 rps` run.
- TURN allocation guardrail: alert on first appearance of `error 508` in TURN logs.

### Notes

- These limits are valid for current `test` stack shape and this harness profile (Opus-like `~40 kbps` payload path).
- Re-validate caps after infra changes (TURN range, host limits, Docker/Desktop version, API/DB release updates).
