#!/usr/bin/env bash
# Purpose: Execute post-deploy smoke checks (SSO/API/version/realtime) and summarize results.
set -euo pipefail

REPO_DIR="${1:-$PWD}"
BASE_URL="${SMOKE_API_URL:-https://test.boltorezka.gismalink.art}"
WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-$BASE_URL}"
SMOKE_HTTP_RETRIES="${SMOKE_HTTP_RETRIES:-8}"
SMOKE_HTTP_RETRY_DELAY_SEC="${SMOKE_HTTP_RETRY_DELAY_SEC:-2}"
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
CHAT_OBJECT_STORAGE_STATUS="skip"
MINIO_STORAGE_STATUS="skip"
API_AUTH_SESSION_STATUS="skip"
VERSION_CACHE_STATUS="skip"
WEB_CRASH_BOUNDARY_STATUS="skip"
WEB_RNNOISE_STATUS="skip"
DESKTOP_UPDATE_FEED_STATUS="skip"
EXTENDED_REALTIME_STATUS="skip"
SMOKE_REALTIME_MEDIA_STATUS="skip"
SMOKE_LIVEKIT_GATE_STATUS="skip"
SMOKE_LIVEKIT_MEDIA_STATUS="skip"
SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS="skip"
SMOKE_MEDIA_TRANSPORT_SUMMARY="n/a"
SMOKE_TURN_TLS_STATUS="skip"
SMOKE_TURN_ALLOCATION_FAILURES=0
SMOKE_TURN_ALLOCATION_STATUS="skip"
SMOKE_TURN_ROTATION_STATUS="skip"
SMOKE_ONE_WAY_AUDIO_INCIDENTS=0
SMOKE_ONE_WAY_VIDEO_INCIDENTS=0
JWT_SECRET_CANDIDATE=""

