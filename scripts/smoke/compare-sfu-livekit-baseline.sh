#!/usr/bin/env bash
# Purpose: Compare test baseline metrics between current SFU profile and livekit-topology profile on the same git ref.
set -euo pipefail

if [[ -z "${TEST_REF:-}" ]]; then
  echo "[compare:sfu-livekit] set TEST_REF=origin/<branch_or_main>" >&2
  exit 1
fi

REPO_DIR="${REPO_DIR:-$PWD}"
DEPLOY_RETRIES="${COMPARE_DEPLOY_RETRIES:-3}"
RETRY_DELAY_SEC="${COMPARE_RETRY_DELAY_SEC:-12}"
RESTORE_REF="${COMPARE_RESTORE_REF:-1}"
LIVEKIT_ROOM_SLUG="${COMPARE_LIVEKIT_ROOM_SLUG:-test-room}"
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_PATH="$REPO_DIR/.deploy/compare-sfu-livekit-${TIMESTAMP_UTC}.md"
SFU_ENV_PATH="$REPO_DIR/.deploy/compare-sfu-current-${TIMESTAMP_UTC}.env"
LIVEKIT_ENV_PATH="$REPO_DIR/.deploy/compare-livekit-${TIMESTAMP_UTC}.env"
LIVEKIT_GUARD_JSON="$REPO_DIR/.deploy/compare-livekit-guard-${TIMESTAMP_UTC}.json"

if ! [[ "$DEPLOY_RETRIES" =~ ^[0-9]+$ ]] || (( DEPLOY_RETRIES < 1 )); then
  DEPLOY_RETRIES=3
fi
if ! [[ "$RETRY_DELAY_SEC" =~ ^[0-9]+$ ]] || (( RETRY_DELAY_SEC < 1 )); then
  RETRY_DELAY_SEC=12
fi

mkdir -p "$REPO_DIR/.deploy"
cd "$REPO_DIR"

ORIGINAL_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
ORIGINAL_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"

restore_original_ref() {
  if [[ "$RESTORE_REF" != "1" ]]; then
    return 0
  fi

  if [[ -n "$ORIGINAL_BRANCH" ]]; then
    git checkout "$ORIGINAL_BRANCH" >/dev/null 2>&1 || true
    return 0
  fi

  if [[ -n "$ORIGINAL_COMMIT" ]]; then
    git checkout --detach "$ORIGINAL_COMMIT" >/dev/null 2>&1 || true
  fi
}

trap restore_original_ref EXIT

run_profile() {
  local profile="$1"
  local output_env="$2"
  local cmd="$3"

  local attempt=1
  while (( attempt <= DEPLOY_RETRIES )); do
    echo "[compare:sfu-livekit] profile=$profile attempt=$attempt/$DEPLOY_RETRIES"

    if eval "$cmd"; then
      cp "$REPO_DIR/.deploy/last-smoke-summary.env" "$output_env"
      echo "[compare:sfu-livekit] profile=$profile status=pass"
      return 0
    fi

    if (( attempt == DEPLOY_RETRIES )); then
      echo "[compare:sfu-livekit] profile=$profile failed after $DEPLOY_RETRIES attempts" >&2
      return 1
    fi

    echo "[compare:sfu-livekit] profile=$profile transient failure, retry in ${RETRY_DELAY_SEC}s" >&2
    sleep "$RETRY_DELAY_SEC"
    ((attempt++))
  done
}

read_var() {
  local file="$1"
  local key="$2"
  local line

  line="$(grep -m1 -E "^${key}=" "$file" || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "n/a"
    return 0
  fi

  printf '%s' "${line#*=}" | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'
}

run_livekit_guard() {
  local output_path="$1"
  local room_slug="$2"

  SMOKE_AUTH_COMPOSE_FILE="infra/docker-compose.host.yml" \
  SMOKE_AUTH_ENV_FILE="infra/.env.host" \
  SMOKE_AUTH_API_SERVICE="boltorezka-api-test" \
  SMOKE_AUTH_POSTGRES_SERVICE="boltorezka-db-test" \
  SMOKE_API_URL="https://test.boltorezka.gismalink.art" \
  SMOKE_AUTH_OUTPUT_FILE=".deploy/smoke-auth-livekit.env" \
  bash ./scripts/smoke/smoke-auth-bootstrap.sh >/dev/null

  set -a
  source .deploy/smoke-auth-livekit.env
  set +a

  SMOKE_API_URL="https://test.boltorezka.gismalink.art" \
  SMOKE_ROOM_SLUG="$room_slug" \
  SMOKE_CALL_SIGNAL=1 \
  SMOKE_RECONNECT=0 \
  SMOKE_REQUIRE_MEDIA_TOPOLOGY=1 \
  SMOKE_EXPECT_MEDIA_TOPOLOGY=livekit \
  node ./scripts/smoke/smoke-realtime.mjs >"$output_path"
}

SFU_CMD="TEST_REF=${TEST_REF} npm run deploy:test:sfu"
LIVEKIT_CMD="TEST_REF=${TEST_REF} TEST_RTC_MEDIA_TOPOLOGY_DEFAULT=p2p TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS= TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS= TEST_RTC_MEDIA_TOPOLOGY_LIVEKIT_ROOMS=${LIVEKIT_ROOM_SLUG} TEST_RTC_MEDIA_TOPOLOGY_LIVEKIT_USERS= SMOKE_ROOM_SLUG=general SMOKE_SFU_ROOM_SLUG=${LIVEKIT_ROOM_SLUG} SMOKE_SFU_EXPECT_MEDIA_TOPOLOGY=livekit SMOKE_LIVEKIT_ROOM_SLUG=${LIVEKIT_ROOM_SLUG} SMOKE_REALTIME_MEDIA=1 SMOKE_REALTIME_MEDIA_ROOM_SLUG=${LIVEKIT_ROOM_SLUG} SMOKE_REALTIME_MEDIA_STRICT=1 SMOKE_REALTIME_MEDIA_RETRIES=2 SMOKE_REALTIME_MEDIA_RETRY_DELAY_SEC=5 npm run deploy:test:smoke"

