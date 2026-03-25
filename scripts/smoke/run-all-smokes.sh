#!/usr/bin/env bash
# Purpose: Run full smoke suite with normalized test defaults and a single pass/fail matrix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BASE_URL="${SMOKE_API_URL:-https://test.datowave.com}"
WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-$BASE_URL}"
AUTH_ENV_FILE="${SMOKE_AUTH_ENV_FILE:-.deploy/smoke-auth.env}"
COMPOSE_FILE="${SMOKE_AUTH_COMPOSE_FILE:-infra/docker-compose.host.yml}"
HOST_ENV_FILE="${SMOKE_AUTH_HOST_ENV_FILE:-infra/.env.host}"
POSTGRES_SERVICE="${SMOKE_AUTH_POSTGRES_SERVICE:-boltorezka-db-test}"
API_SERVICE="${SMOKE_AUTH_API_SERVICE:-boltorezka-api-test}"
MEDIA_ROOM="${SMOKE_MEDIA_ROOM_SLUG:-test-room}"
EXPECT_TOPOLOGY="${SMOKE_EXPECT_MEDIA_TOPOLOGY:-livekit}"
RUN_DENIED_MEDIA_BROWSER="${SMOKE_ALL_RUN_DENIED_MEDIA_BROWSER:-1}"
RUN_WEB_E2E="${SMOKE_ALL_RUN_WEB_E2E:-1}"

SMOKE_TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}"
SMOKE_RTC_MEDIA_SETTLE_MS="${SMOKE_RTC_MEDIA_SETTLE_MS:-90000}"

STATUS=0
RESULTS=()

read_env_raw() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  local line
  line="$(grep -m1 -E "^${key}=" "$file" || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi

  printf '%s' "${line#*=}"
}

strip_outer_quotes() {
  local value="$1"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  printf '%s' "$value"
}

run_case() {
  local name="$1"
  shift

  echo "[smoke:all] running: $name"
  if "$@"; then
    RESULTS+=("PASS:$name")
    echo "[smoke:all] pass: $name"
  else
    RESULTS+=("FAIL:$name")
    STATUS=1
    echo "[smoke:all] fail: $name" >&2
  fi
}

cd "$REPO_DIR"
mkdir -p .deploy

if [[ ! -d node_modules ]]; then
  echo "[smoke:all] install npm dependencies"
  npm install --no-audit --no-fund
fi

if [[ ! -f "$AUTH_ENV_FILE" || "${SMOKE_REGENERATE_AUTH:-0}" == "1" ]]; then
  echo "[smoke:all] bootstrap smoke auth env: $AUTH_ENV_FILE"
  HOST_JWT_SECRET_RAW="$(read_env_raw TEST_JWT_SECRET "$HOST_ENV_FILE")"
  HOST_JWT_SECRET="$(strip_outer_quotes "$HOST_JWT_SECRET_RAW")"

  if ! SMOKE_API_URL="$BASE_URL" \
    SMOKE_AUTH_COMPOSE_FILE="$COMPOSE_FILE" \
    SMOKE_AUTH_ENV_FILE="$HOST_ENV_FILE" \
    SMOKE_AUTH_POSTGRES_SERVICE="$POSTGRES_SERVICE" \
    SMOKE_AUTH_API_SERVICE="$API_SERVICE" \
    SMOKE_AUTH_JWT_SECRET="$HOST_JWT_SECRET" \
    SMOKE_AUTH_OUTPUT_FILE="$AUTH_ENV_FILE" \
    npm run smoke:auth:bootstrap; then
    if [[ -f "$AUTH_ENV_FILE" ]]; then
      echo "[smoke:all] warning: bootstrap failed, continuing with existing $AUTH_ENV_FILE" >&2
    else
      echo "[smoke:all] bootstrap failed and auth env file is missing: $AUTH_ENV_FILE" >&2
      exit 1
    fi
  fi
fi

set -a
source "$AUTH_ENV_FILE"
set +a

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -n "${SMOKE_BEARER_TOKEN:-}" ]]; then
  export SMOKE_TEST_BEARER_TOKEN="$SMOKE_BEARER_TOKEN"
