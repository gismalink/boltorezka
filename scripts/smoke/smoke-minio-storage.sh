#!/usr/bin/env bash
# Purpose: Validate MinIO endpoint readiness for chat object storage cutover.
set -euo pipefail

ENDPOINT_RAW="${SMOKE_MINIO_ENDPOINT:-http://127.0.0.1:19000}"
FALLBACK_ENDPOINT_RAW="${SMOKE_MINIO_ENDPOINT_FALLBACK:-}"
PROVIDER="${SMOKE_MINIO_STORAGE_PROVIDER:-localfs}"
EXPECTED_PROVIDER="${SMOKE_MINIO_EXPECTED_PROVIDER:-minio}"
REQUIRE_PROVIDER="${SMOKE_MINIO_REQUIRE_PROVIDER:-1}"
RETRIES_RAW="${SMOKE_MINIO_RETRIES:-8}"
RETRY_DELAY_RAW="${SMOKE_MINIO_RETRY_DELAY_SEC:-2}"

trim() {
  local value="$1"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

normalize_endpoint() {
  local endpoint
  endpoint="$(trim "$1")"
  endpoint="${endpoint%/}"
  if [[ -z "$endpoint" ]]; then
    return 1
  fi
  printf '%s' "$endpoint"
}

provider_normalized="$(printf '%s' "$PROVIDER" | tr '[:upper:]' '[:lower:]')"
expected_provider_normalized="$(printf '%s' "$EXPECTED_PROVIDER" | tr '[:upper:]' '[:lower:]')"

if [[ "$REQUIRE_PROVIDER" == "1" && "$provider_normalized" != "$expected_provider_normalized" ]]; then
  echo "[smoke:minio:storage] skipped: provider=$PROVIDER (expected $EXPECTED_PROVIDER)"
  exit 0
fi

if ! [[ "$RETRIES_RAW" =~ ^[0-9]+$ ]] || (( RETRIES_RAW < 1 )); then
  RETRIES_RAW=8
fi
if ! [[ "$RETRY_DELAY_RAW" =~ ^[0-9]+$ ]]; then
  RETRY_DELAY_RAW=2
fi

ENDPOINT="$(normalize_endpoint "$ENDPOINT_RAW" || true)"
FALLBACK_ENDPOINT="$(normalize_endpoint "$FALLBACK_ENDPOINT_RAW" || true)"

if [[ -z "$ENDPOINT" && -z "$FALLBACK_ENDPOINT" ]]; then
  echo "[smoke:minio:storage] failed: endpoint is empty" >&2
  exit 1
fi

health_check() {
  local endpoint="$1"
  local path="$2"
  local label="$3"
  local attempt=1

  while (( attempt <= RETRIES_RAW )); do
    if curl --connect-timeout 3 --max-time 8 -fsS "${endpoint}${path}" >/dev/null 2>&1; then
      echo "[smoke:minio:storage] ${label} ok: ${endpoint}${path}"
      return 0
    fi

    if (( attempt < RETRIES_RAW )); then
      sleep "$RETRY_DELAY_RAW"
    fi
    attempt=$((attempt + 1))
  done

  return 1
}

check_endpoint() {
  local endpoint="$1"
  health_check "$endpoint" "/minio/health/live" "live"
  health_check "$endpoint" "/minio/health/ready" "ready"
}

if [[ -n "$ENDPOINT" ]] && check_endpoint "$ENDPOINT"; then
  echo "[smoke:minio:storage] ok endpoint=$ENDPOINT provider=$PROVIDER"
  exit 0
fi

if [[ -n "$FALLBACK_ENDPOINT" ]] && check_endpoint "$FALLBACK_ENDPOINT"; then
  echo "[smoke:minio:storage] ok endpoint=$FALLBACK_ENDPOINT provider=$PROVIDER (fallback)"
  exit 0
fi

echo "[smoke:minio:storage] failed: MinIO health checks did not pass" >&2
if [[ -n "$ENDPOINT" ]]; then
  echo "[smoke:minio:storage] endpoint tried: $ENDPOINT" >&2
fi
if [[ -n "$FALLBACK_ENDPOINT" ]]; then
  echo "[smoke:minio:storage] fallback endpoint tried: $FALLBACK_ENDPOINT" >&2
fi
exit 1
