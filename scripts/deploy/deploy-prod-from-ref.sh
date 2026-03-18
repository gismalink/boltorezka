#!/usr/bin/env bash
# Purpose: Deploy production services from a specific git ref with rollout safety checks.
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
HEALTHCHECK_URL="${PROD_HEALTHCHECK_URL:-https://boltorezka.gismalink.art/health}"
FULL_RECREATE="${FULL_RECREATE:-0}"
ALLOW_PROD_RELAY_ONLY="${ALLOW_PROD_RELAY_ONLY:-0}"
EDGE_REPO_DIR="${EDGE_REPO_DIR:-$HOME/srv/edge}"
EDGE_STATIC_DIR_PROD="${EDGE_STATIC_DIR_PROD:-$EDGE_REPO_DIR/ingress/static/boltorezka/prod}"

cd "$REPO_DIR"

echo "[deploy-prod] repo: $REPO_DIR"
echo "[deploy-prod] fetch ref: $GIT_REF"
git fetch --all --tags --prune

RESOLVED_SHA="$(git rev-parse "$GIT_REF")"
RESOLVED_COMMIT_DATE="$(git show -s --date=format:'%y.%m.%d.%H.%M' --format=%cd "$RESOLVED_SHA")"
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

PROD_ICE_POLICY_RAW="$(grep -E '^PROD_VITE_RTC_ICE_TRANSPORT_POLICY=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
PROD_ICE_POLICY="$(echo "$PROD_ICE_POLICY_RAW" | tr -d '[:space:]\"' | tr '[:upper:]' '[:lower:]')"

if [[ -z "$PROD_ICE_POLICY" ]]; then
  echo "[deploy-prod] warning: PROD_VITE_RTC_ICE_TRANSPORT_POLICY is not set in $ENV_FILE"
else
  echo "[deploy-prod] PROD_VITE_RTC_ICE_TRANSPORT_POLICY=$PROD_ICE_POLICY"
fi

# Safety gate: relay-only in production is blocked unless explicitly overridden.
if [[ "$PROD_ICE_POLICY" == "relay" && "$ALLOW_PROD_RELAY_ONLY" != "1" ]]; then
  echo "[deploy-prod] blocked: relay-only ICE policy in prod requires explicit override" >&2
  echo "[deploy-prod] to proceed intentionally, run with ALLOW_PROD_RELAY_ONLY=1" >&2
  exit 1
fi

echo "[deploy-prod] deploy mode: api-only + caddy-static-sync (set FULL_RECREATE=1 for full dependency recreate)"
TMP_DOCKER_CONFIG="$(mktemp -d)"
TMP_DEPLOY_ENV="$(mktemp)"
TMP_WEB_DIST_DIR="$(mktemp -d)"
WEB_IMAGE_CID=""
cleanup() {
  if [[ -n "$WEB_IMAGE_CID" ]]; then
    docker rm "$WEB_IMAGE_CID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DOCKER_CONFIG" "$TMP_DEPLOY_ENV" "$TMP_WEB_DIST_DIR"
}
trap cleanup EXIT

cat >"$TMP_DEPLOY_ENV" <<EOF
PROD_VITE_APP_VERSION=$RESOLVED_SHA
PROD_VITE_APP_BUILD_DATE=$RESOLVED_COMMIT_DATE
PROD_APP_BUILD_SHA=$RESOLVED_SHA
EOF

mkdir -p "$TMP_DOCKER_CONFIG/cli-plugins"
if [[ -d "$HOME/.docker/cli-plugins" ]]; then
  cp -R "$HOME/.docker/cli-plugins/." "$TMP_DOCKER_CONFIG/cli-plugins/"
fi
cat >"$TMP_DOCKER_CONFIG/config.json" <<'JSON'
{
  "auths": {
    "https://index.docker.io/v1/": {}
  },
  "credsStore": ""
}
JSON

DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" build boltorezka-api-prod

if [[ -d "$EDGE_REPO_DIR/ingress" ]]; then
  echo "[deploy-prod] sync static bundle -> $EDGE_STATIC_DIR_PROD"
  mkdir -p "$EDGE_STATIC_DIR_PROD"
  touch "$EDGE_STATIC_DIR_PROD/.gitkeep"

  WEB_IMAGE_CID="$(docker create boltorezka-api:prod)"
  docker cp "$WEB_IMAGE_CID:/app/public/." "$TMP_WEB_DIST_DIR/"
  docker rm "$WEB_IMAGE_CID" >/dev/null
  WEB_IMAGE_CID=""

  # Keep desktop distribution artifacts under static root between web/API deploys.
  find "$EDGE_STATIC_DIR_PROD" -mindepth 1 -maxdepth 1 ! -name '.gitkeep' ! -name 'desktop' -exec rm -rf {} +
  cp -R "$TMP_WEB_DIST_DIR/." "$EDGE_STATIC_DIR_PROD/"
else
  echo "[deploy-prod] warning: edge repo not found at $EDGE_REPO_DIR; static sync skipped"
fi

if [[ "$FULL_RECREATE" == "1" ]]; then
  echo "[deploy-prod] full recreate enabled"
  DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --force-recreate boltorezka-api-prod
else
  DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --no-deps --force-recreate boltorezka-api-prod
fi

echo "[deploy-prod] wait api health"
for i in {1..180}; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
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
