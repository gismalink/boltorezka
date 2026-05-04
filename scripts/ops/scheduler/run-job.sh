#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ops/scheduler/common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage:
  run-job.sh <job-id>
  run-job.sh --file <absolute-or-relative-job-file>

Job files are env-style files with required keys:
  JOB_ID=<id>
  JOB_COMMAND=<command>

Optional keys:
  JOB_WORKDIR=<dir>                      # default: $SCHEDULER_BASE_DIR
  JOB_TIMEOUT_SECONDS=<seconds>          # default: no timeout
  JOB_ENABLED=0|1                        # default: 1
  JOB_LOG_RETENTION_DAYS=<days>          # default: 14
  JOB_ENV_<KEY>=<value>                  # exported for command runtime
USAGE
}

resolve_job_file() {
  if [[ "${1:-}" == "--file" ]]; then
    local file_path="${2:-}"
    if [[ -z "$file_path" ]]; then
      usage
      exit 1
    fi
    echo "$file_path"
    return
  fi

  local job_id="${1:-}"
  if [[ -z "$job_id" ]]; then
    usage
    exit 1
  fi
  scheduler_safe_job_id "$job_id"
  scheduler_job_file "$job_id"
}

export_job_env() {
  local job_file="$1"
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^JOB_ENV_[A-Za-z0-9_]+= ]]; then
      key="${line%%=*}"
      value="${line#*=}"
      key="${key#JOB_ENV_}"
      export "$key=$value"
    fi
  done < "$job_file"
}

resolve_timeout_cmd() {
  if command -v timeout >/dev/null 2>&1; then
    echo "timeout"
    return
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    echo "gtimeout"
    return
  fi
  echo ""
}

cleanup_lock() {
  local lock_dir="$1"
  rm -rf "$lock_dir"
}

main() {
  local job_file
  job_file="$(resolve_job_file "${1:-}" "${2:-}")"

  if [[ ! -f "$job_file" ]]; then
    echo "[scheduler] job file not found: $job_file" >&2
    exit 1
  fi

  scheduler_ensure_state_dirs

  # shellcheck disable=SC1090
  source "$job_file"

  local job_id="${JOB_ID:-}"
  local job_command="${JOB_COMMAND:-}"
  local job_workdir="${JOB_WORKDIR:-$SCHEDULER_BASE_DIR}"
  local job_enabled="${JOB_ENABLED:-1}"
  local job_timeout="${JOB_TIMEOUT_SECONDS:-0}"
  local retention_days="${JOB_LOG_RETENTION_DAYS:-14}"

  if [[ -z "$job_id" || -z "$job_command" ]]; then
    echo "[scheduler] JOB_ID and JOB_COMMAND are required in: $job_file" >&2
    exit 1
  fi
  scheduler_safe_job_id "$job_id"

  if [[ "$job_enabled" != "1" ]]; then
    echo "[scheduler] skipped disabled job: $job_id"
    exit 0
  fi

  mkdir -p "$SCHEDULER_LOG_DIR/$job_id"

  local lock_dir="/tmp/datowave-scheduler-${job_id}.lock"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    echo "[scheduler] skipped already running job: $job_id"
    scheduler_append_event "{\"ts\":\"$(scheduler_now_utc)\",\"job_id\":\"$job_id\",\"status\":\"skipped_locked\"}"
    exit 0
  fi
  trap "cleanup_lock '$lock_dir'" EXIT

  local start_ts start_epoch run_id stdout_log stderr_log end_ts end_epoch duration status
  start_ts="$(scheduler_now_utc)"
  start_epoch="$(scheduler_now_epoch)"
  run_id="$(date -u +%Y%m%dT%H%M%SZ)"
  stdout_log="$SCHEDULER_LOG_DIR/$job_id/${run_id}.out.log"
  stderr_log="$SCHEDULER_LOG_DIR/$job_id/${run_id}.err.log"

  scheduler_append_event "{\"ts\":\"$start_ts\",\"job_id\":\"$job_id\",\"status\":\"started\",\"run_id\":\"$run_id\",\"job_file\":\"$job_file\",\"workdir\":\"$job_workdir\"}"

  export_job_env "$job_file"

  status="success"
  if [[ "$job_timeout" =~ ^[1-9][0-9]*$ ]]; then
    local timeout_cmd
    timeout_cmd="$(resolve_timeout_cmd)"
    if [[ -z "$timeout_cmd" ]]; then
      echo "[scheduler] timeout requested but no timeout binary found (install coreutils for gtimeout)" >&2
      status="failed"
    elif ! (cd "$job_workdir" && "$timeout_cmd" "$job_timeout" bash -lc "$job_command") >"$stdout_log" 2>"$stderr_log"; then
      status="failed"
    fi
  else
    if ! (cd "$job_workdir" && bash -lc "$job_command") >"$stdout_log" 2>"$stderr_log"; then
      status="failed"
    fi
  fi

  end_ts="$(scheduler_now_utc)"
  end_epoch="$(scheduler_now_epoch)"
  duration="$((end_epoch - start_epoch))"

  scheduler_append_event "{\"ts\":\"$end_ts\",\"job_id\":\"$job_id\",\"status\":\"$status\",\"run_id\":\"$run_id\",\"duration_seconds\":$duration,\"stdout_log\":\"$stdout_log\",\"stderr_log\":\"$stderr_log\"}"

  # Keep per-job logs bounded.
  find "$SCHEDULER_LOG_DIR/$job_id" -type f -name '*.log' -mtime "+$retention_days" -delete || true

  if [[ "$status" != "success" ]]; then
    echo "[scheduler] job failed: $job_id (run_id=$run_id)" >&2
    exit 1
  fi

  echo "[scheduler] job ok: $job_id (run_id=$run_id, duration=${duration}s)"
}

main "$@"
