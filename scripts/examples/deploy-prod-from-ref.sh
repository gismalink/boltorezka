#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-ref> [repo-dir]" >&2
  echo "Example: $0 origin/main ~/boltorezka" >&2
  exit 1
fi

GIT_REF="$1"
REPO_DIR="${2:-$HOME/boltorezka}"
COMPOSE_FILE="infra/docker-compose.host.yml"
ENV_FILE="infra/.env.host"

cd "$REPO_DIR"

echo "[deploy-prod] repo: $REPO_DIR"
echo "[deploy-prod] fetch ref: $GIT_REF"
git fetch --all --tags --prune

RESOLVED_SHA="$(git rev-parse "$GIT_REF")"
echo "[deploy-prod] resolved sha: $RESOLVED_SHA"

git checkout --detach "$RESOLVED_SHA"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[deploy-prod] missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-prod] missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "[deploy-prod] recreate prod services"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build boltorezka-api-prod

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate boltorezka-api-prod

echo "[deploy-prod] wait api health"
for i in {1..180}; do
  if curl -fsS https://boltorezka/health >/dev/null; then
    echo "[deploy-prod] api health ok"
    break
  fi

  if [[ "$i" -eq 180 ]]; then
    echo "[deploy-prod] api health check failed" >&2
    exit 1
  fi

  sleep 2
done

MARKER_DIR=".deploy"
MARKER_FILE="$MARKER_DIR/last-deploy-prod.env"
HISTORY_FILE="$MARKER_DIR/deploy-history.log"
TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$MARKER_DIR"
cat >"$MARKER_FILE" <<EOF
DEPLOY_ENV="prod"
DEPLOY_REF="$GIT_REF"
DEPLOY_SHA="$RESOLVED_SHA"
DEPLOY_TIMESTAMP_UTC="$TIMESTAMP_UTC"
EOF
printf '%s\tenv=prod\tsha=%s\tref=%s\n' "$TIMESTAMP_UTC" "$RESOLVED_SHA" "$GIT_REF" >>"$HISTORY_FILE"

echo "[deploy-prod] marker updated: $MARKER_FILE"
echo "[deploy-prod] prod deploy complete for $RESOLVED_SHA"
