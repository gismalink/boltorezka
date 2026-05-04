#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: install-launchd-job.sh <job-id>" >&2
}

job_id="${1:-}"
if [[ -z "$job_id" ]]; then
  usage
  exit 1
fi

label="com.datowave.scheduler.${job_id}"
plist_path="$HOME/Library/LaunchAgents/${label}.plist"

mkdir -p "$HOME/Library/LaunchAgents"
"$SCRIPT_DIR/render-launchd-plist.sh" "$job_id" "$plist_path"

launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl enable "gui/$(id -u)/$label"
launchctl kickstart -k "gui/$(id -u)/$label"

echo "[scheduler] installed and started: $label"
launchctl print "gui/$(id -u)/$label" | sed -n '1,60p'
