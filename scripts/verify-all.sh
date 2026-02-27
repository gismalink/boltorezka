#!/usr/bin/env bash
set -euo pipefail

echo "[verify] docker compose config"
docker compose config -q

echo "[verify] api health (best-effort local)"
if curl -fsS "${SMOKE_API_URL:-http://localhost:8080}/health" >/dev/null 2>&1; then
  echo "[verify] local api is reachable"
else
  echo "[verify] local api is not reachable (skipping direct health gate)"
fi

if [[ "${SMOKE_API:-0}" == "1" ]]; then
  echo "[verify] smoke api"
  node ./scripts/smoke-api.mjs
else
  echo "[verify] smoke api skipped (set SMOKE_API=1 to enable)"
fi

if [[ "${SMOKE_SSO:-0}" == "1" ]]; then
  echo "[verify] smoke sso"
  node ./scripts/smoke-sso-redirect.mjs
else
  echo "[verify] smoke sso skipped (set SMOKE_SSO=1 to enable)"
fi

if [[ "${SMOKE_REALTIME:-0}" == "1" ]]; then
  if [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
    echo "[verify] smoke realtime requires SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET"
    exit 1
  fi
  echo "[verify] smoke realtime"
  node ./scripts/smoke-realtime.mjs
else
  echo "[verify] smoke realtime skipped (set SMOKE_REALTIME=1 to enable)"
fi

echo "[verify] done"
