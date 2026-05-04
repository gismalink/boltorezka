#!/usr/bin/env bash
# Purpose: stop LiveKit production service without changing current API routing profile.
set -euo pipefail

COMPOSE_FILE="${HOST_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${HOST_ENV_FILE:-infra/.env.host}"
PROFILE="${LIVEKIT_PROD_PROFILE:-livekit-prod}"
SERVICE="datowave-livekit-prod"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[livekit-prod-down] compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[livekit-prod-down] env file not found: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile "$PROFILE" "$@"
}

echo "[livekit-prod-down] stopping $SERVICE"
compose stop "$SERVICE" || true
compose rm -f "$SERVICE" || true
