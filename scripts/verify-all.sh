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

echo "[verify] done"
