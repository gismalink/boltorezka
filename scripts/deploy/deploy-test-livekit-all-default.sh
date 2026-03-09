#!/usr/bin/env bash
# Purpose: Run test deploy+smoke with LiveKit as default topology for all rooms.
set -euo pipefail

if [[ -z "${TEST_REF:-}" ]]; then
  echo "[deploy-test-livekit-all-default] set TEST_REF=origin/feature/<name>" >&2
  exit 1
fi

LIVEKIT_ROOM_SLUG="${SMOKE_LIVEKIT_ROOM_SLUG:-test-room}"

# Baseline room and dedicated gate room both expect LiveKit topology.
export SMOKE_EXPECT_MEDIA_TOPOLOGY="${SMOKE_EXPECT_MEDIA_TOPOLOGY:-livekit}"
export SMOKE_LIVEKIT_ROOM_SLUG="${SMOKE_LIVEKIT_ROOM_SLUG:-$LIVEKIT_ROOM_SLUG}"
export SMOKE_LIVEKIT_MEDIA="${SMOKE_LIVEKIT_MEDIA:-1}"
export SMOKE_LIVEKIT_FAIL_ON_ONE_WAY="${SMOKE_LIVEKIT_FAIL_ON_ONE_WAY:-1}"
export SMOKE_REALTIME_MEDIA="${SMOKE_REALTIME_MEDIA:-0}"

exec bash ./scripts/deploy/deploy-test-and-smoke.sh "$TEST_REF" "${REPO_DIR:-$PWD}"
