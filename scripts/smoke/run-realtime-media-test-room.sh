#!/usr/bin/env bash
# Purpose: Запускает browser RTC media smoke для test-room с токенами smoke-пользователей и авто-получением ws-ticket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BASE_URL="${SMOKE_API_URL:-https://test.boltorezka.gismalink.art}"
ROOM_SLUG="${SMOKE_ROOM_SLUG:-test-room}"
SETTLE_MS="${SMOKE_RTC_MEDIA_SETTLE_MS:-45000}"
TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}"
AUTH_ENV_FILE="${SMOKE_AUTH_ENV_FILE:-.deploy/smoke-auth.env}"
HOST_ENV_FILE="${SMOKE_HOST_ENV_FILE:-infra/.env.host}"
TONE_BASE_HZ="${SMOKE_RTC_TONE_FREQUENCY_BASE_HZ:-438}"
TONE_SPREAD_HZ="${SMOKE_RTC_TONE_SPREAD_HZ:-22}"
TONE_MELODY_STEP_MS="${SMOKE_RTC_TONE_MELODY_STEP_MS:-380}"
VIDEO_NOISE_WIDTH="${SMOKE_RTC_VIDEO_NOISE_WIDTH:-320}"
VIDEO_NOISE_HEIGHT="${SMOKE_RTC_VIDEO_NOISE_HEIGHT:-240}"
VIDEO_NOISE_FPS="${SMOKE_RTC_VIDEO_NOISE_FPS:-12}"
DISABLE_MDNS="${SMOKE_RTC_DISABLE_MDNS:-1}"
MAX_TEST_DURATION_MS=120000

if [[ "${SMOKE_ALLOW_LEGACY_CALL_SIGNAL:-0}" != "1" ]]; then
  echo "[smoke:realtime:media] requires SMOKE_ALLOW_LEGACY_CALL_SIGNAL=1 (legacy signaling path)" >&2
  exit 1
fi

if [[ "$TIMEOUT_MS" =~ ^[0-9]+$ ]] && (( TIMEOUT_MS > MAX_TEST_DURATION_MS )); then
  TIMEOUT_MS="$MAX_TEST_DURATION_MS"
fi
if [[ "$SETTLE_MS" =~ ^[0-9]+$ ]] && (( SETTLE_MS > MAX_TEST_DURATION_MS )); then
  SETTLE_MS="$MAX_TEST_DURATION_MS"
fi

BASE_HOST="$(printf '%s' "$BASE_URL" | sed -E 's#https?://([^/]+).*#\1#')"
USE_LOCAL_RESOLVE="${SMOKE_USE_LOCAL_RESOLVE:-0}"

