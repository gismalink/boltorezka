#!/usr/bin/env bash
# Purpose: Run end-to-end smoke scenario (SSO, realtime, media, static contract) for web app.
set -euo pipefail

BASE_URL="${SMOKE_API_URL:-http://localhost:8080}"
RUN_CALL_SIGNAL="${SMOKE_E2E_CALL_SIGNAL:-1}"
RUN_RECONNECT="${SMOKE_E2E_RECONNECT:-1}"
RUN_DENIED_MEDIA="${SMOKE_E2E_DENIED_MEDIA:-1}"
RUN_DENIED_MEDIA_BROWSER="${SMOKE_E2E_DENIED_MEDIA_BROWSER:-0}"
RUN_AGENT_SEMANTICS_BROWSER="${SMOKE_E2E_AGENT_SEMANTICS_BROWSER:-1}"
RUN_STATIC_CONTRACT="${SMOKE_E2E_STATIC_CONTRACT:-1}"
COMPOSE_FILE="${SMOKE_E2E_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${SMOKE_E2E_ENV_FILE:-infra/.env.host}"
POSTGRES_SERVICE="${SMOKE_E2E_POSTGRES_SERVICE:-datowave-db-test}"
REDIS_SERVICE="${SMOKE_E2E_REDIS_SERVICE:-datowave-redis-test}"
USER_EMAIL="${SMOKE_USER_EMAIL:-smoke-rtc-1@example.test}"
USER_EMAIL_SECOND="${SMOKE_USER_EMAIL_SECOND:-smoke-rtc-2@example.test}"

require_test_email() {
  local email="$1"
  local label="$2"

  if [[ "${SMOKE_ALLOW_NON_TEST_ACCOUNTS:-0}" == "1" ]]; then
    return 0
  fi

  if [[ -z "$email" || "$email" != *@example.test ]]; then
    echo "[smoke:web-e2e] $label must be a dedicated test account (@example.test): $email" >&2
    echo "[smoke:web-e2e] set SMOKE_ALLOW_NON_TEST_ACCOUNTS=1 only for explicit exception" >&2
    exit 1
  fi
}

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

  local payload_second=""
  if [[ "$RUN_CALL_SIGNAL" == "1" ]]; then
    if [[ -n "$USER_EMAIL_SECOND" ]]; then
      payload_second="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select json_build_object('userId', id::text, 'userName', coalesce(name,email,'unknown'), 'email', email, 'role', coalesce(role,'user'), 'issuedAt', now()::text)::text from users where email='${USER_EMAIL_SECOND}' limit 1;")"
      if [[ -z "$payload_second" ]]; then
        echo "[smoke:web-e2e] cannot resolve second smoke user payload for email=$USER_EMAIL_SECOND" >&2
        return 1
      fi
    else
      payload_second="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select json_build_object('userId', id::text, 'userName', coalesce(name,email,'unknown'), 'email', email, 'role', coalesce(role,'user'), 'issuedAt', now()::text)::text from users where email <> '${USER_EMAIL}' order by created_at asc limit 1;")"
      if [[ -z "$payload_second" ]]; then
        echo "[smoke:web-e2e] cannot resolve second smoke user payload (set SMOKE_USER_EMAIL_SECOND)" >&2
        return 1
      fi
    fi
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
    compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$second" 120 "$payload_second" >/dev/null
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

require_test_email "$USER_EMAIL" "SMOKE_USER_EMAIL"
if [[ -n "$USER_EMAIL_SECOND" ]]; then
  require_test_email "$USER_EMAIL_SECOND" "SMOKE_USER_EMAIL_SECOND"
fi

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  echo "[smoke:web-e2e] no bearer/ticket provided, trying auto-ticket path"
  if ! auto_generate_tickets; then
    echo "[smoke:web-e2e] requires SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET (or working auto-ticket path)" >&2
    exit 1
  fi
fi

if [[ "$RUN_CALL_SIGNAL" == "1" ]] && [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET_SECOND:-}" ]]; then
  echo "[smoke:web-e2e] call-signal needs second ticket, trying auto-ticket path"
  if ! auto_generate_tickets; then
    echo "[smoke:web-e2e] call-signal scenario requires SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET_SECOND" >&2
    exit 1
  fi
fi

if [[ "$RUN_STATIC_CONTRACT" == "1" ]]; then
  echo "[smoke:web-e2e] static delivery contract"
  SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-$BASE_URL}" npm run smoke:web:static
else
  echo "[smoke:web-e2e] static delivery contract skipped (SMOKE_E2E_STATIC_CONTRACT=0)"
fi

echo "[smoke:web-e2e] login redirect"
SMOKE_API_URL="$BASE_URL" npm run smoke:sso

echo "[smoke:web-e2e] realtime join/send + voice signal + reconnect"
SMOKE_API_URL="$BASE_URL" \
SMOKE_CALL_SIGNAL="$RUN_CALL_SIGNAL" \
SMOKE_RECONNECT="$RUN_RECONNECT" \
SMOKE_TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}" \
SMOKE_REQUIRE_MEDIA_TOPOLOGY="${SMOKE_REQUIRE_MEDIA_TOPOLOGY:-1}" \
SMOKE_EXPECT_MEDIA_TOPOLOGY="${SMOKE_EXPECT_MEDIA_TOPOLOGY:-livekit}" \
npm run smoke:realtime

if [[ "$RUN_DENIED_MEDIA" == "1" ]]; then
  echo "[smoke:web-e2e] denied-media ux gate"
  npm run smoke:web:denied-media
else
  echo "[smoke:web-e2e] denied-media ux gate skipped (SMOKE_E2E_DENIED_MEDIA=0)"
fi

if [[ "$RUN_DENIED_MEDIA_BROWSER" == "1" ]]; then
  echo "[smoke:web-e2e] denied-media browser gate"
  SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-$BASE_URL}" npm run smoke:web:denied-media:browser
else
  echo "[smoke:web-e2e] denied-media browser gate skipped (SMOKE_E2E_DENIED_MEDIA_BROWSER=0)"
fi

if [[ "$RUN_AGENT_SEMANTICS_BROWSER" == "1" ]]; then
  if [[ -n "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
    echo "[smoke:web-e2e] agent semantics browser gate"
    SMOKE_API_URL="$BASE_URL" \
    SMOKE_WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-$BASE_URL}" \
    SMOKE_TEST_BEARER_TOKEN="${SMOKE_TEST_BEARER_TOKEN}" \
    npm run smoke:web:agent-semantics:browser
  else
    echo "[smoke:web-e2e] agent semantics browser gate skipped (SMOKE_TEST_BEARER_TOKEN missing)"
  fi
else
  echo "[smoke:web-e2e] agent semantics browser gate skipped (SMOKE_E2E_AGENT_SEMANTICS_BROWSER=0)"
fi

echo "[smoke:web-e2e] done"
