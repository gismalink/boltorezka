#!/usr/bin/env bash
# Purpose: Execute post-deploy smoke checks (SSO/API/version/realtime) and summarize results.
set -euo pipefail

REPO_DIR="${1:-$PWD}"
BASE_URL="${SMOKE_API_URL:-https://test.boltorezka.gismalink.art}"
WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-$BASE_URL}"
COMPOSE_FILE="infra/docker-compose.host.yml"
ENV_FILE="infra/.env.host"
POSTGRES_SERVICE="${TEST_POSTGRES_SERVICE:-boltorezka-db-test}"
REDIS_SERVICE="${TEST_REDIS_SERVICE:-boltorezka-redis-test}"
API_SERVICE="${TEST_API_SERVICE:-boltorezka-api-test}"
USER_EMAIL="${SMOKE_USER_EMAIL:-smoke-rtc-1@example.test}"
USER_EMAIL_SECOND="${SMOKE_USER_EMAIL_SECOND:-smoke-rtc-2@example.test}"
USER_EMAIL_THIRD="${SMOKE_USER_EMAIL_THIRD:-smoke-rtc-3@example.test}"
SUMMARY_FILE_REL=".deploy/last-smoke-summary.env"

SMOKE_TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SMOKE_STATUS="fail"
SMOKE_NACK_DELTA=0
SMOKE_ACK_DELTA=0
SMOKE_CHAT_SENT_DELTA=0
SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=0
SMOKE_CALL_INITIAL_STATE_SENT_DELTA=0
SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA=0
SMOKE_SUMMARY_TEXT="health=fail mode=unknown sso=fail realtime=fail delta(nack=0,ack=0,chat=0,idem=0,initial_state=0,initial_state_participants=0)"
API_SMOKE_STATUS="skip"
VERSION_CACHE_STATUS="skip"
EXTENDED_REALTIME_STATUS="skip"
JWT_SECRET_CANDIDATE=""

write_summary() {
  mkdir -p .deploy

  printf 'SMOKE_TIMESTAMP_UTC=%q\n' "$SMOKE_TIMESTAMP_UTC" >"$SUMMARY_FILE_REL"
  printf 'SMOKE_BASE_URL=%q\n' "$BASE_URL" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_WEB_BASE_URL=%q\n' "$WEB_BASE_URL" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_STATUS=%q\n' "$SMOKE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_NACK_DELTA=%q\n' "$SMOKE_NACK_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_ACK_DELTA=%q\n' "$SMOKE_ACK_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_SENT_DELTA=%q\n' "$SMOKE_CHAT_SENT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=%q\n' "$SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CALL_INITIAL_STATE_SENT_DELTA=%q\n' "$SMOKE_CALL_INITIAL_STATE_SENT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA=%q\n' "$SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_EXTENDED_REALTIME_STATUS=%q\n' "$EXTENDED_REALTIME_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_SUMMARY_TEXT=%q\n' "$SMOKE_SUMMARY_TEXT" >>"$SUMMARY_FILE_REL"
}

trap write_summary EXIT

if [[ "${SMOKE_REALTIME:-1}" != "0" ]] && [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -z "${SMOKE_WS_TICKET:-}" ]]; then
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

require_test_email() {
  local email="$1"
  local label="$2"

  if [[ "${SMOKE_ALLOW_NON_TEST_ACCOUNTS:-0}" == "1" ]]; then
    return 0
  fi

  if [[ -z "$email" || "$email" != *@example.test ]]; then
    echo "[postdeploy-smoke] $label must be a dedicated test account (@example.test): $email" >&2
    echo "[postdeploy-smoke] set SMOKE_ALLOW_NON_TEST_ACCOUNTS=1 only for explicit exception" >&2
    exit 1
  fi
}

