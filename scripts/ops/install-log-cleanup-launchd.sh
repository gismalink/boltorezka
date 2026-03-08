#!/usr/bin/env bash
# Purpose: backward-compatible wrapper that installs scheduler-based log cleanup launchd job.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "$SCRIPT_DIR/scheduler/install-launchd-job.sh" cleanup-server-logs
