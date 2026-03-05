#!/usr/bin/env bash
# Purpose: Запускает browser RTC media smoke для test-room с токенами smoke-пользователей и авто-получением ws-ticket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BASE_URL="${SMOKE_API_URL:-https://test.boltorezka.gismalink.art}"
ROOM_SLUG="${SMOKE_ROOM_SLUG:-test-room}"
SETTLE_MS="${SMOKE_RTC_MEDIA_SETTLE_MS:-480000}"
TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}"
AUTH_ENV_FILE="${SMOKE_AUTH_ENV_FILE:-.deploy/smoke-auth-live-a.env}"
TONE_BASE_HZ="${SMOKE_RTC_TONE_FREQUENCY_BASE_HZ:-438}"
TONE_SPREAD_HZ="${SMOKE_RTC_TONE_SPREAD_HZ:-22}"
TONE_MELODY_STEP_MS="${SMOKE_RTC_TONE_MELODY_STEP_MS:-380}"
VIDEO_NOISE_WIDTH="${SMOKE_RTC_VIDEO_NOISE_WIDTH:-320}"
VIDEO_NOISE_HEIGHT="${SMOKE_RTC_VIDEO_NOISE_HEIGHT:-240}"
VIDEO_NOISE_FPS="${SMOKE_RTC_VIDEO_NOISE_FPS:-12}"

BASE_HOST="$(printf '%s' "$BASE_URL" | sed -E 's#https?://([^/]+).*#\1#')"
USE_LOCAL_RESOLVE="${SMOKE_USE_LOCAL_RESOLVE:-1}"

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

set -a
source "$AUTH_ENV_FILE"
set +a

if [[ -z "${SMOKE_TEST_BEARER_TOKEN:-}" || -z "${SMOKE_TEST_BEARER_TOKEN_SECOND:-}" ]]; then
  echo "[smoke:realtime:media] missing SMOKE_TEST_BEARER_TOKEN or SMOKE_TEST_BEARER_TOKEN_SECOND in $AUTH_ENV_FILE" >&2
  exit 1
fi

TICKET_PRIMARY="$(curl --retry 8 --retry-delay 1 -fsS "${resolve_flags[@]}" -H "Authorization: Bearer $SMOKE_TEST_BEARER_TOKEN" "$BASE_URL/v1/auth/ws-ticket" | jq -r .ticket)"
TICKET_SECOND="$(curl --retry 8 --retry-delay 1 -fsS "${resolve_flags[@]}" -H "Authorization: Bearer $SMOKE_TEST_BEARER_TOKEN_SECOND" "$BASE_URL/v1/auth/ws-ticket" | jq -r .ticket)"

if [[ -z "$TICKET_PRIMARY" || "$TICKET_PRIMARY" == "null" || -z "$TICKET_SECOND" || "$TICKET_SECOND" == "null" ]]; then
  echo "[smoke:realtime:media] failed to resolve ws tickets" >&2
  exit 1
fi

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
npm run smoke:realtime:media
