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
AUTO_ROLLBACK_ON_FAIL="${AUTO_ROLLBACK_ON_FAIL:-0}"
AUTO_ROLLBACK_SMOKE="${AUTO_ROLLBACK_SMOKE:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$REPO_DIR/.deploy"
LOCAL_RELEASE_LOG="$REPO_DIR/.deploy/release-log.tsv"
LAST_DEPLOY_FILE="$REPO_DIR/.deploy/last-deploy-test.env"

PREV_DEPLOY_SHA=""
if [[ -f "$LAST_DEPLOY_FILE" ]]; then
  set +u
  source "$LAST_DEPLOY_FILE"
  set -u
  PREV_DEPLOY_SHA="${DEPLOY_SHA:-}"
fi

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

SMOKE_SUMMARY_FILE="$REPO_DIR/.deploy/last-smoke-summary.env"
SMOKE_SUMMARY_TEXT=""
if [[ -f "$SMOKE_SUMMARY_FILE" ]]; then
  source "$SMOKE_SUMMARY_FILE"
fi

ROLLBACK_TRIGGERED=0
ROLLBACK_SMOKE_STATUS=""
ROLLBACK_OUTCOME_NOTE=""
if [[ "$SMOKE_STATUS" == "fail" && "$AUTO_ROLLBACK_ON_FAIL" == "1" && -n "$PREV_DEPLOY_SHA" ]]; then
  ROLLBACK_TRIGGERED=1
  set +e
  "$SCRIPT_DIR/deploy-test-from-ref.sh" "$PREV_DEPLOY_SHA" "$REPO_DIR"
  ROLLBACK_DEPLOY_EXIT=$?

  ROLLBACK_SMOKE_EXIT=0
  if [[ "$ROLLBACK_DEPLOY_EXIT" -eq 0 && "$AUTO_ROLLBACK_SMOKE" == "1" ]]; then
    "$SCRIPT_DIR/postdeploy-smoke-test.sh" "$REPO_DIR"
    ROLLBACK_SMOKE_EXIT=$?
  elif [[ "$ROLLBACK_DEPLOY_EXIT" -ne 0 ]]; then
    ROLLBACK_SMOKE_EXIT=$ROLLBACK_DEPLOY_EXIT
  fi
  set -e

  if [[ "$ROLLBACK_DEPLOY_EXIT" -eq 0 && "$ROLLBACK_SMOKE_EXIT" -eq 0 ]]; then
    ROLLBACK_SMOKE_STATUS="pass"
  else
    ROLLBACK_SMOKE_STATUS="fail"
  fi

  ROLLBACK_TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ROLLBACK_SHA="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo n/a)"
  ROLLBACK_NOTES="triggered_by=deploy:test:smoke-fail; target=$PREV_DEPLOY_SHA"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$ROLLBACK_TIMESTAMP_UTC" \
    "rollback" \
    "test" \
    "$ROLLBACK_SMOKE_STATUS" \
    "$PREV_DEPLOY_SHA" \
    "$ROLLBACK_SHA" \
    "$ROLLBACK_NOTES" >>"$LOCAL_RELEASE_LOG"

  if [[ -x "$EDGE_RELEASE_LOG_SCRIPT" ]]; then
    bash "$EDGE_RELEASE_LOG_SCRIPT" rollback test "$ROLLBACK_SMOKE_STATUS" "boltorezka rollback target=$PREV_DEPLOY_SHA; triggered_by=deploy:test:smoke-fail" || true
  fi

  if [[ "$AUTO_ROLLBACK_SMOKE" == "1" ]]; then
    ROLLBACK_OUTCOME_NOTE="rollback_policy=triggered target=$PREV_DEPLOY_SHA rollback_smoke=$ROLLBACK_SMOKE_STATUS"
  else
    ROLLBACK_OUTCOME_NOTE="rollback_policy=triggered target=$PREV_DEPLOY_SHA rollback_smoke=skipped"
  fi
fi

FINAL_NOTES="$DEPLOY_NOTES"
if [[ -n "${SMOKE_SUMMARY_TEXT:-}" ]]; then
  if [[ -n "$FINAL_NOTES" ]]; then
    FINAL_NOTES="$FINAL_NOTES; $SMOKE_SUMMARY_TEXT"
  else
    FINAL_NOTES="$SMOKE_SUMMARY_TEXT"
  fi
fi
if [[ "$ROLLBACK_TRIGGERED" == "1" && -n "$ROLLBACK_OUTCOME_NOTE" ]]; then
  if [[ -n "$FINAL_NOTES" ]]; then
    FINAL_NOTES="$FINAL_NOTES; $ROLLBACK_OUTCOME_NOTE"
  else
    FINAL_NOTES="$ROLLBACK_OUTCOME_NOTE"
  fi
fi

TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SHA="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo n/a)"
ESCAPED_NOTES="${FINAL_NOTES//$'\t'/ }"

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
  if [[ -n "$FINAL_NOTES" ]]; then
    EDGE_NOTES="$EDGE_NOTES; $FINAL_NOTES"
  fi
  bash "$EDGE_RELEASE_LOG_SCRIPT" rollout test "$SMOKE_STATUS" "$EDGE_NOTES" || true
fi

if [[ "$SMOKE_STATUS" == "fail" ]]; then
  echo "[deploy-test-smoke] failed (deploy_exit=$DEPLOY_EXIT smoke_exit=$SMOKE_EXIT)" >&2
  exit 1
fi

echo "[deploy-test-smoke] done"
