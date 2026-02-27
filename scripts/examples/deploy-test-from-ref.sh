#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-ref> [repo-dir]"
  echo "Example: $0 origin/feature/room-chat ~/boltorezka"
  exit 1
fi

GIT_REF="$1"
REPO_DIR="${2:-$HOME/boltorezka}"
COMPOSE_FILE="infra/docker-compose.host.yml"
ENV_FILE="infra/.env.host"

if [[ "$GIT_REF" =~ ^(origin/main|main|origin/master|master)$ ]] && [[ "${ALLOW_TEST_FROM_MAIN:-0}" != "1" ]]; then
  echo "[deploy-test] blocked by policy: test deploy should use feature branch ref"
  echo "[deploy-test] set ALLOW_TEST_FROM_MAIN=1 only for explicit exception"
  exit 1
fi

cd "$REPO_DIR"

echo "[deploy-test] repo: $REPO_DIR"
echo "[deploy-test] fetch ref: $GIT_REF"
git fetch --all --tags --prune

RESOLVED_SHA="$(git rev-parse "$GIT_REF")"
echo "[deploy-test] resolved sha: $RESOLVED_SHA"

git checkout --detach "$RESOLVED_SHA"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[deploy-test] missing compose file: $COMPOSE_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-test] missing env file: $ENV_FILE"
  exit 1
fi

echo "[deploy-test] recreate test services"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build boltorezka-api-test

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate boltorezka-api-test

echo "[deploy-test] wait api health"
for i in {1..180}; do
  if curl -fsS https://test.boltorezka/health >/dev/null; then
    echo "[deploy-test] api health ok"
    break
  fi

  if [[ "$i" -eq 180 ]]; then
    echo "[deploy-test] api health check failed"
    exit 1
  fi

  sleep 2
done

MARKER_DIR=".deploy"
MARKER_FILE="$MARKER_DIR/last-deploy-test.env"
HISTORY_FILE="$MARKER_DIR/deploy-history.log"
TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$MARKER_DIR"
cat >"$MARKER_FILE" <<EOF
DEPLOY_ENV="test"
DEPLOY_REF="$GIT_REF"
DEPLOY_SHA="$RESOLVED_SHA"
DEPLOY_TIMESTAMP_UTC="$TIMESTAMP_UTC"
EOF
printf '%s\tenv=test\tsha=%s\tref=%s\n' "$TIMESTAMP_UTC" "$RESOLVED_SHA" "$GIT_REF" >>"$HISTORY_FILE"

echo "[deploy-test] marker updated: $MARKER_FILE"
echo "[deploy-test] test deploy complete for $RESOLVED_SHA"
