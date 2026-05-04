#!/usr/bin/env bash
# Purpose: verify LiveKit production service status and basic health signal.
set -euo pipefail

COMPOSE_FILE="${HOST_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${HOST_ENV_FILE:-infra/.env.host}"
PROFILE="${LIVEKIT_PROD_PROFILE:-livekit-prod}"
SERVICE="datowave-livekit-prod"
SIGNAL_PORT="${PROD_LIVEKIT_SIGNAL_PORT:-7880}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[livekit-prod-check] compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[livekit-prod-check] env file not found: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile "$PROFILE" "$@"
}

echo "[livekit-prod-check] compose status"
compose ps "$SERVICE"

echo "[livekit-prod-check] recent logs"
compose logs --tail=80 "$SERVICE"

echo "[livekit-prod-check] http probe (non-fatal)"
curl -fsS "http://127.0.0.1:${SIGNAL_PORT}/" >/dev/null 2>&1 && echo "[livekit-prod-check] http probe ok" || echo "[livekit-prod-check] http probe skipped/failed"
