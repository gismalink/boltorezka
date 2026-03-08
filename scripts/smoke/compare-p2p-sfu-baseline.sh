#!/usr/bin/env bash
# Purpose: Compare test baseline metrics between P2P and SFU profiles using the same git ref.
set -euo pipefail

if [[ -z "${TEST_REF:-}" ]]; then
  echo "[compare:p2p-sfu] set TEST_REF=origin/<branch_or_main>" >&2
  exit 1
fi

REPO_DIR="${REPO_DIR:-$PWD}"
DEPLOY_RETRIES="${COMPARE_DEPLOY_RETRIES:-3}"
RETRY_DELAY_SEC="${COMPARE_RETRY_DELAY_SEC:-12}"
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_PATH="$REPO_DIR/.deploy/compare-p2p-sfu-${TIMESTAMP_UTC}.md"
P2P_ENV_PATH="$REPO_DIR/.deploy/compare-p2p-${TIMESTAMP_UTC}.env"
SFU_ENV_PATH="$REPO_DIR/.deploy/compare-sfu-${TIMESTAMP_UTC}.env"

if ! [[ "$DEPLOY_RETRIES" =~ ^[0-9]+$ ]] || (( DEPLOY_RETRIES < 1 )); then
  DEPLOY_RETRIES=3
fi
if ! [[ "$RETRY_DELAY_SEC" =~ ^[0-9]+$ ]] || (( RETRY_DELAY_SEC < 1 )); then
  RETRY_DELAY_SEC=12
fi

mkdir -p "$REPO_DIR/.deploy"
cd "$REPO_DIR"

run_profile() {
  local profile="$1"
  local output_env="$2"
  local cmd="$3"

  local attempt=1
  while (( attempt <= DEPLOY_RETRIES )); do
    echo "[compare:p2p-sfu] profile=$profile attempt=$attempt/$DEPLOY_RETRIES"

    if eval "$cmd"; then
      cp "$REPO_DIR/.deploy/last-smoke-summary.env" "$output_env"
      echo "[compare:p2p-sfu] profile=$profile status=pass"
      return 0
    fi

    if (( attempt == DEPLOY_RETRIES )); then
      echo "[compare:p2p-sfu] profile=$profile failed after $DEPLOY_RETRIES attempts" >&2
      return 1
    fi

    echo "[compare:p2p-sfu] profile=$profile transient failure, retry in ${RETRY_DELAY_SEC}s" >&2
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

P2P_CMD="TEST_REF=${TEST_REF} SMOKE_REALTIME_MEDIA=1 SMOKE_FAIL_ON_ONE_WAY=1 SMOKE_REALTIME_MEDIA_STRICT=1 SMOKE_RTC_REQUIRE_ICE_RESTART=1 npm run deploy:test:smoke"
SFU_CMD="TEST_REF=${TEST_REF} npm run deploy:test:sfu"

run_profile "p2p" "$P2P_ENV_PATH" "$P2P_CMD"
run_profile "sfu" "$SFU_ENV_PATH" "$SFU_CMD"

P2P_STATUS="$(read_var "$P2P_ENV_PATH" "SMOKE_STATUS")"
P2P_REALTIME_MEDIA="$(read_var "$P2P_ENV_PATH" "SMOKE_REALTIME_MEDIA_STATUS")"
P2P_TURN_TLS="$(read_var "$P2P_ENV_PATH" "SMOKE_TURN_TLS_STATUS")"
P2P_AUDIO_INCIDENTS="$(read_var "$P2P_ENV_PATH" "SMOKE_ONE_WAY_AUDIO_INCIDENTS")"
P2P_VIDEO_INCIDENTS="$(read_var "$P2P_ENV_PATH" "SMOKE_ONE_WAY_VIDEO_INCIDENTS")"
P2P_TRANSPORT="$(read_var "$P2P_ENV_PATH" "SMOKE_MEDIA_TRANSPORT_SUMMARY")"
P2P_NACK_DELTA="$(read_var "$P2P_ENV_PATH" "SMOKE_NACK_DELTA")"
P2P_ACK_DELTA="$(read_var "$P2P_ENV_PATH" "SMOKE_ACK_DELTA")"

SFU_STATUS="$(read_var "$SFU_ENV_PATH" "SMOKE_STATUS")"
SFU_REALTIME_MEDIA="$(read_var "$SFU_ENV_PATH" "SMOKE_REALTIME_MEDIA_STATUS")"
SFU_TURN_TLS="$(read_var "$SFU_ENV_PATH" "SMOKE_TURN_TLS_STATUS")"
SFU_AUDIO_INCIDENTS="$(read_var "$SFU_ENV_PATH" "SMOKE_ONE_WAY_AUDIO_INCIDENTS")"
SFU_VIDEO_INCIDENTS="$(read_var "$SFU_ENV_PATH" "SMOKE_ONE_WAY_VIDEO_INCIDENTS")"
SFU_TRANSPORT="$(read_var "$SFU_ENV_PATH" "SMOKE_MEDIA_TRANSPORT_SUMMARY")"
SFU_NACK_DELTA="$(read_var "$SFU_ENV_PATH" "SMOKE_NACK_DELTA")"
SFU_ACK_DELTA="$(read_var "$SFU_ENV_PATH" "SMOKE_ACK_DELTA")"

cat >"$REPORT_PATH" <<EOF
# P2P vs SFU Baseline Comparison

- Timestamp (UTC): ${TIMESTAMP_UTC}
- Test ref: ${TEST_REF}
- Repo dir: ${REPO_DIR}

| Profile | Smoke | Realtime Media | TURN TLS | One-way Audio | One-way Video | NACK delta | ACK delta | Transport summary |
|---|---|---|---|---:|---:|---:|---:|---|
| p2p | ${P2P_STATUS} | ${P2P_REALTIME_MEDIA} | ${P2P_TURN_TLS} | ${P2P_AUDIO_INCIDENTS} | ${P2P_VIDEO_INCIDENTS} | ${P2P_NACK_DELTA} | ${P2P_ACK_DELTA} | ${P2P_TRANSPORT} |
| sfu | ${SFU_STATUS} | ${SFU_REALTIME_MEDIA} | ${SFU_TURN_TLS} | ${SFU_AUDIO_INCIDENTS} | ${SFU_VIDEO_INCIDENTS} | ${SFU_NACK_DELTA} | ${SFU_ACK_DELTA} | ${SFU_TRANSPORT} |

## Raw env snapshots

- p2p: \`$P2P_ENV_PATH\`
- sfu: \`$SFU_ENV_PATH\`
EOF

echo "[compare:p2p-sfu] report: $REPORT_PATH"
cat "$REPORT_PATH"
