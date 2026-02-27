#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-ref> [repo-dir]" >&2
  echo "Example: $0 origin/feature/realtime-hardening ~/boltorezka" >&2
  exit 1
fi

GIT_REF="$1"
REPO_DIR="${2:-$HOME/boltorezka}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/deploy-test-from-ref.sh" "$GIT_REF" "$REPO_DIR"
"$SCRIPT_DIR/postdeploy-smoke-test.sh" "$REPO_DIR"

echo "[deploy-test-smoke] done"
