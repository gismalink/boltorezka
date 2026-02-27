#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-$HOME/boltorezka}"
BASE_URL="${SMOKE_API_URL:-https://test.boltorezka.gismalink.art}"
COMPOSE_FILE="infra/docker-compose.host.yml"
ENV_FILE="infra/.env.host"
POSTGRES_SERVICE="${TEST_POSTGRES_SERVICE:-boltorezka-db-test}"
REDIS_SERVICE="${TEST_REDIS_SERVICE:-boltorezka-redis-test}"
USER_EMAIL="${SMOKE_USER_EMAIL:-gismalink@gmail.com}"

if [[ "${SMOKE_REALTIME:-1}" != "0" ]] && [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  AUTO_TICKET=1
else
  AUTO_TICKET=0
fi

cd "$REPO_DIR"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[postdeploy-smoke] missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[postdeploy-smoke] missing env file: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "[postdeploy-smoke] health"
curl -fsS "$BASE_URL/health" >/dev/null

echo "[postdeploy-smoke] auth mode"
MODE_JSON="$(curl -fsS "$BASE_URL/v1/auth/mode")"
if [[ "$MODE_JSON" != *'"mode":"sso"'* ]]; then
  echo "[postdeploy-smoke] expected mode=sso, got: $MODE_JSON" >&2
  exit 1
fi

echo "[postdeploy-smoke] smoke:sso"
SMOKE_API_URL="$BASE_URL" npm run smoke:sso

if [[ "${SMOKE_REALTIME:-1}" == "0" ]]; then
  echo "[postdeploy-smoke] realtime smoke skipped (SMOKE_REALTIME=0)"
  exit 0
fi

set -a
source "$ENV_FILE"
set +a

if [[ "$AUTO_TICKET" == "1" ]]; then
  if [[ -z "${TEST_POSTGRES_USER:-}" || -z "${TEST_POSTGRES_DB:-}" ]]; then
    echo "[postdeploy-smoke] TEST_POSTGRES_USER/TEST_POSTGRES_DB are required for auto-ticket" >&2
    exit 1
  fi

  PAYLOAD="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select json_build_object('userId', id::text, 'userName', coalesce(name,email,'unknown'), 'email', email, 'role', coalesce(role,'user'), 'issuedAt', now()::text)::text from users where email='${USER_EMAIL}' limit 1;")"

  if [[ -z "$PAYLOAD" ]]; then
    echo "[postdeploy-smoke] cannot resolve smoke user payload for email=$USER_EMAIL" >&2
    exit 1
  fi

  GENERATED_TICKET="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$GENERATED_TICKET" 120 "$PAYLOAD" >/dev/null
  export SMOKE_WS_TICKET="$GENERATED_TICKET"
fi

DAY="$(date -u +%F)"
echo "[postdeploy-smoke] realtime metrics before"
compose exec -T "$REDIS_SERVICE" redis-cli HGETALL "ws:metrics:$DAY" | cat

echo "[postdeploy-smoke] smoke:realtime"
SMOKE_API_URL="$BASE_URL" npm run smoke:realtime

echo "[postdeploy-smoke] realtime metrics after"
compose exec -T "$REDIS_SERVICE" redis-cli HGETALL "ws:metrics:$DAY" | cat

echo "[postdeploy-smoke] done"
