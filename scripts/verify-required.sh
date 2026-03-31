#!/usr/bin/env bash
# Purpose: Mandatory verification gate for CI/test checks (API + SSO + realtime).
set -euo pipefail

REQUIRED_PROFILE="${CHECK_REQUIRED_PROFILE:-core}"

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  echo "[verify:required] missing SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET" >&2
  exit 1
fi

export SMOKE_API=1
export SMOKE_SSO=1
export SMOKE_REALTIME=1
export SMOKE_REQUIRE_INITIAL_STATE_REPLAY="${SMOKE_REQUIRE_INITIAL_STATE_REPLAY:-1}"
export SMOKE_WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-${SMOKE_API_URL:-http://localhost:8080}}"

bash ./scripts/verify-all.sh

echo "[verify:required] web static contract"
npm run smoke:web:static

if [[ "${SMOKE_WEB_E2E_REQUIRED:-0}" == "1" ]]; then
  echo "[verify:required] web e2e"
  npm run smoke:web:e2e
else
  echo "[verify:required] web e2e skipped (set SMOKE_WEB_E2E_REQUIRED=1 to enable)"
fi

if [[ "$REQUIRED_PROFILE" == "desktop" || "${REQUIRE_DESKTOP_SMOKE:-0}" == "1" ]]; then
  echo "[verify:required] desktop smoke profile"
  npm run desktop:smoke:full
else
  echo "[verify:required] desktop smoke skipped (set CHECK_REQUIRED_PROFILE=desktop)"
fi

COOKIE_MODE_EFFECTIVE="${TEST_AUTH_COOKIE_MODE:-${AUTH_COOKIE_MODE:-0}}"
if [[ "$COOKIE_MODE_EFFECTIVE" == "1" ]]; then
  echo "[verify:required] auth cookie-mode smoke"
  npm run smoke:auth:cookie-mode
else
  echo "[verify:required] auth cookie-mode smoke skipped (cookie-mode disabled)"
fi
