#!/usr/bin/env bash
# Purpose: Run test deploy+smoke with legacy SFU as default topology (rollback-only profile).
set -euo pipefail

if [[ -z "${TEST_REF:-}" ]]; then
  echo "[deploy-test-sfu-default] set TEST_REF=origin/feature/<name>" >&2
  exit 1
fi

echo "[deploy-test-sfu-default] legacy fallback profile: prefer deploy-test-livekit-default for ongoing work" >&2

export TEST_RTC_MEDIA_TOPOLOGY_DEFAULT="${TEST_RTC_MEDIA_TOPOLOGY_DEFAULT:-sfu}"
export TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS="${TEST_RTC_MEDIA_TOPOLOGY_SFU_ROOMS:-}"
export TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS="${TEST_RTC_MEDIA_TOPOLOGY_SFU_USERS:-}"
export SMOKE_EXPECT_MEDIA_TOPOLOGY="${SMOKE_EXPECT_MEDIA_TOPOLOGY:-sfu}"
export SMOKE_REALTIME_MEDIA="${SMOKE_REALTIME_MEDIA:-1}"
export SMOKE_FAIL_ON_ONE_WAY="${SMOKE_FAIL_ON_ONE_WAY:-1}"
export SMOKE_REALTIME_MEDIA_STRICT="${SMOKE_REALTIME_MEDIA_STRICT:-1}"
export SMOKE_REALTIME_MEDIA_RETRIES="${SMOKE_REALTIME_MEDIA_RETRIES:-2}"
export SMOKE_REALTIME_MEDIA_RETRY_DELAY_SEC="${SMOKE_REALTIME_MEDIA_RETRY_DELAY_SEC:-5}"
export SMOKE_RTC_REQUIRE_ICE_RESTART="${SMOKE_RTC_REQUIRE_ICE_RESTART:-1}"
export SMOKE_RTC_MAX_RELAYED_OFFERS="${SMOKE_RTC_MAX_RELAYED_OFFERS:-40}"
export SMOKE_RTC_MAX_RELAYED_ANSWERS="${SMOKE_RTC_MAX_RELAYED_ANSWERS:-40}"
export SMOKE_RTC_MAX_RENEGOTIATION_EVENTS="${SMOKE_RTC_MAX_RENEGOTIATION_EVENTS:-80}"

exec bash ./scripts/deploy/deploy-test-and-smoke.sh "$TEST_REF" "${REPO_DIR:-$PWD}"
