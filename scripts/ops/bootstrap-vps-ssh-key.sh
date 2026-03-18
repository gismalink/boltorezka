#!/usr/bin/env bash
# Purpose: interactive SSH key bootstrap for a new VPS host.
set -euo pipefail

SSH_HOST="${1:-46.149.71.86}"
SSH_USER="${2:-root}"
SSH_PORT="${SSH_PORT:-22}"
KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_ed25519.pub}"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "[bootstrap-vps-ssh-key] public key not found: $KEY_PATH" >&2
  echo "[bootstrap-vps-ssh-key] generate one with: ssh-keygen -t ed25519 -f \"${KEY_PATH%.pub}\"" >&2
  exit 1
fi

echo "[bootstrap-vps-ssh-key] target=${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
echo "[bootstrap-vps-ssh-key] key=$KEY_PATH"
echo "[bootstrap-vps-ssh-key] password prompt is expected for first bootstrap"

ssh-copy-id -i "$KEY_PATH" -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}"

echo "[bootstrap-vps-ssh-key] verifying key-based login"
ssh -o BatchMode=yes -o ConnectTimeout=10 -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "echo '[bootstrap-vps-ssh-key] key auth ok'; id -un"
