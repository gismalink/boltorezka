#!/usr/bin/env bash
# Purpose: Run test deploy+smoke with LiveKit as default topology for all test rooms.
set -euo pipefail

if [[ -z "${TEST_REF:-}" ]]; then
  echo "[deploy-test-livekit-default] set TEST_REF=origin/feature/<name>" >&2
  exit 1
fi

LIVEKIT_ROOM_SLUG="${SMOKE_LIVEKIT_ROOM_SLUG:-test-room}"

export TEST_RTC_MEDIA_TOPOLOGY_DEFAULT="${TEST_RTC_MEDIA_TOPOLOGY_DEFAULT:-livekit}"
export TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS="${TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS:-}"
export TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS="${TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS:-}"
export TEST_RTC_MEDIA_TOPOLOGY_LIVEKIT_ROOMS="${TEST_RTC_MEDIA_TOPOLOGY_LIVEKIT_ROOMS:-}"
export TEST_RTC_MEDIA_TOPOLOGY_LIVEKIT_USERS="${TEST_RTC_MEDIA_TOPOLOGY_LIVEKIT_USERS:-}"

# LiveKit path validates baseline and dedicated room gates with LiveKit topology.
export SMOKE_EXPECT_MEDIA_TOPOLOGY="${SMOKE_EXPECT_MEDIA_TOPOLOGY:-livekit}"
export SMOKE_SFU_ROOM_SLUG="${SMOKE_SFU_ROOM_SLUG:-$LIVEKIT_ROOM_SLUG}"
export SMOKE_SFU_EXPECT_MEDIA_TOPOLOGY="${SMOKE_SFU_EXPECT_MEDIA_TOPOLOGY:-livekit}"
export SMOKE_LIVEKIT_ROOM_SLUG="${SMOKE_LIVEKIT_ROOM_SLUG:-$LIVEKIT_ROOM_SLUG}"
export SMOKE_LIVEKIT_MEDIA="${SMOKE_LIVEKIT_MEDIA:-1}"
export SMOKE_LIVEKIT_FAIL_ON_ONE_WAY="${SMOKE_LIVEKIT_FAIL_ON_ONE_WAY:-1}"
export SMOKE_REALTIME_MEDIA="${SMOKE_REALTIME_MEDIA:-0}"

exec bash ./scripts/deploy/deploy-test-and-smoke.sh "$TEST_REF" "${REPO_DIR:-$PWD}"