fi
if [[ -z "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" && -n "${SMOKE_BEARER_TOKEN_SECOND:-}" ]]; then
  export SMOKE_TEST_BEARER_TOKEN_SECOND="$SMOKE_BEARER_TOKEN_SECOND"
fi

# Compatibility: allow legacy token vars if old auth env is still present.
export SMOKE_ALLOW_LEGACY_BEARER="${SMOKE_ALLOW_LEGACY_BEARER:-1}"

EXPECTED_BUILD_SHA=""
if [[ -f ".deploy/last-deploy-test.env" ]]; then
  set +u
  source ".deploy/last-deploy-test.env"
  set -u
  EXPECTED_BUILD_SHA="${DEPLOY_SHA:-}"
fi

run_case "smoke:api" \
  env SMOKE_API_URL="$BASE_URL" npm run smoke:api

run_case "smoke:sso" \
  env SMOKE_API_URL="$BASE_URL" npm run smoke:sso

run_case "smoke:web:static" \
  env SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" npm run smoke:web:static

if [[ -n "$EXPECTED_BUILD_SHA" ]]; then
  run_case "smoke:web:version-cache" \
    env SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" SMOKE_EXPECT_BUILD_SHA="$EXPECTED_BUILD_SHA" npm run smoke:web:version-cache
else
  run_case "smoke:web:version-cache" \
    env SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" npm run smoke:web:version-cache
fi

run_case "smoke:web:denied-media" \
  env SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" npm run smoke:web:denied-media

if [[ "$RUN_DENIED_MEDIA_BROWSER" == "1" ]]; then
  run_case "smoke:web:denied-media:browser" \
    env SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" npm run smoke:web:denied-media:browser
fi

run_case "smoke:web:rnnoise:browser" \
  env SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" SMOKE_TEST_BEARER_TOKEN="${SMOKE_TEST_BEARER_TOKEN:-}" npm run smoke:web:rnnoise:browser

run_case "smoke:realtime" \
  env \
  SMOKE_API_URL="$BASE_URL" \
  SMOKE_CALL_SIGNAL=1 \
  SMOKE_RECONNECT=1 \
  SMOKE_REQUIRE_MEDIA_TOPOLOGY=1 \
  SMOKE_EXPECT_MEDIA_TOPOLOGY="$EXPECT_TOPOLOGY" \
  SMOKE_TIMEOUT_MS="$SMOKE_TIMEOUT_MS" \
  npm run smoke:realtime

run_case "smoke:realtime:media:room" \
  env \
  SMOKE_API_URL="$BASE_URL" \
  SMOKE_ROOM_SLUG="$MEDIA_ROOM" \
  SMOKE_AUTH_ENV_FILE="$AUTH_ENV_FILE" \
  SMOKE_TIMEOUT_MS="$SMOKE_TIMEOUT_MS" \
  SMOKE_RTC_MEDIA_SETTLE_MS="$SMOKE_RTC_MEDIA_SETTLE_MS" \
  bash ./scripts/smoke/run-realtime-media-test-room.sh

if [[ "$RUN_WEB_E2E" == "1" ]]; then
  run_case "smoke:web:e2e" \
    env \
    SMOKE_API_URL="$BASE_URL" \
    SMOKE_WEB_BASE_URL="$WEB_BASE_URL" \
    SMOKE_E2E_CALL_SIGNAL=1 \
    SMOKE_E2E_RECONNECT=1 \
    SMOKE_E2E_DENIED_MEDIA=1 \
    SMOKE_E2E_DENIED_MEDIA_BROWSER="$RUN_DENIED_MEDIA_BROWSER" \
    SMOKE_EXPECT_MEDIA_TOPOLOGY="$EXPECT_TOPOLOGY" \
    SMOKE_TIMEOUT_MS="$SMOKE_TIMEOUT_MS" \
    bash ./scripts/smoke/smoke-web-e2e.sh
fi

echo "[smoke:all] summary"
printf '%s\n' "${RESULTS[@]}"

exit "$STATUS"