resolve_user_meta_by_email() {
  local email="$1"

  if [[ -z "${TEST_POSTGRES_USER:-}" || -z "${TEST_POSTGRES_DB:-}" ]]; then
    echo "[postdeploy-smoke] TEST_POSTGRES_USER/TEST_POSTGRES_DB are required" >&2
    exit 1
  fi

  compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select id::text || '|' || coalesce(role,'user') from users where email='${email}' limit 1;"
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

require_test_email "$USER_EMAIL" "SMOKE_USER_EMAIL"
if [[ -n "$USER_EMAIL_SECOND" ]]; then
  require_test_email "$USER_EMAIL_SECOND" "SMOKE_USER_EMAIL_SECOND"
fi
if [[ -n "$USER_EMAIL_THIRD" ]]; then
  require_test_email "$USER_EMAIL_THIRD" "SMOKE_USER_EMAIL_THIRD"
fi

set -a
source "$ENV_FILE"
set +a

SMOKE_USER_ID=""
SMOKE_USER_ROLE=""

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
  USER_META="$(resolve_user_meta_by_email "$USER_EMAIL")"

  if [[ -z "$USER_META" ]]; then
    echo "[postdeploy-smoke] cannot resolve smoke user for auto-bearer email=$USER_EMAIL" >&2
    exit 1
  fi

  SMOKE_USER_ID="${USER_META%%|*}"
  SMOKE_USER_ROLE="${USER_META##*|}"

  JWT_SECRET_CANDIDATE="${JWT_SECRET:-${TEST_JWT_SECRET:-}}"

  if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
    JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r' | tr -d '\n')"
  fi

  if [[ -n "$JWT_SECRET_CANDIDATE" ]]; then
    GENERATED_BEARER="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "$SMOKE_USER_ID" "$SMOKE_USER_ROLE")"
    export SMOKE_TEST_BEARER_TOKEN="$GENERATED_BEARER"
  else
    echo "[postdeploy-smoke] warning: cannot resolve JWT secret; protected smoke:api checks may be skipped"
  fi
fi

if [[ "${SMOKE_API:-1}" == "0" ]]; then
  echo "[postdeploy-smoke] smoke:api skipped (SMOKE_API=0)"
  API_SMOKE_STATUS="skip"
else
  echo "[postdeploy-smoke] smoke:api"
  SMOKE_API_URL="$BASE_URL" npm run smoke:api
  API_SMOKE_STATUS="pass"
fi

echo "[postdeploy-smoke] smoke:web:version-cache"
EXPECTED_BUILD_SHA=""
if [[ -f ".deploy/last-deploy-test.env" ]]; then
  set +u
  source ".deploy/last-deploy-test.env"
  set -u
  EXPECTED_BUILD_SHA="${DEPLOY_SHA:-}"
fi

if [[ -n "$EXPECTED_BUILD_SHA" ]]; then
  SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" SMOKE_EXPECT_BUILD_SHA="$EXPECTED_BUILD_SHA" npm run smoke:web:version-cache
else
  SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" npm run smoke:web:version-cache
fi
VERSION_CACHE_STATUS="pass"

if [[ "${SMOKE_REALTIME:-1}" == "0" ]]; then
  echo "[postdeploy-smoke] realtime smoke skipped (SMOKE_REALTIME=0)"
  SMOKE_STATUS="pass"
  SMOKE_SUMMARY_TEXT="health=pass mode=sso sso=pass api=$API_SMOKE_STATUS version_cache=$VERSION_CACHE_STATUS realtime=skip extended_realtime=$EXTENDED_REALTIME_STATUS delta(nack=0,ack=0,chat=0,idem=0,initial_state=0,initial_state_participants=0)"
  exit 0
fi

if [[ "$AUTO_TICKET" == "1" ]]; then
  if [[ -z "$SMOKE_USER_ID" || -z "$SMOKE_USER_ROLE" ]]; then
    USER_META="$(resolve_user_meta_by_email "$USER_EMAIL")"
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
CALL_INITIAL_STATE_SENT_BEFORE="$(metric_from_hgetall "$METRICS_BEFORE_RAW" "call_initial_state_sent")"
CALL_INITIAL_STATE_PARTICIPANTS_BEFORE="$(metric_from_hgetall "$METRICS_BEFORE_RAW" "call_initial_state_participants_total")"

echo "[postdeploy-smoke] smoke:realtime"
SMOKE_API_URL="$BASE_URL" SMOKE_RECONNECT=1 SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1 npm run smoke:realtime

if [[ "${SMOKE_EXTENDED_GATE:-0}" == "1" ]]; then
  if [[ "$AUTO_TICKET" == "1" ]]; then
    unset SMOKE_WS_TICKET
    unset SMOKE_WS_TICKET_RECONNECT
    unset SMOKE_WS_TICKET_SECOND
    unset SMOKE_WS_TICKET_THIRD
  fi

  if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
    USER_META_PRIMARY="$(resolve_user_meta_by_email "$USER_EMAIL")"
    if [[ -z "$USER_META_PRIMARY" ]]; then
      echo "[postdeploy-smoke] cannot resolve primary smoke user for extended gate email=$USER_EMAIL" >&2
      exit 1
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      JWT_SECRET_CANDIDATE="${JWT_SECRET:-${TEST_JWT_SECRET:-}}"
      if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
        JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r' | tr -d '\n')"
      fi
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      echo "[postdeploy-smoke] cannot generate SMOKE_TEST_BEARER_TOKEN for extended gate (missing JWT secret)" >&2
      exit 1
    fi

    SMOKE_TEST_BEARER_TOKEN="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "${USER_META_PRIMARY%%|*}" "${USER_META_PRIMARY##*|}")"
    export SMOKE_TEST_BEARER_TOKEN
  fi

  if [[ -z "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" ]]; then
    USER_META_SECOND="$(resolve_user_meta_by_email "$USER_EMAIL_SECOND")"
    if [[ -z "$USER_META_SECOND" ]]; then
      echo "[postdeploy-smoke] cannot resolve second smoke user for extended gate email=$USER_EMAIL_SECOND" >&2
      exit 1
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      JWT_SECRET_CANDIDATE="${JWT_SECRET:-${TEST_JWT_SECRET:-}}"
      if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
        JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r' | tr -d '\n')"
      fi
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      echo "[postdeploy-smoke] cannot generate SMOKE_TEST_BEARER_TOKEN_SECOND (missing JWT secret)" >&2
      exit 1
    fi

    SMOKE_TEST_BEARER_TOKEN_SECOND="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "${USER_META_SECOND%%|*}" "${USER_META_SECOND##*|}")"
    export SMOKE_TEST_BEARER_TOKEN_SECOND
  fi

  if [[ -z "${SMOKE_TEST_BEARER_TOKEN_THIRD:-}" ]]; then
    USER_META_THIRD="$(resolve_user_meta_by_email "$USER_EMAIL_THIRD")"
    if [[ -z "$USER_META_THIRD" ]]; then
      echo "[postdeploy-smoke] cannot resolve third smoke user for extended gate email=$USER_EMAIL_THIRD" >&2
      exit 1
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      JWT_SECRET_CANDIDATE="${JWT_SECRET:-${TEST_JWT_SECRET:-}}"
      if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
        JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r' | tr -d '\n')"
      fi
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      echo "[postdeploy-smoke] cannot generate SMOKE_TEST_BEARER_TOKEN_THIRD (missing JWT secret)" >&2
      exit 1
    fi

    SMOKE_TEST_BEARER_TOKEN_THIRD="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "${USER_META_THIRD%%|*}" "${USER_META_THIRD##*|}")"
    export SMOKE_TEST_BEARER_TOKEN_THIRD
  fi

  echo "[postdeploy-smoke] smoke:realtime (extended gate)"
  SMOKE_API_URL="$BASE_URL" \
    SMOKE_RECONNECT=1 \
    SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1 \
    SMOKE_CALL_SIGNAL=1 \
    SMOKE_CALL_RACE_3WAY=1 \
    SMOKE_CALL_CAMERA_TOGGLE_RECONNECT=1 \
    SMOKE_RACE_STRICT_OFFER_RATE_LIMIT="${SMOKE_RACE_STRICT_OFFER_RATE_LIMIT:-1}" \
    SMOKE_RACE_OFFER_RATE_LIMIT_STRICT_THRESHOLD="${SMOKE_RACE_OFFER_RATE_LIMIT_STRICT_THRESHOLD:-4}" \
    npm run smoke:realtime
  EXTENDED_REALTIME_STATUS="pass"
fi

echo "[postdeploy-smoke] realtime metrics after"
METRICS_AFTER_RAW="$(compose exec -T "$REDIS_SERVICE" redis-cli HGETALL "ws:metrics:$DAY" | cat)"
printf '%s\n' "$METRICS_AFTER_RAW"

NACK_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "nack_sent")"
ACK_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "ack_sent")"
CHAT_SENT_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "chat_sent")"
CHAT_IDEMPOTENCY_HIT_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "chat_idempotency_hit")"
CALL_INITIAL_STATE_SENT_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "call_initial_state_sent")"
CALL_INITIAL_STATE_PARTICIPANTS_AFTER="$(metric_from_hgetall "$METRICS_AFTER_RAW" "call_initial_state_participants_total")"

