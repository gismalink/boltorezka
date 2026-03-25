# Smoke / CI Matrix

Матрица обязательных проверок для `test` gate и pre-prod decision пакета.

## 1) Local developer checks

| Stage | Command | Required |
|---|---|---|
| Typecheck | `npm run check:api-types` | Yes |
| Verify baseline (quick) | `npm run check:quick` | Yes |
| API smoke | `SMOKE_API=1 npm run check:quick` | Recommended |
| API+SSO smoke | `SMOKE_API=1 SMOKE_SSO=1 SMOKE_API_URL=https://test.datowave.com npm run check:quick` | Recommended |
| Auth session lifecycle smoke (refresh/logout/revoke) | `SMOKE_TEST_BEARER_TOKEN=<sid-token> SMOKE_API_URL=https://test.datowave.com npm run smoke:auth:session` | Recommended |
| RNNoise browser smoke (voice settings on/off) | `SMOKE_TEST_BEARER_TOKEN=<token> SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:web:rnnoise:browser` | Recommended |
| Desktop foundation smoke (Electron shell) | `npm run desktop:smoke` | Recommended for desktop feature branches |
| Desktop runtime smoke (Electron + runtime markers) | `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:runtime` | Recommended for desktop feature branches |
| Desktop reconnect smoke (Electron + network flap + reload) | `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:reconnect` | Recommended for desktop feature branches |
| Desktop telemetry smoke (Electron + runtime labels payload) | `SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:desktop:telemetry` | Recommended for desktop feature branches |
| Required gate (API+SSO+realtime, при наличии токена) | `SMOKE_TEST_BEARER_TOKEN=<token> SMOKE_API_URL=https://test.datowave.com npm run check:required` | CI / test gate |

## 2) Test deploy gate

| Stage | Command | Required |
|---|---|---|
| Deploy + postdeploy smoke | `TEST_REF=origin/<branch_or_main> npm run deploy:test:smoke` | Yes |
| API/Web contract smoke in postdeploy | included in `deploy:test:smoke` (`smoke:sso` + `smoke:api` + `smoke:auth:session` + `smoke:web:version-cache` + `smoke:realtime`), bearer auto-generated server-side from smoke user + JWT secret (`JWT_SECRET`/`TEST_JWT_SECRET`/api container env fallback); `smoke:auth:session` runs as `skip`, if token has no `sid` claim | Yes |
| RNNoise browser gate in postdeploy | included in `deploy:test:smoke` as `smoke:web:rnnoise:browser`; summary field `web_rnnoise` (`pass/skip`) | Yes for RNNoise canary |
| Browser media transport + one-way gate (LiveKit profile) | included in `deploy:test:livekit` via `SMOKE_REALTIME_MEDIA=1` and `SMOKE_FAIL_ON_ONE_WAY=1`; strict mode default: `SMOKE_REALTIME_MEDIA_STRICT=1`; transient retry enabled by default (`SMOKE_REALTIME_MEDIA_RETRIES=2`, `SMOKE_REALTIME_MEDIA_RETRY_DELAY_SEC=5`), websocket readiness timeout increased (`SMOKE_RTC_WS_READY_TIMEOUT_MS=35000`), anti-loop thresholds enabled by default (`SMOKE_RTC_MAX_RELAYED_OFFERS=40`, `SMOKE_RTC_MAX_RELAYED_ANSWERS=40`, `SMOKE_RTC_MAX_RENEGOTIATION_EVENTS=80`), emergency bypass only: `SMOKE_REALTIME_MEDIA_STRICT=0` | Yes |
| TURN TLS handshake gate | included in postdeploy smoke (`SMOKE_TURN_TLS_STATUS`), strict by default (`SMOKE_TURN_TLS_STRICT=1`) | Yes |
| TURN allocation failures metric | included in postdeploy smoke summary (`SMOKE_TURN_ALLOCATION_FAILURES`, `SMOKE_TURN_ALLOCATION_STATUS`) from TURN logs (`Cannot create socket`/`error 508` patterns); optional strict threshold `SMOKE_TURN_ALLOCATION_FAIL_THRESHOLD` | Yes |
| LiveKit control gate (token-flow + signaling guard) | included in postdeploy when `SMOKE_LIVEKIT_ROOM_SLUG=<room>` (`SMOKE_LIVEKIT_GATE_STATUS`) | Required |
| LiveKit media gate (browser publish/subscribe/reconnect/late-join) | included in postdeploy when `SMOKE_LIVEKIT_ROOM_SLUG=<room>` and `SMOKE_LIVEKIT_MEDIA=1` (`SMOKE_LIVEKIT_MEDIA_STATUS`) | Required for LiveKit media-plane validation |
| LiveKit standard profile gate | included in postdeploy by default (`SMOKE_REQUIRE_LIVEKIT_STANDARD_PROFILE=1`): enforces enabled LiveKit runtime (`SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS`) | Yes |
| Auto rollback policy (optional) | `AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/<ref> npm run deploy:test:smoke` | Optional |
| Extended realtime-state smoke | `SMOKE_CALL_SIGNAL=1` flow with 2 ws-ticket (`call.mic_state`/`call.video_state` relay + `call.initial_state` replay) | Yes |
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

- `SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1 npm run check:required`
- optional extended mode: `SMOKE_CALL_SIGNAL=1` (wired via `TEST_SMOKE_EXTENDED_RTC=1` or manual workflow input `extended_rtc=1`)

Policy:

- `check` оставлен как alias на `check:quick` для обратной совместимости.
- В CI и обязательных gate используем только `check:required`.

## 4) Contract coverage map

