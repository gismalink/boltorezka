#!/usr/bin/env bash
# Purpose: Minimal desktop foundation smoke for Electron shell.
set -euo pipefail

REPO_DIR="${1:-$PWD}"
DESKTOP_DIR="$REPO_DIR/apps/desktop-electron"

if [[ ! -d "$DESKTOP_DIR" ]]; then
  echo "[smoke:desktop] missing desktop dir: $DESKTOP_DIR" >&2
  exit 1
fi

echo "[smoke:desktop] build desktop foundation"
cd "$REPO_DIR"
npm run desktop:build

if [[ ! -d "$DESKTOP_DIR/dist" ]]; then
  echo "[smoke:desktop] missing build output dir: $DESKTOP_DIR/dist" >&2
  exit 1
fi

if ! find "$DESKTOP_DIR/dist" -maxdepth 2 \( -name "*.app" -o -name "*.exe" -o -name "*.AppImage" -o -name "electron" \) | head -n 1 | grep -q .; then
  echo "[smoke:desktop] no desktop artifact found in $DESKTOP_DIR/dist" >&2
  exit 1
fi

echo "[smoke:desktop] ok"
