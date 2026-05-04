#!/usr/bin/env bash
# Purpose: stop LiveKit test service while keeping current default RTC routing unchanged.
set -euo pipefail

COMPOSE_FILE="${HOST_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${HOST_ENV_FILE:-infra/.env.host}"
PROFILE="${LIVEKIT_TEST_PROFILE:-livekit-test}"
SERVICE="datowave-livekit-test"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[livekit-test-down] compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[livekit-test-down] env file not found: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile "$PROFILE" "$@"
}

echo "[livekit-test-down] stopping $SERVICE"
compose stop "$SERVICE" || true
compose rm -f "$SERVICE" || true
