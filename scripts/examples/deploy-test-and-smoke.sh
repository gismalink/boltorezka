#!/usr/bin/env bash
# Purpose: Example template for test deploy followed by smoke verification.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../deploy/deploy-test-and-smoke.sh" "$@"
