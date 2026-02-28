#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMOKE_API_URL:-http://localhost:8080}"
RUN_CALL_SIGNAL="${SMOKE_E2E_CALL_SIGNAL:-1}"
RUN_RECONNECT="${SMOKE_E2E_RECONNECT:-1}"
COMPOSE_FILE="${SMOKE_E2E_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${SMOKE_E2E_ENV_FILE:-infra/.env.host}"
POSTGRES_SERVICE="${SMOKE_E2E_POSTGRES_SERVICE:-boltorezka-db-test}"
REDIS_SERVICE="${SMOKE_E2E_REDIS_SERVICE:-boltorezka-redis-test}"
USER_EMAIL="${SMOKE_USER_EMAIL:-gismalink@gmail.com}"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

auto_generate_tickets() {
  if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  set -a
  source "$ENV_FILE"
  set +a

  if [[ -z "${TEST_POSTGRES_USER:-}" || -z "${TEST_POSTGRES_DB:-}" ]]; then
    echo "[smoke:web-e2e] TEST_POSTGRES_USER/TEST_POSTGRES_DB are required for auto-ticket" >&2
    return 1
  fi

  local payload
  payload="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select json_build_object('userId', id::text, 'userName', coalesce(name,email,'unknown'), 'email', email, 'role', coalesce(role,'user'), 'issuedAt', now()::text)::text from users where email='${USER_EMAIL}' limit 1;")"

  if [[ -z "$payload" ]]; then
    echo "[smoke:web-e2e] cannot resolve smoke user payload for email=$USER_EMAIL" >&2
    return 1
  fi

  if [[ -z "${SMOKE_WS_TICKET:-}" ]]; then
    local primary
    primary="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$primary" 120 "$payload" >/dev/null
    export SMOKE_WS_TICKET="$primary"
  fi

  if [[ "$RUN_CALL_SIGNAL" == "1" && -z "${SMOKE_WS_TICKET_SECOND:-}" ]]; then
    local second
    second="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$second" 120 "$payload" >/dev/null
    export SMOKE_WS_TICKET_SECOND="$second"
  fi

  if [[ "$RUN_RECONNECT" == "1" && -z "${SMOKE_WS_TICKET_RECONNECT:-}" ]]; then
    local reconnect
    reconnect="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$reconnect" 120 "$payload" >/dev/null
    export SMOKE_WS_TICKET_RECONNECT="$reconnect"
  fi

  return 0
}

if [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  echo "[smoke:web-e2e] no bearer/ticket provided, trying auto-ticket path"
  if ! auto_generate_tickets; then
    echo "[smoke:web-e2e] requires SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET (or working auto-ticket path)" >&2
    exit 1
  fi
fi

if [[ "$RUN_CALL_SIGNAL" == "1" ]] && [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET_SECOND:-}" ]]; then
  echo "[smoke:web-e2e] call-signal needs second ticket, trying auto-ticket path"
  if ! auto_generate_tickets; then
    echo "[smoke:web-e2e] call-signal scenario requires SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET_SECOND" >&2
    exit 1
  fi
fi

echo "[smoke:web-e2e] login redirect"
SMOKE_API_URL="$BASE_URL" npm run smoke:sso

echo "[smoke:web-e2e] realtime join/send + voice signal + reconnect"
SMOKE_API_URL="$BASE_URL" \
SMOKE_CALL_SIGNAL="$RUN_CALL_SIGNAL" \
SMOKE_RECONNECT="$RUN_RECONNECT" \
npm run smoke:realtime

echo "[smoke:web-e2e] done"