| Contract | Smoke signal |
|---|---|
| `GET /version` + build SHA compatibility | `npm run smoke:web:version-cache` |
| `index.html` cache-control (`no-store`) + immutable hash assets | `npm run smoke:web:version-cache` |
| `GET /health` | API smoke / postdeploy smoke |
| `GET /v1/auth/mode` + SSO redirect | `npm run smoke:sso` |
| `POST /v1/auth/refresh` + `POST /v1/auth/logout` + sid session revoke | `npm run smoke:auth:session` (requires bearer token with `sid`, otherwise `skip`) |
| `GET /v1/auth/ws-ticket` + WS connect | `npm run smoke:realtime` |
| `call.initial_state` replay envelope on `room.join` | `npm run smoke:realtime` (`SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1`) |
| Web static delivery contract (`web root + assets + api mode`) | `npm run smoke:web:static` (invoked from `smoke:web:e2e`) |
| `chat.send` ack/nack/idempotency | `npm run smoke:realtime` |
| `call.mic_state` / `call.video_state` relay | extended realtime smoke (`SMOKE_CALL_SIGNAL=1`) |
| Browser media transport breakdown (`udp`/`tcp`/`tls relay`) | postdeploy summary (`SMOKE_REALTIME_MEDIA=1`) |
| TURN TLS endpoint availability (`turns:5349`) | postdeploy summary (`SMOKE_TURN_TLS_STATUS`) |
| TURN credentials rotation freshness (`marker` age) | postdeploy summary + fail gate (`SMOKE_TURN_ROTATION_STATUS`, `SMOKE_TURN_ROTATION_MAX_AGE_DAYS`); bootstrap compatibility allows missing marker once (`SMOKE_TURN_ROTATION_ALLOW_MISSING_MARKER=1`) |
| TURN allocation failure counter (`508` / `Cannot create socket`) | postdeploy summary (`SMOKE_TURN_ALLOCATION_FAILURES`, `SMOKE_TURN_ALLOCATION_STATUS`) |
| one-way media counters (`audio`/`video`) | postdeploy summary + fail gate (`SMOKE_FAIL_ON_ONE_WAY=1`) |
| Denied media UX gate (`banner + lock controls`) | `npm run smoke:web:denied-media` (invoked from `smoke:web:e2e`) |
| Browser-level denied media UX gate (headless) | `SMOKE_WEB_BASE_URL=<url> npm run smoke:web:denied-media:browser` (optional in `smoke:web:e2e` via `SMOKE_E2E_DENIED_MEDIA_BROWSER=1`) |
| Browser-level RNNoise voice-settings gate (headless) | `SMOKE_WEB_BASE_URL=<url> SMOKE_TEST_BEARER_TOKEN=<token> npm run smoke:web:rnnoise:browser` |
| Desktop shell packaging baseline (`main/preload/renderer bundle`) | `npm run desktop:smoke` |
| Desktop shell runtime baseline (`runtime=desktop` markers via Electron launch) | `npm run smoke:desktop:runtime` |
| Desktop reconnect baseline (`network flap -> reload -> runtime markers`) | `npm run smoke:desktop:reconnect` |
| Desktop reconnect soak baseline (`N` offline/online cycles in single run) | `SMOKE_WEB_BASE_URL=<url> SMOKE_DESKTOP_SOAK_CYCLES=8 npm run smoke:desktop:soak` |
| Desktop telemetry payload baseline (`desktop_smoke_probe` meta labels) | `npm run smoke:desktop:telemetry` |
| Desktop security baseline (`webPreferences + renderer isolation + bridge allowlist`) | `SMOKE_WEB_BASE_URL=<url> npm run smoke:desktop:security` |
| Desktop diagnostics artifact baseline (`runtime/security snapshot file`) | `SMOKE_WEB_BASE_URL=<url> npm run smoke:desktop:diagnostics` |
| Desktop sleep/wake assist baseline (`pre/post wake markers`, optional strict suspend detect) | `SMOKE_WEB_BASE_URL=<url> SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1 npm run smoke:desktop:sleep-wake` |
| Desktop stability soak baseline (`long-run runtime consistency + error-free session`) | `SMOKE_WEB_BASE_URL=<url> SMOKE_DESKTOP_STABILITY_DURATION_MS=1800000 npm run smoke:desktop:stability` |
| Desktop SSO externalization baseline (`/v1/auth/sso/start|logout` open in system browser) | `SMOKE_WEB_BASE_URL=<url> npm run smoke:desktop:sso-external` |
| Client telemetry runtime labels (`runtime`/`platform`/`electronVersion`) | `POST /v1/telemetry/web` payload from `trackClientEvent` |
| `GET /v1/telemetry/summary` | CI (`SMOKE_TELEMETRY_SUMMARY=1`) |
| Desktop observability counters in telemetry summary | `GET /v1/telemetry/summary` -> `telemetry_runtime_desktop/web/unknown`, `telemetry_desktop_platform_*`, `telemetry_desktop_electron_version_present` |
| `POST /v1/room-categories` + `POST /v1/rooms` + `GET /v1/rooms/tree` | API smoke (`SMOKE_API=1`, hierarchy block with cleanup) |

## 5) Gate policy summary

- `test` deploy gate: standard postdeploy smoke + extended relay smoke must pass.
- `test` LiveKit profile gate: browser media transport + one-way checks are required by default (`SMOKE_REALTIME_MEDIA_STRICT=1`).
- Rolling SLO monitor gate (`npm run slo:check`) and thresholds are defined in `docs/operations/SLO_ROLLING_ALERTS.md`.
- `prod` gate: deferred until MVP-like readiness policy is explicitly satisfied.
- `prod` rollout allowed only from `main` and only by explicit confirmation.