SMOKE_NACK_DELTA=$((NACK_AFTER - NACK_BEFORE))
SMOKE_ACK_DELTA=$((ACK_AFTER - ACK_BEFORE))
SMOKE_CHAT_SENT_DELTA=$((CHAT_SENT_AFTER - CHAT_SENT_BEFORE))
SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=$((CHAT_IDEMPOTENCY_HIT_AFTER - CHAT_IDEMPOTENCY_HIT_BEFORE))
SMOKE_CALL_INITIAL_STATE_SENT_DELTA=$((CALL_INITIAL_STATE_SENT_AFTER - CALL_INITIAL_STATE_SENT_BEFORE))
SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA=$((CALL_INITIAL_STATE_PARTICIPANTS_AFTER - CALL_INITIAL_STATE_PARTICIPANTS_BEFORE))

SMOKE_STATUS="pass"
SMOKE_SUMMARY_TEXT="health=pass mode=sso sso=pass api=$API_SMOKE_STATUS version_cache=$VERSION_CACHE_STATUS realtime=pass extended_realtime=$EXTENDED_REALTIME_STATUS delta(nack=$SMOKE_NACK_DELTA,ack=$SMOKE_ACK_DELTA,chat=$SMOKE_CHAT_SENT_DELTA,idem=$SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA,initial_state=$SMOKE_CALL_INITIAL_STATE_SENT_DELTA,initial_state_participants=$SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA)"

echo "[postdeploy-smoke] done"
