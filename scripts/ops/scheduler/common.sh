#!/usr/bin/env bash
set -euo pipefail

COMMON_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_REPO_DIR="$(cd "$COMMON_SCRIPT_DIR/../../.." && pwd)"

SCHEDULER_BASE_DIR="${SCHEDULER_BASE_DIR:-${DATOWAVE_BASE_DIR:-$COMMON_REPO_DIR}}"
SCHEDULER_JOBS_DIR="${SCHEDULER_JOBS_DIR:-$SCHEDULER_BASE_DIR/scripts/ops/scheduler/jobs}"
SCHEDULER_STATE_DIR="${SCHEDULER_STATE_DIR:-$SCHEDULER_BASE_DIR/.deploy/scheduler}"
SCHEDULER_LOG_DIR="${SCHEDULER_LOG_DIR:-$SCHEDULER_STATE_DIR/logs}"
SCHEDULER_EXECUTIONS_LOG="${SCHEDULER_EXECUTIONS_LOG:-$SCHEDULER_STATE_DIR/executions.ndjson}"

scheduler_now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

scheduler_now_epoch() {
  date -u +%s
}

scheduler_ensure_state_dirs() {
  mkdir -p "$SCHEDULER_JOBS_DIR" "$SCHEDULER_LOG_DIR"
  mkdir -p "$(dirname "$SCHEDULER_EXECUTIONS_LOG")"
}

scheduler_safe_job_id() {
  local value="$1"
  if [[ ! "$value" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
    echo "[scheduler] invalid JOB_ID: '$value' (allowed: a-z, 0-9, dot, underscore, dash)" >&2
    exit 1
  fi
}

scheduler_job_file() {
  local job_id="$1"
  echo "$SCHEDULER_JOBS_DIR/${job_id}.env"
}

scheduler_append_event() {
  local event_json="$1"
  printf '%s\n' "$event_json" >> "$SCHEDULER_EXECUTIONS_LOG"
}
