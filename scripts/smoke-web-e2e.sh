#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMOKE_API_URL:-http://localhost:8080}"
RUN_CALL_SIGNAL="${SMOKE_E2E_CALL_SIGNAL:-1}"
RUN_RECONNECT="${SMOKE_E2E_RECONNECT:-1}"

if [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  echo "[smoke:web-e2e] requires SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET" >&2
  exit 1
fi

if [[ "$RUN_CALL_SIGNAL" == "1" ]] && [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET_SECOND:-}" ]]; then
  echo "[smoke:web-e2e] call-signal scenario requires SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET_SECOND" >&2
  exit 1
fi

echo "[smoke:web-e2e] login redirect"
SMOKE_API_URL="$BASE_URL" npm run smoke:sso

echo "[smoke:web-e2e] realtime join/send + voice signal + reconnect"
SMOKE_API_URL="$BASE_URL" \
SMOKE_CALL_SIGNAL="$RUN_CALL_SIGNAL" \
SMOKE_RECONNECT="$RUN_RECONNECT" \
npm run smoke:realtime

echo "[smoke:web-e2e] done"