run_profile "sfu-current" "$SFU_ENV_PATH" "$SFU_CMD"
run_profile "livekit-topology" "$LIVEKIT_ENV_PATH" "$LIVEKIT_CMD"
run_livekit_guard "$LIVEKIT_GUARD_JSON" "$LIVEKIT_ROOM_SLUG"

SFU_STATUS="$(read_var "$SFU_ENV_PATH" "SMOKE_STATUS")"
SFU_REALTIME_MEDIA="$(read_var "$SFU_ENV_PATH" "SMOKE_REALTIME_MEDIA_STATUS")"
SFU_TURN_TLS="$(read_var "$SFU_ENV_PATH" "SMOKE_TURN_TLS_STATUS")"
SFU_AUDIO_INCIDENTS="$(read_var "$SFU_ENV_PATH" "SMOKE_ONE_WAY_AUDIO_INCIDENTS")"
SFU_VIDEO_INCIDENTS="$(read_var "$SFU_ENV_PATH" "SMOKE_ONE_WAY_VIDEO_INCIDENTS")"
SFU_TRANSPORT="$(read_var "$SFU_ENV_PATH" "SMOKE_MEDIA_TRANSPORT_SUMMARY")"
SFU_NACK_DELTA="$(read_var "$SFU_ENV_PATH" "SMOKE_NACK_DELTA")"
SFU_ACK_DELTA="$(read_var "$SFU_ENV_PATH" "SMOKE_ACK_DELTA")"
SFU_TOPOLOGY_STATUS="$(read_var "$SFU_ENV_PATH" "SMOKE_SFU_TOPOLOGY_STATUS")"

LIVEKIT_STATUS="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_STATUS")"
LIVEKIT_REALTIME_MEDIA="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_REALTIME_MEDIA_STATUS")"
LIVEKIT_TURN_TLS="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_TURN_TLS_STATUS")"
LIVEKIT_AUDIO_INCIDENTS="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_ONE_WAY_AUDIO_INCIDENTS")"
LIVEKIT_VIDEO_INCIDENTS="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_ONE_WAY_VIDEO_INCIDENTS")"
LIVEKIT_TRANSPORT="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_MEDIA_TRANSPORT_SUMMARY")"
LIVEKIT_NACK_DELTA="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_NACK_DELTA")"
LIVEKIT_ACK_DELTA="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_ACK_DELTA")"
LIVEKIT_TOPOLOGY_STATUS="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_SFU_TOPOLOGY_STATUS")"
LIVEKIT_GATE_STATUS="$(read_var "$LIVEKIT_ENV_PATH" "SMOKE_LIVEKIT_GATE_STATUS")"

LIVEKIT_GUARD_STATUS="fail"
LIVEKIT_GUARD_CODE="n/a"
if [[ -f "$LIVEKIT_GUARD_JSON" ]]; then
  LIVEKIT_GUARD_STATUS="$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(j.ok===true&&j.callSignalGuarded===true?"pass":"fail")}catch{process.stdout.write("fail")}' "$LIVEKIT_GUARD_JSON")"
  LIVEKIT_GUARD_CODE="$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.callSignalGuardCode||"n/a"))}catch{process.stdout.write("n/a")}' "$LIVEKIT_GUARD_JSON")"
fi

cat >"$REPORT_PATH" <<EOF
# SFU-current vs LiveKit-topology Comparison

- Timestamp (UTC): ${TIMESTAMP_UTC}
- Test ref: ${TEST_REF}
- Repo dir: ${REPO_DIR}
- LiveKit room slug: ${LIVEKIT_ROOM_SLUG}

| Profile | Smoke | Topology Gate | LiveKit Gate | LiveKit Guard | Guard Nack Code | Realtime Media | TURN TLS | One-way Audio | One-way Video | NACK delta | ACK delta | Transport summary |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---|
| sfu-current | ${SFU_STATUS} | ${SFU_TOPOLOGY_STATUS} | n/a | n/a | n/a | ${SFU_REALTIME_MEDIA} | ${SFU_TURN_TLS} | ${SFU_AUDIO_INCIDENTS} | ${SFU_VIDEO_INCIDENTS} | ${SFU_NACK_DELTA} | ${SFU_ACK_DELTA} | ${SFU_TRANSPORT} |
| livekit-topology | ${LIVEKIT_STATUS} | ${LIVEKIT_TOPOLOGY_STATUS} | ${LIVEKIT_GATE_STATUS} | ${LIVEKIT_GUARD_STATUS} | ${LIVEKIT_GUARD_CODE} | ${LIVEKIT_REALTIME_MEDIA} | ${LIVEKIT_TURN_TLS} | ${LIVEKIT_AUDIO_INCIDENTS} | ${LIVEKIT_VIDEO_INCIDENTS} | ${LIVEKIT_NACK_DELTA} | ${LIVEKIT_ACK_DELTA} | ${LIVEKIT_TRANSPORT} |

## Raw artifacts

- sfu-current env: \`$SFU_ENV_PATH\`
- livekit-topology env: \`$LIVEKIT_ENV_PATH\`
- livekit guard json: \`$LIVEKIT_GUARD_JSON\`
EOF

echo "[compare:sfu-livekit] report: $REPORT_PATH"
cat "$REPORT_PATH"
