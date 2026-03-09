#!/usr/bin/env bash
# Purpose: start LiveKit service in production contour using compose profile.
set -euo pipefail

COMPOSE_FILE="${HOST_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${HOST_ENV_FILE:-infra/.env.host}"
PROFILE="${LIVEKIT_PROD_PROFILE:-livekit-prod}"
SERVICE="boltorezka-livekit-prod"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[livekit-prod-up] compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[livekit-prod-up] env file not found: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile "$PROFILE" "$@"
}

echo "[livekit-prod-up] starting $SERVICE (profile=$PROFILE)"
compose up -d "$SERVICE"
compose ps "$SERVICE"
