#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ops/scheduler/common.sh
source "$SCRIPT_DIR/common.sh"

scheduler_ensure_state_dirs

printf '%-24s %-8s %-10s %-8s %s\n' "JOB_ID" "ENABLED" "SCHEDULE" "VALUE" "COMMAND"
printf '%s\n' "--------------------------------------------------------------------------------"

for job_file in "$SCHEDULER_JOBS_DIR"/*.env; do
  [[ -f "$job_file" ]] || continue
  # shellcheck disable=SC1090
  source "$job_file"
  printf '%-24s %-8s %-10s %-8s %s\n' \
    "${JOB_ID:-unknown}" \
    "${JOB_ENABLED:-1}" \
    "${JOB_SCHEDULE_KIND:-n/a}" \
    "${JOB_SCHEDULE_VALUE:-n/a}" \
    "${JOB_COMMAND:-<missing>}"
done
