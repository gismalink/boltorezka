#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ops/scheduler/common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
  echo "Usage: render-launchd-plist.sh <job-id> [output-file]" >&2
}

job_id="${1:-}"
out_file="${2:-}"

if [[ -z "$job_id" ]]; then
  usage
  exit 1
fi

scheduler_safe_job_id "$job_id"
job_file="$(scheduler_job_file "$job_id")"

if [[ ! -f "$job_file" ]]; then
  echo "[scheduler] job file not found: $job_file" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$job_file"

schedule_kind="${JOB_SCHEDULE_KIND:-interval}"
schedule_value="${JOB_SCHEDULE_VALUE:-0}"
job_enabled="${JOB_ENABLED:-1}"
if [[ "$job_enabled" != "1" ]]; then
  echo "[scheduler] refusing to render disabled job: $job_id" >&2
  exit 1
fi

if [[ "$schedule_kind" != "interval" ]]; then
  echo "[scheduler] launchd renderer currently supports JOB_SCHEDULE_KIND=interval only" >&2
  exit 1
fi

if [[ ! "$schedule_value" =~ ^[1-9][0-9]*$ ]]; then
  echo "[scheduler] JOB_SCHEDULE_VALUE must be positive integer for interval jobs" >&2
  exit 1
fi

label="com.boltorezka.scheduler.${job_id}"
run_script="$SCHEDULER_BASE_DIR/scripts/ops/scheduler/run-job.sh"
out_log="${SCHEDULER_BASE_DIR}/.deploy/scheduler/logs/${job_id}/launchd.out.log"
err_log="${SCHEDULER_BASE_DIR}/.deploy/scheduler/logs/${job_id}/launchd.err.log"
working_dir="${JOB_WORKDIR:-$SCHEDULER_BASE_DIR}"

mkdir -p "$(dirname "$out_log")"

plist_content="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>
  <string>${label}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${run_script}</string>
    <string>${job_id}</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>BOLTOREZKA_BASE_DIR</key>
    <string>${SCHEDULER_BASE_DIR}</string>
  </dict>

  <key>StartInterval</key>
  <integer>${schedule_value}</integer>

  <key>WorkingDirectory</key>
  <string>${working_dir}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <false/>

  <key>StandardOutPath</key>
  <string>${out_log}</string>

  <key>StandardErrorPath</key>
  <string>${err_log}</string>
</dict>
</plist>
"

if [[ -n "$out_file" ]]; then
  printf '%s' "$plist_content" > "$out_file"
  echo "[scheduler] wrote plist: $out_file"
else
  printf '%s' "$plist_content"
fi