resolve_flags=()
resolver_rule=""
if [[ "$USE_LOCAL_RESOLVE" == "1" && "$BASE_URL" == https://* && -n "$BASE_HOST" ]]; then
  resolve_flags=(--resolve "$BASE_HOST:443:127.0.0.1")
  resolver_rule="MAP $BASE_HOST 127.0.0.1"
fi

cd "$REPO_DIR"

if [[ ! -f "$AUTH_ENV_FILE" ]]; then
  echo "[smoke:realtime:media] missing auth env file: $AUTH_ENV_FILE" >&2
  exit 1
fi

read_env_raw() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  local line
  line="$(grep -m1 -E "^${key}=" "$file" || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi
  printf '%s' "${line#*=}"
}

strip_outer_quotes() {
  local value="$1"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  printf '%s' "$value"
}

set -a
source "$AUTH_ENV_FILE"
set +a

HOST_ICE_JSON_RAW="$(read_env_raw TEST_VITE_RTC_ICE_SERVERS_JSON "$HOST_ENV_FILE")"
HOST_ICE_TRANSPORT_POLICY_RAW="$(read_env_raw TEST_VITE_RTC_ICE_TRANSPORT_POLICY "$HOST_ENV_FILE")"
HOST_TURN_USERNAME_RAW="$(read_env_raw TURN_USERNAME "$HOST_ENV_FILE")"
HOST_TURN_PASSWORD_RAW="$(read_env_raw TURN_PASSWORD "$HOST_ENV_FILE")"
HOST_TURN_CERT_DOMAIN_RAW="$(read_env_raw TURN_CERT_DOMAIN "$HOST_ENV_FILE")"
HOST_TURN_TLS_PORT_RAW="$(read_env_raw TURN_TLS_PORT "$HOST_ENV_FILE")"

HOST_ICE_JSON="$(strip_outer_quotes "$HOST_ICE_JSON_RAW")"
HOST_ICE_TRANSPORT_POLICY="$(strip_outer_quotes "$HOST_ICE_TRANSPORT_POLICY_RAW")"
HOST_TURN_USERNAME="$(strip_outer_quotes "$HOST_TURN_USERNAME_RAW")"
HOST_TURN_PASSWORD="$(strip_outer_quotes "$HOST_TURN_PASSWORD_RAW")"
HOST_TURN_CERT_DOMAIN="$(strip_outer_quotes "$HOST_TURN_CERT_DOMAIN_RAW")"
HOST_TURN_TLS_PORT="$(strip_outer_quotes "$HOST_TURN_TLS_PORT_RAW")"
if [[ -z "$HOST_TURN_TLS_PORT" ]]; then
  HOST_TURN_TLS_PORT="5349"
fi

# Backward compatibility: older smoke auth files use SMOKE_BEARER_TOKEN names.
if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" && -n "${SMOKE_BEARER_TOKEN:-}" ]]; then
  SMOKE_TEST_BEARER_TOKEN="$SMOKE_BEARER_TOKEN"
fi
if [[ -z "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" && -n "${SMOKE_BEARER_TOKEN_SECOND:-}" ]]; then
  SMOKE_TEST_BEARER_TOKEN_SECOND="$SMOKE_BEARER_TOKEN_SECOND"
fi

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" || -z "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" ]]; then
  echo "[smoke:realtime:media] missing SMOKE_TEST_BEARER_TOKEN or SMOKE_TEST_BEARER_TOKEN_SECOND in $AUTH_ENV_FILE" >&2
  exit 1
fi

curl_flags=(--retry 8 --retry-delay 1 -fsS)
if (( ${#resolve_flags[@]} > 0 )); then
  curl_flags+=("${resolve_flags[@]}")
fi

TICKET_PRIMARY="$(curl "${curl_flags[@]}" -H "Authorization: Bearer $SMOKE_TEST_BEARER_TOKEN" "$BASE_URL/v1/auth/ws-ticket" | jq -r .ticket)"
TICKET_SECOND="$(curl "${curl_flags[@]}" -H "Authorization: Bearer $SMOKE_TEST_BEARER_TOKEN_SECOND" "$BASE_URL/v1/auth/ws-ticket" | jq -r .ticket)"

if [[ -z "$TICKET_PRIMARY" || "$TICKET_PRIMARY" == "null" || -z "$TICKET_SECOND" || "$TICKET_SECOND" == "null" ]]; then
  echo "[smoke:realtime:media] failed to resolve ws tickets" >&2
  exit 1
fi

ICE_JSON="${SMOKE_RTC_ICE_SERVERS_JSON:-}"
if [[ -z "$ICE_JSON" ]]; then
  ICE_JSON="$HOST_ICE_JSON"
fi

if [[ -n "$ICE_JSON" ]] && ! printf '%s' "$ICE_JSON" | jq -e . >/dev/null 2>&1; then
  ICE_JSON=""
fi

if [[ -z "$ICE_JSON" && -n "$HOST_TURN_USERNAME" && -n "$HOST_TURN_PASSWORD" ]]; then
  ICE_JSON="$(jq -cn \
    --arg host "gismalink.art" \
    --arg tlsPort "$HOST_TURN_TLS_PORT" \
    --arg user "$HOST_TURN_USERNAME" \
    --arg pass "$HOST_TURN_PASSWORD" \
    '[{urls:["turn:" + $host + ":3478?transport=udp","turns:" + $host + ":" + $tlsPort + "?transport=tcp"],username:$user,credential:$pass}]')"
fi

TURN_HOST_FOR_SMOKE="${HOST_TURN_CERT_DOMAIN:-gismalink.art}"
APPEND_TURN_UDP="${SMOKE_RTC_APPEND_TURN_UDP:-1}"
if [[ "$APPEND_TURN_UDP" == "1" && -n "$ICE_JSON" ]] && printf '%s' "$ICE_JSON" | jq -e . >/dev/null 2>&1; then
  HAS_TURN_UDP="$(printf '%s' "$ICE_JSON" | jq -r '[.[].urls[]? | select(startswith("turn:") and contains(":3478"))] | length')"
  if [[ "$HAS_TURN_UDP" == "0" ]]; then
    ICE_JSON="$(printf '%s' "$ICE_JSON" | jq -c --arg host "$TURN_HOST_FOR_SMOKE" 'map(.urls = (((.urls // []) + ["turn:" + $host + ":3478?transport=udp"]) | unique))')"
  fi
fi

if [[ -n "$ICE_JSON" ]]; then
  ICE_URLS_DEBUG="$(printf '%s' "$ICE_JSON" | jq -r '[.[].urls[]?] | join(",")' 2>/dev/null || echo "<invalid-json>")"
  ICE_COUNT_DEBUG="$(printf '%s' "$ICE_JSON" | jq -r 'length' 2>/dev/null || echo 0)"
  echo "[smoke:realtime:media] ice servers configured: count=$ICE_COUNT_DEBUG urls=$ICE_URLS_DEBUG"
else
  echo "[smoke:realtime:media] ice servers configured: <empty>"
fi

ICE_TRANSPORT_POLICY="${SMOKE_RTC_ICE_TRANSPORT_POLICY:-$HOST_ICE_TRANSPORT_POLICY}"
if [[ "$ICE_TRANSPORT_POLICY" != "relay" && "$ICE_TRANSPORT_POLICY" != "all" ]]; then
  ICE_TRANSPORT_POLICY="all"
fi
echo "[smoke:realtime:media] ice transport policy: $ICE_TRANSPORT_POLICY"
echo "[smoke:realtime:media] mdns host candidates disabled: $DISABLE_MDNS"

SMOKE_API_URL="$BASE_URL" \
SMOKE_ROOM_SLUG="$ROOM_SLUG" \
SMOKE_TIMEOUT_MS="$TIMEOUT_MS" \
SMOKE_WS_TICKET="$TICKET_PRIMARY" \
SMOKE_WS_TICKET_SECOND="$TICKET_SECOND" \
SMOKE_CHROMIUM_HOST_RESOLVE_RULE="$resolver_rule" \
SMOKE_RTC_MEDIA_SETTLE_MS="$SETTLE_MS" \
SMOKE_RTC_TONE_FREQUENCY_BASE_HZ="$TONE_BASE_HZ" \
SMOKE_RTC_TONE_SPREAD_HZ="$TONE_SPREAD_HZ" \
SMOKE_RTC_TONE_MELODY_STEP_MS="$TONE_MELODY_STEP_MS" \
SMOKE_RTC_VIDEO_NOISE_WIDTH="$VIDEO_NOISE_WIDTH" \
SMOKE_RTC_VIDEO_NOISE_HEIGHT="$VIDEO_NOISE_HEIGHT" \
SMOKE_RTC_VIDEO_NOISE_FPS="$VIDEO_NOISE_FPS" \
SMOKE_RTC_ICE_SERVERS_JSON="$ICE_JSON" \
SMOKE_RTC_ICE_TRANSPORT_POLICY="$ICE_TRANSPORT_POLICY" \
SMOKE_RTC_DISABLE_MDNS="$DISABLE_MDNS" \
npm run smoke:realtime:media
