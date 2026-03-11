#!/usr/bin/env bash
# Purpose: Mandatory verification gate for CI/test checks (API + SSO + realtime).
set -euo pipefail

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  echo "[verify:required] missing SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET" >&2
  exit 1
fi

export SMOKE_API=1
export SMOKE_SSO=1
export SMOKE_REALTIME=1
export SMOKE_REQUIRE_INITIAL_STATE_REPLAY="${SMOKE_REQUIRE_INITIAL_STATE_REPLAY:-1}"

bash ./scripts/verify-all.sh