write_summary() {
  mkdir -p .deploy

  printf 'SMOKE_TIMESTAMP_UTC=%q\n' "$SMOKE_TIMESTAMP_UTC" >"$SUMMARY_FILE_REL"
  printf 'SMOKE_BASE_URL=%q\n' "$BASE_URL" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_WEB_BASE_URL=%q\n' "$WEB_BASE_URL" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_STATUS=%q\n' "$SMOKE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_AUTH_SESSION_STATUS=%q\n' "$API_AUTH_SESSION_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_OBJECT_STORAGE_STATUS=%q\n' "$CHAT_OBJECT_STORAGE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_MINIO_STORAGE_STATUS=%q\n' "$MINIO_STORAGE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_WEB_CRASH_BOUNDARY_STATUS=%q\n' "$WEB_CRASH_BOUNDARY_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_WEB_RNNOISE_STATUS=%q\n' "$WEB_RNNOISE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_DESKTOP_UPDATE_FEED_STATUS=%q\n' "$DESKTOP_UPDATE_FEED_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_NACK_DELTA=%q\n' "$SMOKE_NACK_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_ACK_DELTA=%q\n' "$SMOKE_ACK_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_SENT_DELTA=%q\n' "$SMOKE_CHAT_SENT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA=%q\n' "$SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CALL_INITIAL_STATE_SENT_DELTA=%q\n' "$SMOKE_CALL_INITIAL_STATE_SENT_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA=%q\n' "$SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_EXTENDED_REALTIME_STATUS=%q\n' "$EXTENDED_REALTIME_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_REALTIME_MEDIA_STATUS=%q\n' "$SMOKE_REALTIME_MEDIA_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_LIVEKIT_GATE_STATUS=%q\n' "$SMOKE_LIVEKIT_GATE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_LIVEKIT_MEDIA_STATUS=%q\n' "$SMOKE_LIVEKIT_MEDIA_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS=%q\n' "$SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_MEDIA_TRANSPORT_SUMMARY=%q\n' "$SMOKE_MEDIA_TRANSPORT_SUMMARY" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_TURN_TLS_STATUS=%q\n' "$SMOKE_TURN_TLS_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_TURN_ALLOCATION_FAILURES=%q\n' "$SMOKE_TURN_ALLOCATION_FAILURES" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_TURN_ALLOCATION_STATUS=%q\n' "$SMOKE_TURN_ALLOCATION_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_TURN_ROTATION_STATUS=%q\n' "$SMOKE_TURN_ROTATION_STATUS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_ONE_WAY_AUDIO_INCIDENTS=%q\n' "$SMOKE_ONE_WAY_AUDIO_INCIDENTS" >>"$SUMMARY_FILE_REL"
  printf 'SMOKE_ONE_WAY_VIDEO_INCIDENTS=%q\n' "$SMOKE_ONE_WAY_VIDEO_INCIDENTS" >>"$SUMMARY_FILE_REL"
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
  local sid="$4"
  local auth_mode="${5:-sso}"
  local now exp header payload unsigned signature

  now="$(date +%s)"
  exp="$((now + 3600))"
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"sub\":\"$sub\",\"sid\":\"$sid\",\"role\":\"$role\",\"authMode\":\"$auth_mode\",\"iat\":$now,\"exp\":$exp}"

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

parse_media_transport_summary() {
  local payload_path="$1"

  node - "$payload_path" <<'NODE'
const fs = require("fs");

const path = process.argv[2];
const content = fs.readFileSync(path, "utf8").trim();
if (!content) {
  process.stdout.write("n/a");
  process.exit(0);
}

const start = content.indexOf("{");
const end = content.lastIndexOf("}");
if (start === -1 || end === -1 || end <= start) {
  process.stdout.write("n/a");
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(content.slice(start, end + 1));
} catch {
  process.stdout.write("n/a");
  process.exit(0);
}

const summary = payload && payload.transportSummary ? payload.transportSummary : null;
if (!summary || !summary.selectedBuckets) {
  process.stdout.write("n/a");
  process.exit(0);
}

const buckets = summary.selectedBuckets;
const protocols = Array.isArray(summary.selectedProtocols) ? summary.selectedProtocols.join("+") : "";

const udp = Number(buckets.udp || 0);
const tcp = Number(buckets.tcp || 0);
const tlsRelay = Number(buckets.tlsRelay || 0);
const unknown = Number(buckets.unknown || 0);

const configured = summary.configured || {};
const cfg = `cfg(udp=${configured.udp ? 1 : 0},tcp=${configured.tcp ? 1 : 0},tls=${configured.tlsRelay ? 1 : 0})`;
process.stdout.write(`selected(udp=${udp},tcp=${tcp},tlsRelay=${tlsRelay},unknown=${unknown},proto=${protocols || "none"}) ${cfg}`);
NODE
}

parse_media_one_way_counters() {
  local payload_path="$1"

  node - "$payload_path" <<'NODE'
const fs = require("fs");

const path = process.argv[2];
const content = fs.readFileSync(path, "utf8").trim();
const start = content.indexOf("{");
const end = content.lastIndexOf("}");
if (start === -1 || end === -1 || end <= start) {
  process.stdout.write("0|0");
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(content.slice(start, end + 1));
} catch {
  process.stdout.write("0|0");
  process.exit(0);
}

const oneWay = payload && payload.oneWaySummary ? payload.oneWaySummary : {};
const audio = Number(oneWay.audioIncidents || 0);
const video = Number(oneWay.videoIncidents || 0);
process.stdout.write(`${audio}|${video}`);
NODE
}

http_get_with_retries() {
  local url="$1"
  local label="$2"
  local attempt=1
  local output=""

  while (( attempt <= SMOKE_HTTP_RETRIES )); do
    if output="$(curl --connect-timeout 5 --max-time 15 -fsS "$url" 2>/dev/null)"; then
      printf '%s' "$output"
      return 0
    fi

    if (( attempt < SMOKE_HTTP_RETRIES )); then
      sleep "$SMOKE_HTTP_RETRY_DELAY_SEC"
    fi
    attempt=$((attempt + 1))
  done

  echo "[postdeploy-smoke] ${label} failed after ${SMOKE_HTTP_RETRIES} attempts: ${url}" >&2
  return 1
}

echo "[postdeploy-smoke] health"
http_get_with_retries "$BASE_URL/health" "health preflight" >/dev/null

echo "[postdeploy-smoke] auth mode"
mode_attempt=1
MODE_JSON=""
while (( mode_attempt <= SMOKE_HTTP_RETRIES )); do
  MODE_JSON="$(http_get_with_retries "$BASE_URL/v1/auth/mode" "auth mode preflight")"
  if [[ "$MODE_JSON" == *'"mode":"sso"'* ]]; then
    break
  fi

  if (( mode_attempt < SMOKE_HTTP_RETRIES )); then
    sleep "$SMOKE_HTTP_RETRY_DELAY_SEC"
  fi
  mode_attempt=$((mode_attempt + 1))
done

if [[ "$MODE_JSON" != *'"mode":"sso"'* ]]; then
  echo "[postdeploy-smoke] expected mode=sso after retries, got: $MODE_JSON" >&2
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

trim_lower() {
  local value="$1"
  # shellcheck disable=SC2001
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  printf '%s' "$value" | tr '[:upper:]' '[:lower:]'
}

validate_livekit_standard_profile() {
  local enabled="${SMOKE_REQUIRE_LIVEKIT_STANDARD_PROFILE:-1}"
  local prefix="${SMOKE_LIVEKIT_STANDARD_ENV_PREFIX:-TEST_}"
  local livekit_enabled_var="${prefix}LIVEKIT_ENABLED"

  if [[ "$enabled" != "1" ]]; then
    SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS="skip"
    echo "[postdeploy-smoke] livekit standard profile gate skipped (SMOKE_REQUIRE_LIVEKIT_STANDARD_PROFILE=0)"
    return 0
  fi

  local livekit_enabled_raw="${!livekit_enabled_var:-${LIVEKIT_ENABLED:-1}}"
  local livekit_enabled="$(trim_lower "$livekit_enabled_raw")"

  if [[ "$livekit_enabled" != "1" && "$livekit_enabled" != "true" && "$livekit_enabled" != "yes" && "$livekit_enabled" != "on" ]]; then
    SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS="fail"
    echo "[postdeploy-smoke] livekit standard profile gate failed: ${livekit_enabled_var} fallback chain must resolve to enabled (got: $livekit_enabled_raw)" >&2
    exit 1
  fi

  SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS="pass"
  echo "[postdeploy-smoke] livekit standard profile gate: pass (${livekit_enabled_var}=1)"
}

validate_livekit_standard_profile

validate_turn_range() {
  local min_port_raw="${TURN_MIN_PORT:-30000}"
  local max_port_raw="${TURN_MAX_PORT:-31000}"
  local expected_size_raw="${SMOKE_EXPECT_TURN_RANGE_SIZE:-1001}"

  if [[ ! "$min_port_raw" =~ ^[0-9]+$ || ! "$max_port_raw" =~ ^[0-9]+$ || ! "$expected_size_raw" =~ ^[0-9]+$ ]]; then
    echo "[postdeploy-smoke] TURN range values must be numeric: min=$min_port_raw max=$max_port_raw expected_size=$expected_size_raw" >&2
    exit 1
  fi

  local min_port="$min_port_raw"
  local max_port="$max_port_raw"
  local expected_size="$expected_size_raw"

  if (( max_port < min_port )); then
    echo "[postdeploy-smoke] invalid TURN range: max < min ($min_port-$max_port)" >&2
    exit 1
  fi

  local actual_size=$((max_port - min_port + 1))
  echo "[postdeploy-smoke] turn relay range: ${min_port}-${max_port} (${actual_size} ports)"

  if (( actual_size != expected_size )); then
    echo "[postdeploy-smoke] TURN relay range size mismatch: expected ${expected_size}, got ${actual_size}" >&2
    echo "[postdeploy-smoke] set TURN_MIN_PORT/TURN_MAX_PORT to keep ${expected_size} ports in test baseline" >&2
    exit 1
  fi
}

validate_turn_range

validate_turn_tls_handshake() {
  local turn_domain="${TURN_CERT_DOMAIN:-}"
  local turn_port="${TURN_TLS_PORT:-5349}"
  local strict_mode="${SMOKE_TURN_TLS_STRICT:-1}"

  if [[ -z "$turn_domain" ]]; then
    SMOKE_TURN_TLS_STATUS="skip"
    echo "[postdeploy-smoke] turn tls check skipped (TURN_CERT_DOMAIN is empty)"
    return 0
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    SMOKE_TURN_TLS_STATUS="skip"
    echo "[postdeploy-smoke] turn tls check skipped (openssl is not available)"
    return 0
  fi

  echo "[postdeploy-smoke] turn tls handshake (${turn_domain}:${turn_port})"
  if printf '' | openssl s_client -connect "${turn_domain}:${turn_port}" -servername "$turn_domain" -brief >/dev/null 2>&1; then
    SMOKE_TURN_TLS_STATUS="pass"
    return 0
  fi

  SMOKE_TURN_TLS_STATUS="fail"
  echo "[postdeploy-smoke] turn tls handshake failed (${turn_domain}:${turn_port})" >&2

  if [[ "$strict_mode" == "1" ]]; then
    exit 1
  fi

  echo "[postdeploy-smoke] continuing because SMOKE_TURN_TLS_STRICT=0" >&2
}

validate_turn_tls_handshake

validate_turn_rotation_freshness() {
  local enabled="${SMOKE_REQUIRE_TURN_ROTATION_FRESHNESS:-1}"
  local strict_mode="${SMOKE_TURN_ROTATION_STRICT:-1}"
  local allow_missing_marker="${SMOKE_TURN_ROTATION_ALLOW_MISSING_MARKER:-1}"
  local max_age_days_raw="${SMOKE_TURN_ROTATION_MAX_AGE_DAYS:-35}"
  local marker_file="${SMOKE_TURN_ROTATION_MARKER_FILE:-.deploy/turn-credentials-last-rotation.env}"

  if [[ "$enabled" != "1" ]]; then
    SMOKE_TURN_ROTATION_STATUS="skip"
    echo "[postdeploy-smoke] turn rotation freshness check skipped (SMOKE_REQUIRE_TURN_ROTATION_FRESHNESS=0)"
    return 0
  fi

  if [[ ! "$max_age_days_raw" =~ ^[0-9]+$ ]]; then
    echo "[postdeploy-smoke] SMOKE_TURN_ROTATION_MAX_AGE_DAYS must be numeric: $max_age_days_raw" >&2
    exit 1
  fi

  if [[ ! -f "$marker_file" ]]; then
    if [[ "$allow_missing_marker" == "1" ]]; then
      SMOKE_TURN_ROTATION_STATUS="warn"
      echo "[postdeploy-smoke] turn rotation freshness marker missing ($marker_file); bootstrap allow is enabled"
      return 0
    fi

    SMOKE_TURN_ROTATION_STATUS="fail"
    echo "[postdeploy-smoke] turn rotation freshness failed: marker file not found ($marker_file)" >&2
    if [[ "$strict_mode" == "1" ]]; then
      exit 1
    fi
    echo "[postdeploy-smoke] continuing because SMOKE_TURN_ROTATION_STRICT=0" >&2
    return 0
  fi

  # shellcheck disable=SC1090
  source "$marker_file"
  local rotated_at="${TURN_ROTATED_AT_UTC:-}"
  if [[ -z "$rotated_at" ]]; then
    SMOKE_TURN_ROTATION_STATUS="fail"
    echo "[postdeploy-smoke] turn rotation freshness failed: TURN_ROTATED_AT_UTC missing in $marker_file" >&2
    if [[ "$strict_mode" == "1" ]]; then
      exit 1
    fi
    echo "[postdeploy-smoke] continuing because SMOKE_TURN_ROTATION_STRICT=0" >&2
    return 0
  fi

  local now_epoch rotated_epoch
  now_epoch="$(date -u +%s)"
  rotated_epoch="$(node -e 'const ts = Date.parse(process.argv[1]); if (Number.isNaN(ts)) process.exit(1); process.stdout.write(String(Math.floor(ts / 1000)));' "$rotated_at" 2>/dev/null || true)"
  if [[ -z "$rotated_epoch" || ! "$rotated_epoch" =~ ^[0-9]+$ ]]; then
    SMOKE_TURN_ROTATION_STATUS="fail"
    echo "[postdeploy-smoke] turn rotation freshness failed: invalid TURN_ROTATED_AT_UTC ($rotated_at)" >&2
    if [[ "$strict_mode" == "1" ]]; then
      exit 1
    fi
    echo "[postdeploy-smoke] continuing because SMOKE_TURN_ROTATION_STRICT=0" >&2
    return 0
  fi

  local age_days
  age_days="$(( (now_epoch - rotated_epoch) / 86400 ))"

  if (( age_days > max_age_days_raw )); then
    SMOKE_TURN_ROTATION_STATUS="fail"
    echo "[postdeploy-smoke] turn rotation freshness failed: age=${age_days}d > ${max_age_days_raw}d (marker=$marker_file)" >&2
    if [[ "$strict_mode" == "1" ]]; then
      exit 1
    fi
    echo "[postdeploy-smoke] continuing because SMOKE_TURN_ROTATION_STRICT=0" >&2
    return 0
  fi

  SMOKE_TURN_ROTATION_STATUS="pass"
  echo "[postdeploy-smoke] turn rotation freshness: pass (age=${age_days}d <= ${max_age_days_raw}d)"
}

validate_turn_rotation_freshness

collect_turn_allocation_failures() {
  local turn_service="${SMOKE_TURN_SERVICE:-boltorezka-turn}"
  local log_window="${SMOKE_TURN_LOG_WINDOW:-30m}"
  local strict_threshold_raw="${SMOKE_TURN_ALLOCATION_FAIL_THRESHOLD:--1}"
  local strict_threshold=-1

  if [[ "$strict_threshold_raw" =~ ^-?[0-9]+$ ]]; then
    strict_threshold="$strict_threshold_raw"
  fi

  local turn_logs=""
  if ! turn_logs="$(compose logs --since "$log_window" "$turn_service" 2>/dev/null | cat)"; then
    SMOKE_TURN_ALLOCATION_STATUS="skip"
    SMOKE_TURN_ALLOCATION_FAILURES=0
    echo "[postdeploy-smoke] turn allocation metric skipped (service/log unavailable: $turn_service)"
    return 0
  fi

  local failures
  failures="$(printf '%s\n' "$turn_logs" | grep -Eci 'Cannot create socket|error 508|allocation[^[:alnum:]]*(fail|error|denied)' || true)"
  SMOKE_TURN_ALLOCATION_FAILURES="${failures:-0}"

  if (( SMOKE_TURN_ALLOCATION_FAILURES == 0 )); then
    SMOKE_TURN_ALLOCATION_STATUS="pass"
  else
    SMOKE_TURN_ALLOCATION_STATUS="warn"
  fi

  echo "[postdeploy-smoke] turn allocation failures (${log_window}): ${SMOKE_TURN_ALLOCATION_FAILURES}"

  if (( strict_threshold >= 0 && SMOKE_TURN_ALLOCATION_FAILURES > strict_threshold )); then
    SMOKE_TURN_ALLOCATION_STATUS="fail"
    echo "[postdeploy-smoke] turn allocation failures threshold exceeded: ${SMOKE_TURN_ALLOCATION_FAILURES} > ${strict_threshold}" >&2
    exit 1
  fi
}

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
    GENERATED_SESSION_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    GENERATED_BEARER="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "$SMOKE_USER_ID" "$SMOKE_USER_ROLE" "$GENERATED_SESSION_ID" "sso")"
    AUTH_SESSION_TTL_SEC="${SMOKE_AUTH_SESSION_TTL_SEC:-2592000}"
    AUTH_SESSION_PAYLOAD="$(printf '{\"userId\":\"%s\",\"authMode\":\"sso\",\"issuedAt\":\"%s\",\"rotatedFrom\":null}' "$SMOKE_USER_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
    compose exec -T "$REDIS_SERVICE" redis-cli SETEX "auth:session:$GENERATED_SESSION_ID" "$AUTH_SESSION_TTL_SEC" "$AUTH_SESSION_PAYLOAD" >/dev/null
    export SMOKE_TEST_BEARER_TOKEN="$GENERATED_BEARER"
  else
    echo "[postdeploy-smoke] warning: cannot resolve JWT secret; protected smoke:api checks may be skipped"
  fi
fi

if [[ "${SMOKE_API:-1}" == "0" ]]; then
  echo "[postdeploy-smoke] smoke:api skipped (SMOKE_API=0)"
  API_SMOKE_STATUS="skip"
  CHAT_OBJECT_STORAGE_STATUS="skip"
  MINIO_STORAGE_STATUS="skip"
  API_AUTH_SESSION_STATUS="skip"
else
  echo "[postdeploy-smoke] smoke:api"
  SMOKE_API_URL="$BASE_URL" npm run smoke:api
  API_SMOKE_STATUS="pass"

  if [[ "${SMOKE_CHAT_OBJECT_STORAGE:-0}" == "1" ]]; then
    if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
      echo "[postdeploy-smoke] smoke:chat:object-storage skipped (no bearer token)"
      CHAT_OBJECT_STORAGE_STATUS="skip"
    else
      echo "[postdeploy-smoke] smoke:chat:object-storage"
      SMOKE_API_URL="$BASE_URL" SMOKE_TEST_BEARER_TOKEN="${SMOKE_TEST_BEARER_TOKEN:-}" npm run smoke:chat:object-storage
      CHAT_OBJECT_STORAGE_STATUS="pass"
    fi
  else
    echo "[postdeploy-smoke] smoke:chat:object-storage skipped (SMOKE_CHAT_OBJECT_STORAGE=0)"
    CHAT_OBJECT_STORAGE_STATUS="skip"
  fi

  if [[ "${SMOKE_MINIO_STORAGE:-0}" == "1" ]]; then
    echo "[postdeploy-smoke] smoke:minio:storage"
    SMOKE_MINIO_STORAGE_PROVIDER="${TEST_CHAT_STORAGE_PROVIDER:-${CHAT_STORAGE_PROVIDER:-localfs}}" \
      SMOKE_MINIO_ENDPOINT="${TEST_CHAT_MINIO_ENDPOINT:-${CHAT_MINIO_ENDPOINT:-}}" \
      SMOKE_MINIO_ENDPOINT_FALLBACK="${SMOKE_MINIO_ENDPOINT_FALLBACK:-http://127.0.0.1:${TEST_MINIO_API_PORT:-19000}}" \
      npm run smoke:minio:storage
    MINIO_STORAGE_STATUS="pass"
  else
    echo "[postdeploy-smoke] smoke:minio:storage skipped (SMOKE_MINIO_STORAGE=0)"
    MINIO_STORAGE_STATUS="skip"
  fi

  if [[ "${SMOKE_AUTH_SESSION:-1}" == "0" ]]; then
    echo "[postdeploy-smoke] smoke:auth:session skipped (SMOKE_AUTH_SESSION=0)"
    API_AUTH_SESSION_STATUS="skip"
  elif [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
    echo "[postdeploy-smoke] smoke:auth:session skipped (no bearer token)"
    API_AUTH_SESSION_STATUS="skip"
  else
    echo "[postdeploy-smoke] smoke:auth:session"
    SMOKE_API_URL="$BASE_URL" npm run smoke:auth:session
    API_AUTH_SESSION_STATUS="pass"
  fi
fi

# Cookie-mode regression smokes (run when TEST_AUTH_COOKIE_MODE=1 is set in env).
# Checks: negative security properties (invalid/missing cookie → 401, replay → 401)
# and ws-ticket issuance via cookie-only auth (no bearer header).
# Each smoke gets a freshly minted session because smoke:auth:session rotates and
# revokes the shared SMOKE_TEST_BEARER_TOKEN before this block runs.
EFFECTIVE_COOKIE_MODE="${TEST_AUTH_COOKIE_MODE:-${AUTH_COOKIE_MODE:-0}}"
COOKIE_NEGATIVE_STATUS="skip"
COOKIE_WS_TICKET_STATUS="skip"

mint_fresh_smoke_bearer() {
  local label="$1"
  if [[ -z "${SMOKE_USER_ID:-}" || -z "${SMOKE_USER_ROLE:-}" ]]; then
    echo "[postdeploy-smoke] $label: cannot mint bearer (SMOKE_USER_ID/ROLE not resolved)" >&2
    return 1
  fi
  if [[ -z "${JWT_SECRET_CANDIDATE:-}" ]]; then
    echo "[postdeploy-smoke] $label: cannot mint bearer (JWT_SECRET_CANDIDATE not set)" >&2
    return 1
  fi
  local new_session_id new_bearer
  new_session_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  new_bearer="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "$SMOKE_USER_ID" "$SMOKE_USER_ROLE" "$new_session_id" "sso")"
  compose exec -T "$REDIS_SERVICE" redis-cli SETEX \
    "auth:session:${new_session_id}" "${SMOKE_AUTH_SESSION_TTL_SEC:-2592000}" \
    "{\"userId\":\"${SMOKE_USER_ID}\",\"authMode\":\"sso\",\"issuedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"rotatedFrom\":null}" >/dev/null
  printf '%s' "$new_bearer"
}

if [[ "$EFFECTIVE_COOKIE_MODE" == "1" ]]; then
  COOKIE_NAME="${TEST_AUTH_SESSION_COOKIE_NAME:-${AUTH_SESSION_COOKIE_NAME:-boltorezka_session_test}}"
  if [[ "${SMOKE_COOKIE_NEGATIVE:-1}" == "0" ]]; then
    echo "[postdeploy-smoke] smoke:auth:cookie-negative skipped (SMOKE_COOKIE_NEGATIVE=0)"
    COOKIE_NEGATIVE_STATUS="skip"
  elif [[ -z "${SMOKE_USER_ID:-}" || -z "${JWT_SECRET_CANDIDATE:-}" ]]; then
    echo "[postdeploy-smoke] smoke:auth:cookie-negative skipped (no JWT secret or user id)"
    COOKIE_NEGATIVE_STATUS="skip"
  else
    COOKIE_NEGATIVE_BEARER="$(mint_fresh_smoke_bearer "cookie-negative")"
    echo "[postdeploy-smoke] smoke:auth:cookie-negative (cookie-mode=1)"
    SMOKE_API_URL="$BASE_URL" \
      SMOKE_SESSION_COOKIE_NAME="$COOKIE_NAME" \
      SMOKE_TEST_BEARER_TOKEN="$COOKIE_NEGATIVE_BEARER" \
      npm run smoke:auth:cookie-negative
    COOKIE_NEGATIVE_STATUS="pass"
  fi

  if [[ "${SMOKE_COOKIE_WS_TICKET:-1}" == "0" ]]; then
    echo "[postdeploy-smoke] smoke:auth:cookie-ws-ticket skipped (SMOKE_COOKIE_WS_TICKET=0)"
    COOKIE_WS_TICKET_STATUS="skip"
  elif [[ -z "${SMOKE_USER_ID:-}" || -z "${JWT_SECRET_CANDIDATE:-}" ]]; then
    echo "[postdeploy-smoke] smoke:auth:cookie-ws-ticket skipped (no JWT secret or user id)"
    COOKIE_WS_TICKET_STATUS="skip"
  else
    COOKIE_WS_TICKET_BEARER="$(mint_fresh_smoke_bearer "cookie-ws-ticket")"
    echo "[postdeploy-smoke] smoke:auth:cookie-ws-ticket (cookie-mode=1)"
    SMOKE_API_URL="$BASE_URL" \
      SMOKE_SESSION_COOKIE_NAME="$COOKIE_NAME" \
      SMOKE_TEST_BEARER_TOKEN="$COOKIE_WS_TICKET_BEARER" \
      npm run smoke:auth:cookie-ws-ticket
    COOKIE_WS_TICKET_STATUS="pass"
  fi
else
  echo "[postdeploy-smoke] cookie-mode smokes skipped (TEST_AUTH_COOKIE_MODE != 1)"
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

if [[ "${SMOKE_WEB_CRASH_BOUNDARY_BROWSER:-1}" == "1" ]]; then
  if [[ ! -d "node_modules/playwright" ]]; then
    echo "[postdeploy-smoke] install npm dependencies (playwright missing)"
    npm install --no-audit --no-fund
  fi

  echo "[postdeploy-smoke] smoke:web:crash-boundary:browser"
  SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" SMOKE_TEST_BEARER_TOKEN="${SMOKE_TEST_BEARER_TOKEN:-}" npm run smoke:web:crash-boundary:browser
  WEB_CRASH_BOUNDARY_STATUS="pass"
else
  echo "[postdeploy-smoke] smoke:web:crash-boundary:browser skipped (SMOKE_WEB_CRASH_BOUNDARY_BROWSER=0)"
  WEB_CRASH_BOUNDARY_STATUS="skip"
fi

if [[ "${SMOKE_WEB_RNNOISE_BROWSER:-1}" != "1" ]]; then
  echo "[postdeploy-smoke] smoke:web:rnnoise:browser skipped (SMOKE_WEB_RNNOISE_BROWSER=0)"
  WEB_RNNOISE_STATUS="skip"
elif [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
  echo "[postdeploy-smoke] smoke:web:rnnoise:browser skipped (no bearer token)"
  WEB_RNNOISE_STATUS="skip"
else
  echo "[postdeploy-smoke] smoke:web:rnnoise:browser"
  SMOKE_API_URL="$BASE_URL" SMOKE_WEB_BASE_URL="$WEB_BASE_URL" SMOKE_TEST_BEARER_TOKEN="${SMOKE_TEST_BEARER_TOKEN:-}" npm run smoke:web:rnnoise:browser
  WEB_RNNOISE_STATUS="pass"
fi

if [[ "${SMOKE_DESKTOP_UPDATE_FEED:-1}" == "1" ]]; then
  echo "[postdeploy-smoke] smoke:desktop:update-feed"
  SMOKE_WEB_BASE_URL="$WEB_BASE_URL" \
    SMOKE_DESKTOP_CHANNEL="${SMOKE_DESKTOP_CHANNEL:-test}" \
    npm run smoke:desktop:update-feed
  DESKTOP_UPDATE_FEED_STATUS="pass"
else
  echo "[postdeploy-smoke] smoke:desktop:update-feed skipped (SMOKE_DESKTOP_UPDATE_FEED=0)"
  DESKTOP_UPDATE_FEED_STATUS="skip"
fi

if [[ "${SMOKE_REALTIME:-1}" == "0" ]]; then
  collect_turn_allocation_failures
  echo "[postdeploy-smoke] realtime smoke skipped (SMOKE_REALTIME=0)"
  SMOKE_STATUS="pass"
  SMOKE_SUMMARY_TEXT="health=pass mode=sso sso=pass api=$API_SMOKE_STATUS chat_object_storage=$CHAT_OBJECT_STORAGE_STATUS minio_storage=$MINIO_STORAGE_STATUS auth_session=$API_AUTH_SESSION_STATUS cookie_negative=$COOKIE_NEGATIVE_STATUS cookie_ws_ticket=$COOKIE_WS_TICKET_STATUS version_cache=$VERSION_CACHE_STATUS web_crash_boundary=$WEB_CRASH_BOUNDARY_STATUS web_rnnoise=$WEB_RNNOISE_STATUS desktop_update_feed=$DESKTOP_UPDATE_FEED_STATUS livekit_standard=$SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS turn_tls=$SMOKE_TURN_TLS_STATUS turn_rotation=$SMOKE_TURN_ROTATION_STATUS turn_alloc_failures=$SMOKE_TURN_ALLOCATION_FAILURES turn_alloc_status=$SMOKE_TURN_ALLOCATION_STATUS realtime=skip extended_realtime=$EXTENDED_REALTIME_STATUS realtime_media=$SMOKE_REALTIME_MEDIA_STATUS transport=$SMOKE_MEDIA_TRANSPORT_SUMMARY one_way(audio=$SMOKE_ONE_WAY_AUDIO_INCIDENTS,video=$SMOKE_ONE_WAY_VIDEO_INCIDENTS) delta(nack=0,ack=0,chat=0,idem=0,initial_state=0,initial_state_participants=0)"
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

  USER_META_SECOND_AUTO="$(resolve_user_meta_by_email "$USER_EMAIL_SECOND")"
  if [[ -z "$USER_META_SECOND_AUTO" ]]; then
    echo "[postdeploy-smoke] cannot resolve second smoke user for auto-ticket email=$USER_EMAIL_SECOND" >&2
    exit 1
  fi

  SECOND_USER_ID="${USER_META_SECOND_AUTO%%|*}"
  SECOND_PAYLOAD="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" -tAc "select json_build_object('userId', id::text, 'userName', coalesce(name,email,'unknown'), 'email', email, 'role', coalesce(role,'user'), 'issuedAt', now()::text)::text from users where id='${SECOND_USER_ID}' limit 1;")"

  if [[ -z "$SECOND_PAYLOAD" ]]; then
    echo "[postdeploy-smoke] cannot resolve second smoke user payload for email=$USER_EMAIL_SECOND" >&2
    exit 1
  fi

  GENERATED_SECOND_TICKET="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  compose exec -T "$REDIS_SERVICE" redis-cli SETEX "ws:ticket:$GENERATED_SECOND_TICKET" 120 "$SECOND_PAYLOAD" >/dev/null
  export SMOKE_WS_TICKET_SECOND="$GENERATED_SECOND_TICKET"
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
BASELINE_SMOKE_ROOM_SLUG="${SMOKE_ROOM_SLUG:-general}"
MEDIA_SMOKE_ROOM_SLUG="${SMOKE_REALTIME_MEDIA_ROOM_SLUG:-$BASELINE_SMOKE_ROOM_SLUG}"

SMOKE_API_URL="$BASE_URL" \
SMOKE_ROOM_SLUG="$BASELINE_SMOKE_ROOM_SLUG" \
SMOKE_RECONNECT=1 \
SMOKE_CALL_SIGNAL=1 \
SMOKE_REQUIRE_INITIAL_STATE_REPLAY=1 \
SMOKE_REQUIRE_MEDIA_TOPOLOGY=1 \
SMOKE_EXPECT_MEDIA_TOPOLOGY="${SMOKE_EXPECT_MEDIA_TOPOLOGY:-livekit}" \
npm run smoke:realtime

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

if [[ -n "${SMOKE_LIVEKIT_ROOM_SLUG:-}" ]]; then
  echo "[postdeploy-smoke] smoke:livekit gate (room=$SMOKE_LIVEKIT_ROOM_SLUG)"

  SMOKE_AUTH_COMPOSE_FILE="$COMPOSE_FILE" \
    SMOKE_AUTH_ENV_FILE="$ENV_FILE" \
    SMOKE_AUTH_API_SERVICE="$API_SERVICE" \
    SMOKE_AUTH_POSTGRES_SERVICE="$POSTGRES_SERVICE" \
    SMOKE_AUTH_TOTAL_USERS=3 \
    SMOKE_API_URL="$BASE_URL" \
    SMOKE_AUTH_OUTPUT_FILE=".deploy/smoke-auth-livekit-gate.env" \
    bash ./scripts/smoke/smoke-auth-bootstrap.sh

  set -a
  source .deploy/smoke-auth-livekit-gate.env
  set +a

  SMOKE_API_URL="$BASE_URL" \
    SMOKE_ROOM_SLUG="$SMOKE_LIVEKIT_ROOM_SLUG" \
    npm run smoke:livekit:token-flow

  SMOKE_API_URL="$BASE_URL" \
    SMOKE_ROOM_SLUG="$SMOKE_LIVEKIT_ROOM_SLUG" \
    SMOKE_CALL_SIGNAL=1 \
    SMOKE_RECONNECT=0 \
    SMOKE_REQUIRE_MEDIA_TOPOLOGY=1 \
    SMOKE_EXPECT_MEDIA_TOPOLOGY=livekit \
    npm run smoke:realtime

  if [[ "${SMOKE_LIVEKIT_MEDIA:-1}" == "1" ]]; then
    SMOKE_API_URL="$BASE_URL" \
      SMOKE_ROOM_SLUG="$SMOKE_LIVEKIT_ROOM_SLUG" \
      SMOKE_LIVEKIT_MEDIA_SIGNAL_URL="${SMOKE_LIVEKIT_MEDIA_SIGNAL_URL:-ws://127.0.0.1:${TEST_LIVEKIT_SIGNAL_PORT:-7880}}" \
      SMOKE_LIVEKIT_FAIL_ON_ONE_WAY="${SMOKE_LIVEKIT_FAIL_ON_ONE_WAY:-1}" \
      npm run smoke:livekit:media
    SMOKE_LIVEKIT_MEDIA_STATUS="pass"
  else
    echo "[postdeploy-smoke] smoke:livekit:media skipped (SMOKE_LIVEKIT_MEDIA=0)"
    SMOKE_LIVEKIT_MEDIA_STATUS="skip"
  fi

  SMOKE_LIVEKIT_GATE_STATUS="pass"
fi

if [[ "${SMOKE_REALTIME_MEDIA:-0}" == "1" ]]; then
  echo "[postdeploy-smoke] smoke:realtime:media"
  media_smoke_log="$(mktemp)"
  media_ice_servers_json=""
  media_retry_count="${SMOKE_REALTIME_MEDIA_RETRIES:-1}"
  media_retry_delay_sec="${SMOKE_REALTIME_MEDIA_RETRY_DELAY_SEC:-5}"
  media_attempt=1
  media_run_ok=0

  if ! [[ "$media_retry_count" =~ ^[0-9]+$ ]] || (( media_retry_count < 1 )); then
    media_retry_count=1
  fi
  if ! [[ "$media_retry_delay_sec" =~ ^[0-9]+$ ]]; then
    media_retry_delay_sec=5
  fi

  if [[ -n "${TURN_USERNAME:-}" && -n "${TURN_PASSWORD:-}" ]]; then
    media_turn_domain="${TURN_CERT_DOMAIN:-gismalink.art}"
    media_turn_tls_port="${TURN_TLS_PORT:-5349}"
    media_ice_servers_json="[{\"urls\":[\"turn:${media_turn_domain}:3478?transport=udp\",\"turn:${media_turn_domain}:3478?transport=tcp\",\"turns:${media_turn_domain}:${media_turn_tls_port}?transport=tcp\"],\"username\":\"${TURN_USERNAME}\",\"credential\":\"${TURN_PASSWORD}\"}]"
  fi

  # ws tickets are one-time; prefer fresh issuance via bearer tokens for each media attempt.
  media_ws_ticket="${SMOKE_WS_TICKET:-}"
  media_ws_ticket_second="${SMOKE_WS_TICKET_SECOND:-}"
  if [[ -n "${SMOKE_TEST_BEARER_TOKEN:-}" ]]; then
    media_ws_ticket=""
  fi
  if [[ -n "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" ]]; then
    media_ws_ticket_second=""
  fi

  if [[ -z "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" && -z "${SMOKE_WS_TICKET_SECOND:-}" ]]; then
    USER_META_SECOND_MEDIA="$(resolve_user_meta_by_email "$USER_EMAIL_SECOND")"
    if [[ -z "$USER_META_SECOND_MEDIA" ]]; then
      rm -f "$media_smoke_log"
      echo "[postdeploy-smoke] cannot resolve second smoke user for realtime media gate email=$USER_EMAIL_SECOND" >&2
      exit 1
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      JWT_SECRET_CANDIDATE="${JWT_SECRET:-${TEST_JWT_SECRET:-}}"
      if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
        JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r' | tr -d '\n')"
      fi
    fi

    if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
      rm -f "$media_smoke_log"
      echo "[postdeploy-smoke] cannot generate SMOKE_TEST_BEARER_TOKEN_SECOND for realtime media gate (missing JWT secret)" >&2
      exit 1
    fi

    SMOKE_TEST_BEARER_TOKEN_SECOND="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "${USER_META_SECOND_MEDIA%%|*}" "${USER_META_SECOND_MEDIA##*|}")"
    export SMOKE_TEST_BEARER_TOKEN_SECOND
  fi

  while (( media_attempt <= media_retry_count )); do
    : >"$media_smoke_log"
    echo "[postdeploy-smoke] smoke:realtime:media attempt $media_attempt/$media_retry_count"

    if SMOKE_API_URL="$BASE_URL" \
      SMOKE_ROOM_SLUG="$MEDIA_SMOKE_ROOM_SLUG" \
      SMOKE_TEST_BEARER_TOKEN="${SMOKE_TEST_BEARER_TOKEN:-}" \
      SMOKE_TEST_BEARER_TOKEN_SECOND="${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" \
      SMOKE_WS_TICKET="$media_ws_ticket" \
      SMOKE_WS_TICKET_SECOND="$media_ws_ticket_second" \
      SMOKE_RTC_WS_READY_TIMEOUT_MS="${SMOKE_RTC_WS_READY_TIMEOUT_MS:-35000}" \
      SMOKE_RTC_ICE_SERVERS_JSON="${SMOKE_RTC_ICE_SERVERS_JSON:-$media_ice_servers_json}" \
      SMOKE_RTC_ICE_TRANSPORT_POLICY="${SMOKE_RTC_ICE_TRANSPORT_POLICY:-${TEST_VITE_RTC_ICE_TRANSPORT_POLICY:-all}}" \
      SMOKE_RTC_REQUIRE_ICE_RESTART="${SMOKE_RTC_REQUIRE_ICE_RESTART:-0}" \
      node ./scripts/smoke/smoke-realtime-media-browser.mjs | tee "$media_smoke_log"; then
      media_run_ok=1
      break
    fi

    ((media_attempt++))
    if (( media_attempt <= media_retry_count )); then
      echo "[postdeploy-smoke] smoke:realtime:media transient failure, retry in ${media_retry_delay_sec}s"
      sleep "$media_retry_delay_sec"
    fi
  done

  if (( media_run_ok == 1 )); then
    SMOKE_REALTIME_MEDIA_STATUS="pass"
    SMOKE_MEDIA_TRANSPORT_SUMMARY="$(parse_media_transport_summary "$media_smoke_log")"
    one_way_counters="$(parse_media_one_way_counters "$media_smoke_log")"
    SMOKE_ONE_WAY_AUDIO_INCIDENTS="${one_way_counters%%|*}"
    SMOKE_ONE_WAY_VIDEO_INCIDENTS="${one_way_counters##*|}"

    if [[ "${SMOKE_FAIL_ON_ONE_WAY:-1}" == "1" ]] && { [[ "$SMOKE_ONE_WAY_AUDIO_INCIDENTS" != "0" ]] || [[ "$SMOKE_ONE_WAY_VIDEO_INCIDENTS" != "0" ]]; }; then
      rm -f "$media_smoke_log"
      echo "[postdeploy-smoke] one-way media incidents detected: audio=$SMOKE_ONE_WAY_AUDIO_INCIDENTS video=$SMOKE_ONE_WAY_VIDEO_INCIDENTS" >&2
      exit 1
    fi
  else
    SMOKE_REALTIME_MEDIA_STATUS="warn"
    SMOKE_MEDIA_TRANSPORT_SUMMARY="failed"
    rm -f "$media_smoke_log"
    if [[ "${SMOKE_REALTIME_MEDIA_STRICT:-0}" == "1" ]]; then
      echo "[postdeploy-smoke] smoke:realtime:media failed (strict mode)" >&2
      exit 1
    fi
    echo "[postdeploy-smoke] smoke:realtime:media failed (non-strict, continue)" >&2
  fi

  rm -f "$media_smoke_log"
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

collect_turn_allocation_failures

SMOKE_STATUS="pass"
SMOKE_SUMMARY_TEXT="health=pass mode=sso sso=pass api=$API_SMOKE_STATUS chat_object_storage=$CHAT_OBJECT_STORAGE_STATUS minio_storage=$MINIO_STORAGE_STATUS auth_session=$API_AUTH_SESSION_STATUS cookie_negative=$COOKIE_NEGATIVE_STATUS cookie_ws_ticket=$COOKIE_WS_TICKET_STATUS version_cache=$VERSION_CACHE_STATUS web_crash_boundary=$WEB_CRASH_BOUNDARY_STATUS web_rnnoise=$WEB_RNNOISE_STATUS desktop_update_feed=$DESKTOP_UPDATE_FEED_STATUS livekit_standard=$SMOKE_LIVEKIT_STANDARD_PROFILE_STATUS turn_tls=$SMOKE_TURN_TLS_STATUS turn_rotation=$SMOKE_TURN_ROTATION_STATUS turn_alloc_failures=$SMOKE_TURN_ALLOCATION_FAILURES turn_alloc_status=$SMOKE_TURN_ALLOCATION_STATUS realtime=pass extended_realtime=$EXTENDED_REALTIME_STATUS livekit_gate=$SMOKE_LIVEKIT_GATE_STATUS livekit_media=$SMOKE_LIVEKIT_MEDIA_STATUS realtime_media=$SMOKE_REALTIME_MEDIA_STATUS transport=$SMOKE_MEDIA_TRANSPORT_SUMMARY one_way(audio=$SMOKE_ONE_WAY_AUDIO_INCIDENTS,video=$SMOKE_ONE_WAY_VIDEO_INCIDENTS) delta(nack=$SMOKE_NACK_DELTA,ack=$SMOKE_ACK_DELTA,chat=$SMOKE_CHAT_SENT_DELTA,idem=$SMOKE_CHAT_IDEMPOTENCY_HIT_DELTA,initial_state=$SMOKE_CALL_INITIAL_STATE_SENT_DELTA,initial_state_participants=$SMOKE_CALL_INITIAL_STATE_PARTICIPANTS_DELTA)"

echo "[postdeploy-smoke] done"
