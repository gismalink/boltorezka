#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-$PWD}"
BASE_URL="${SMOKE_API_URL:-https://test.boltorezka.gismalink.art}"
COMPOSE_FILE="infra/docker-compose.host.yml"
ENV_FILE="infra/.env.host"
POSTGRES_SERVICE="${TEST_POSTGRES_SERVICE:-boltorezka-db-test}"
REDIS_SERVICE="${TEST_REDIS_SERVICE:-boltorezka-redis-test}"
USER_EMAIL="${SMOKE_USER_EMAIL:-gismalink@gmail.com}"
SUMMARY_FILE_REL=".deploy/last-smoke-summary.env"

SMOKE_TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SMOKE_STATUS="fail"
SMOKE_NACK_DELTA=0
SMOKE_ACK_DELTA=0
SMOKE_CHAT_SENT_DELTA=0
SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=0
SMOKE_SUMMARY_TEXT="health=fail mode=unknown sso=fail realtime=fail delta(nack=0,ack=0,chat=0,idem=0)"

write_summary() {
  mkdir -p .deploy

  printf 'SMOKE_TIMESTAMP_UTC=%q\n' "$SMOKE_TIMESTAMP_UTC" >"$SUMMARY_FILE_REL"
  printf 'SMOKE_BASE_URL=%q\n' "$BASE_URL" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_STATUS=%q\n' "$SMOKE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_NACK_DELTA=%q\n' "$SMOKE_NACK_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_ACK_DELTA=%q\n' "$SMOKE_ACK_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_SENT_DELTA=%q\n' "$SMOKE_CHAT_SENT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=%q\n' "$SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_SUMMARY_TEXT=%q\n' "$SMOKE_SUMMARY_TEXT" >>"$SUMMARY_FILE_REL"
}

trap write_summary EXIT

if [[ "${SMOKE_REALTIME:-1}" != "0" ]] && [[ -z "${SMOKE_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
  AUTO_TICKET=1
else
  AUTO_TICKET=0
fi

cd "$REPO_DIR"
mkdir -p .deploy

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

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

make_hs256_jwt() {
  local secret="$1"
  local sub="$2"
  local role="$3"
  local now exp header payload unsigned signature

  now="$(date +%s)"
  exp="$((now + 3600))"
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"sub\":\"$sub\",\"role\":\"$role\",\"iat\":$now,\"exp\":$exp}"

  unsigned="$(printf '%s' "$header" | base64url).$(printf '%s' "$payload" | base64url)"
  signature="$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$secret" -binary | base64url)"
  printf '%s.%s' "$unsigned" "$signature"
}

metric_from_hgetall() {
  local raw="$1"
  local key="$2"
  printf '%s\n' "$raw" | awk -v target="$key" '
    $0 == target {
      if (getline > 0) {
        print $0;
      } else {
        print 0;
      }
      found = 1;
      exit;
    }
    END {
      if (!found) {
        print 0;
      }
    }
  '
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

if [[ "${SMOKE_API:-1}" == "0" ]]; then
  echo "[postdeploy-smoke] smoke:api skipped (SMOKE_API=0)"
else
  echo "[postdeploy-smoke] smoke:api"
  SMOKE_API_URL="$BASE_URL" npm run smoke:api
fi

if [[ "${SMOKE_REALTIME:-1}" == "0" ]]; then
  echo "[postdeploy-smoke] realtime smoke skipped (SMOKE_REALTIME=0)"
  SMOKE_STATUS="pass"
  SMOKE_SUMMARY_TEXT="health=pass mode=sso sso=pass api=pass realtime=skip delta(nack=0,ack=0,chat=0,idem=0)"
  exit 0
fi

set -a
source "$ENV_FILE"
set +a

SMOKE_USER_ID=""
SMOKE_USER_ROLE=""

if [[ -z "${SMOKE_BEARER_TOKEN:-}" ]]; then
  if [[ -z "${TEST_POSTGRES_USER:-}" || -z "${TEST_POSTGRES_DB:-}" ]]; then
    echo "[postdeploy-smoke] TEST_POSTGRES_USER/TEST_POSTGRES_DB are required for auto-bearer" >&2
    exit 1
  fi

  USER_META="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select id::text || '|' || coalesce(role,'user') from users where email='${USER_EMAIL}' limit 1;")"

  if [[ -z "$USER_META" ]]; then
    echo "[postdeploy-smoke] cannot resolve smoke user for auto-bearer email=$USER_EMAIL" >&2
    exit 1
  fi

  SMOKE_USER_ID="${USER_META%%|*}"
  SMOKE_USER_ROLE="${USER_META##*|}"

  if [[ -z "${JWT_SECRET:-}" ]]; then
    echo "[postdeploy-smoke] JWT_SECRET is required for auto-bearer generation" >&2
    exit 1
  fi

  GENERATED_BEARER="$(make_hs256_jwt "$JWT_SECRET" "$SMOKE_USER_ID" "$SMOKE_USER_ROLE")"
  export SMOKE_BEARER_TOKEN="$GENERATED_BEARER"
fi

if [[ "$AUTO_TICKET" == "1" ]]; then
  if [[ -z "${TEST_POSTGRES_USER:-}" || -z "${TEST_POSTGRES_DB:-}" ]]; then
    echo "[postdeploy-smoke] TEST_POSTGRES_USER/TEST_POSTGRES_DB are required for auto-ticket" >&2
    exit 1
  fi

  if [[ -z "$SMOKE_USER_ID" || -z "$SMOKE_USER_ROLE" ]]; then
    USER_META="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select id::text || '|' || coalesce(role,'user') from users where email='${USER_EMAIL}' limit 1;")"
    if [[ -z "$USER_META" ]]; then
      echo "[postdeploy-smoke] cannot resolve smoke user for auto-ticket email=$USER_EMAIL" >&2
      exit 1
    fi
    SMOKE_USER_ID="${USER_META%%|*}"
    SMOKE_USER_ROLE="${USER_META##*|}"
  fi

  PAYLOAD="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select json_build_object('userId', id::text, 'userName', coalesce(name,email,'unknown'), 'email', email, 'role', coalesce(role,'user'), 'issuedAt', now()::text)::text from users where id='${SMOKE_USER_ID}' limit 1;")"

  if [[ -z "$PAYLOAD" ]]; then
    echo "[postdeploy-smoke] cannot resolve smoke user payload for email=$USER_EMAIL" >&2
    exit 1
  fi

  GENERATED_TICKET="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$GENERATED_TICKET" 120 "$PAYLOAD" >/dev/null
  export SMOKE_WS_TICKET="$GENERATED_TICKET"

  GENERATED_RECONNECT_TICKET="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$GENERATED_RECONNECT_TICKET" 120 "$PAYLOAD" >/dev/null
  export SMOKE_WS_TICKET_RECONNECT="$GENERATED_RECONNECT_TICKET"
