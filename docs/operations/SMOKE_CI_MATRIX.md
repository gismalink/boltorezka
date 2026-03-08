# Smoke / CI Matrix

Матрица обязательных проверок для `test` gate и pre-prod decision пакета.

## 1) Local developer checks

| Stage | Command | Required |
|---|---|---|
| Typecheck | `npm run check:api-types` | Yes |
| Verify baseline | `npm run check` | Yes |
| API smoke | `SMOKE_API=1 npm run check` | Recommended |
| API+SSO smoke | `SMOKE_API=1 SMOKE_SSO=1 SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run check` | Recommended |

## 2) Test deploy gate

| Stage | Command | Required |
|---|---|---|
| Deploy + postdeploy smoke | `TEST_REF=origin/<branch_or_main> npm run deploy:test:smoke` | Yes |
| API/Web contract smoke in postdeploy | included in `deploy:test:smoke` (`smoke:sso` + `smoke:api` + `smoke:web:version-cache` + `smoke:realtime`), bearer auto-generated server-side from smoke user + JWT secret (`JWT_SECRET`/`TEST_JWT_SECRET`/api container env fallback) | Yes |
| Browser media transport + one-way gate (SFU profile) | included in `deploy:test:sfu` via `SMOKE_REALTIME_MEDIA=1` and `SMOKE_FAIL_ON_ONE_WAY=1`; strict mode default: `SMOKE_REALTIME_MEDIA_STRICT=1`; transient retry enabled by default (`SMOKE_REALTIME_MEDIA_RETRIES=2`, `SMOKE_REALTIME_MEDIA_RETRY_DELAY_SEC=5`), websocket readiness timeout increased (`SMOKE_RTC_WS_READY_TIMEOUT_MS=35000`), anti-loop thresholds enabled by default (`SMOKE_RTC_MAX_RELAYED_OFFERS=40`, `SMOKE_RTC_MAX_RELAYED_ANSWERS=40`, `SMOKE_RTC_MAX_RENEGOTIATION_EVENTS=80`), emergency bypass only: `SMOKE_REALTIME_MEDIA_STRICT=0` | Yes |
| TURN TLS handshake gate | included in postdeploy smoke (`SMOKE_TURN_TLS_STATUS`), strict by default (`SMOKE_TURN_TLS_STRICT=1`) | Yes |
| TURN allocation failures metric | included in postdeploy smoke summary (`SMOKE_TURN_ALLOCATION_FAILURES`, `SMOKE_TURN_ALLOCATION_STATUS`) from TURN logs (`Cannot create socket`/`error 508` patterns); optional strict threshold `SMOKE_TURN_ALLOCATION_FAIL_THRESHOLD` | Yes |
| Baseline comparison (P2P vs SFU, same ref) | `TEST_REF=origin/<branch_or_main> npm run smoke:compare:p2p-sfu` | Required for pre-prod package |
| Auto rollback policy (optional) | `AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/<ref> npm run deploy:test:smoke` | Optional |
| Extended relay smoke | `SMOKE_CALL_SIGNAL=1` flow with 2 ws-ticket | Yes |
| Initial replay gate (`call.initial_state`) | enabled in postdeploy (`SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1`), fail-fast on missing replay envelope | Yes |

## 3) GitHub Actions (`test-smoke.yml`)

Workflow: `.github/workflows/test-smoke.yml`

| Variable/Secret | Purpose | Required |
|---|---|---|
| `TEST_SMOKE_API_URL` (repo variable) | Target URL for test contour | Optional |
| `TEST_SMOKE_TEST_BEARER_TOKEN` (repo secret) | Bearer of dedicated smoke test account for protected checks (`telemetry/summary`) | Yes |
| `TEST_SMOKE_TEST_BEARER_TOKEN_SECOND` / `TEST_SMOKE_TEST_BEARER_TOKEN_THIRD` (repo secrets) | Optional second/third users for extended realtime smoke | Optional |
| `TEST_SMOKE_EXTENDED_RTC` (repo variable `0/1`) | Toggle extended realtime smoke path in workflow | Optional |

Current CI command:

- `SMOKE_API=1 SMOKE_SSO=1 SMOKE_REALTIME=1 SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1 npm run check`
- optional extended mode: `SMOKE_CALL_SIGNAL=1 SMOKE_CALL_RACE_3WAY=1` (wired via `TEST_SMOKE_EXTENDED_RTC=1` or manual workflow input `extended_rtc=1`)

## 4) Contract coverage map

| Contract | Smoke signal |
|---|---|
| `GET /version` + build SHA compatibility | `npm run smoke:web:version-cache` |
| `index.html` cache-control (`no-store`) + immutable hash assets | `npm run smoke:web:version-cache` |
| `GET /health` | API smoke / postdeploy smoke |
| `GET /v1/auth/mode` + SSO redirect | `npm run smoke:sso` |
| `GET /v1/auth/ws-ticket` + WS connect | `npm run smoke:realtime` |
| `call.initial_state` replay envelope on `room.join` | `npm run smoke:realtime` (`SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1`) |
| Web static delivery contract (`web root + assets + api mode`) | `npm run smoke:web:static` (invoked from `smoke:web:e2e`) |
| `chat.send` ack/nack/idempotency | `npm run smoke:realtime` |
| `call.offer/reject/hangup` relay | extended realtime smoke (`SMOKE_CALL_SIGNAL=1`) |
| Browser media transport breakdown (`udp`/`tcp`/`tls relay`) | postdeploy summary (`SMOKE_REALTIME_MEDIA=1`) |
| TURN TLS endpoint availability (`turns:5349`) | postdeploy summary (`SMOKE_TURN_TLS_STATUS`) |
| TURN allocation failure counter (`508` / `Cannot create socket`) | postdeploy summary (`SMOKE_TURN_ALLOCATION_FAILURES`, `SMOKE_TURN_ALLOCATION_STATUS`) |
| one-way media counters (`audio`/`video`) | postdeploy summary + fail gate (`SMOKE_FAIL_ON_ONE_WAY=1`) |
| Denied media UX gate (`banner + lock controls`) | `npm run smoke:web:denied-media` (invoked from `smoke:web:e2e`) |
| Browser-level denied media UX gate (headless) | `SMOKE_WEB_BASE_URL=<url> npm run smoke:web:denied-media:browser` (optional in `smoke:web:e2e` via `SMOKE_E2E_DENIED_MEDIA_BROWSER=1`) |
| `GET /v1/telemetry/summary` | CI (`SMOKE_TELEMETRY_SUMMARY=1`) |
| `POST /v1/room-categories` + `POST /v1/rooms` + `GET /v1/rooms/tree` | API smoke (`SMOKE_API=1`, hierarchy block with cleanup) |

## 5) Gate policy summary

- `test` deploy gate: standard postdeploy smoke + extended relay smoke must pass.
- `test` SFU profile gate: browser media transport + one-way checks are required by default (`SMOKE_REALTIME_MEDIA_STRICT=1`).
- `prod` gate: deferred until MVP-like readiness policy is explicitly satisfied.
- `prod` rollout allowed only from `main` and only by explicit confirmation.
