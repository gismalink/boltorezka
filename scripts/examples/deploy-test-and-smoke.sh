#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-ref> [repo-dir]" >&2
  echo "Example: $0 origin/feature/realtime-hardening ~/boltorezka" >&2
  exit 1
fi

GIT_REF="$1"
REPO_DIR="${2:-$PWD}"
DEPLOY_NOTES="${DEPLOY_NOTES:-}"
EDGE_RELEASE_LOG_SCRIPT="${EDGE_RELEASE_LOG_SCRIPT:-$HOME/srv/edge/scripts/auth-cutover-release-log.sh}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$REPO_DIR/.deploy"
LOCAL_RELEASE_LOG="$REPO_DIR/.deploy/release-log.tsv"

if [[ ! -f "$LOCAL_RELEASE_LOG" ]]; then
  echo -e "timestamp_utc\taction\tenvironment\tsmoke\tgit_ref\tsha\tnotes" >"$LOCAL_RELEASE_LOG"
fi

set +e
"$SCRIPT_DIR/deploy-test-from-ref.sh" "$GIT_REF" "$REPO_DIR"
DEPLOY_EXIT=$?

SMOKE_EXIT=0
if [[ "$DEPLOY_EXIT" -eq 0 ]]; then
  "$SCRIPT_DIR/postdeploy-smoke-test.sh" "$REPO_DIR"
  SMOKE_EXIT=$?
else
  SMOKE_EXIT=$DEPLOY_EXIT
fi
set -e

if [[ "$DEPLOY_EXIT" -eq 0 && "$SMOKE_EXIT" -eq 0 ]]; then
  SMOKE_STATUS="pass"
else
  SMOKE_STATUS="fail"
fi

TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SHA="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo n/a)"
ESCAPED_NOTES="${DEPLOY_NOTES//$'\t'/ }"

printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$TIMESTAMP_UTC" \
  "rollout" \
  "test" \
  "$SMOKE_STATUS" \
  "$GIT_REF" \
  "$SHA" \
  "$ESCAPED_NOTES" >>"$LOCAL_RELEASE_LOG"

if [[ -x "$EDGE_RELEASE_LOG_SCRIPT" ]]; then
  EDGE_NOTES="boltorezka ref=$GIT_REF sha=$SHA"
  if [[ -n "$DEPLOY_NOTES" ]]; then
    EDGE_NOTES="$EDGE_NOTES; $DEPLOY_NOTES"
  fi
  bash "$EDGE_RELEASE_LOG_SCRIPT" rollout test "$SMOKE_STATUS" "$EDGE_NOTES" || true
fi

if [[ "$SMOKE_STATUS" == "fail" ]]; then
  echo "[deploy-test-smoke] failed (deploy_exit=$DEPLOY_EXIT smoke_exit=$SMOKE_EXIT)" >&2
  exit 1
fi

echo "[deploy-test-smoke] done"