fi

DAY="$(date -u +%F)"

if [[ ! -d "node_modules/ws" ]]; then
  echo "[postdeploy-smoke] install npm dependencies (ws missing)"
  npm install --no-audit --no-fund
fi

echo "[postdeploy-smoke] realtime metrics before"
METRICS_BEFORE_RAW="$(compose exec -T "$REDIS_SERVICE" redis-cli HGETALL "ws:metrics:$DAY" | cat)"
printf '%s\n' "$METRICS_BEFORE_RAW"

NACK_BEFORE="$(metric_from_hgetall "$METRICS_BEFORE_RAW" "nack_sent")"
ACK_BEFORE="$(metric_from_hgetall "$METRICS_BEFORE_RAW" "ack_sent")"
CHAT_SENT_BEFORE="$(metric_from_hgetall "$METRICS_BEFORE_RAW" "chat_sent")"
CHAT_IDEMPOTENCY_HIT_BEFORE="$(metric_from_hgetall "$METRICS_BEFORE_RAW" "chat_idempotency_hit")"

echo "[postdeploy-smoke] smoke:realtime"
SMOKE_API_URL="$BASE_URL" SMOKE_RECONNECT=1 npm run smoke:realtime

echo "[postdeploy-smoke] realtime metrics after"
METRICS_AFTER_RAW="$(compose exec -T "$REDIS_SERVICE" redis-cli HGETALL "ws:metrics:$DAY" | cat)"
printf '%s\n' "$METRICS_AFTER_RAW"

NACK_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "nack_sent")"
ACK_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "ack_sent")"
CHAT_SENT_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "chat_sent")"
CHAT_IDEMPOTENCY_HIT_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "chat_idempotency_hit")"

SMOKE_NACK_DELTA=$((NACK_AFTER - NACK_BEFORE))
SMOKE_ACK_DELTA=$((ACK_AFTER - ACK_BEFORE))
SMOKE_CHAT_SENT_DELTA=$((CHAT_SENT_AFTER - CHAT_SENT_BEFORE))
SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=$((CHAT_IDEMPOTENCY_HIT_AFTER - CHAT_IDEMPOTENCY_HIT_BEFORE))

SMOKE_STATUS="pass"
SMOKE_SUMMARY_TEXT="health=pass mode=sso sso=pass api=pass realtime=pass delta(nack=$SMOKE_NACK_DELTA,ack=$SMOKE_ACK_DELTA,chat=$SMOKE_CHAT_SENT_DELTA,idem=$SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA)"

echo "[postdeploy-smoke] done"
