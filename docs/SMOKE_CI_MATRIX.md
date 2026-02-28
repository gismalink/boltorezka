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
| API contract smoke in postdeploy | included in `deploy:test:smoke` (`smoke:sso` + `smoke:api` + `smoke:realtime`) | Yes |
| Auto rollback policy (optional) | `AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/<ref> npm run deploy:test:smoke` | Optional |
| Extended relay smoke | `SMOKE_CALL_SIGNAL=1` flow with 2 ws-ticket | Yes |

## 3) GitHub Actions (`test-smoke.yml`)

Workflow: `.github/workflows/test-smoke.yml`

| Variable/Secret | Purpose | Required |
|---|---|---|
| `TEST_SMOKE_API_URL` (repo variable) | Target URL for test contour | Optional |
| `TEST_SMOKE_BEARER_TOKEN` (repo secret) | Bearer for protected smoke checks (`telemetry/summary`) | Yes |

Current CI command:

- `SMOKE_API=1 SMOKE_SSO=1 SMOKE_REALTIME=1 npm run check`

## 4) Contract coverage map

| Contract | Smoke signal |
|---|---|
| `GET /health` | API smoke / postdeploy smoke |
| `GET /v1/auth/mode` + SSO redirect | `npm run smoke:sso` |
| `GET /v1/auth/ws-ticket` + WS connect | `npm run smoke:realtime` |
| `chat.send` ack/nack/idempotency | `npm run smoke:realtime` |
| `call.offer/reject/hangup` relay | extended realtime smoke (`SMOKE_CALL_SIGNAL=1`) |
| `GET /v1/telemetry/summary` | CI (`SMOKE_TELEMETRY_SUMMARY=1`) |
| `POST /v1/room-categories` + `POST /v1/rooms` + `GET /v1/rooms/tree` | API smoke (`SMOKE_API=1`, hierarchy block with cleanup) |

## 5) Gate policy summary

- `test` deploy gate: standard postdeploy smoke + extended relay smoke must pass.
- `prod` gate: deferred until MVP-like readiness policy is explicitly satisfied.
- `prod` rollout allowed only from `main` and only by explicit confirmation.
