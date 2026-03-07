#!/usr/bin/env bash
# Purpose: install and start boltorezka log-cleanup launchd agent on macOS server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLIST_SRC="$REPO_DIR/infra/launchd/com.boltorezka.log-cleanup.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.boltorezka.log-cleanup.plist"
LABEL="com.boltorezka.log-cleanup"

if [[ ! -f "$PLIST_SRC" ]]; then
  echo "[log-cleanup-install] missing plist: $PLIST_SRC" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "[log-cleanup-install] installed and started: $LABEL"
launchctl print "gui/$(id -u)/$LABEL" | sed -n '1,40p'
