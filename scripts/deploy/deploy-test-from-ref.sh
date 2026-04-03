#!/usr/bin/env bash
# Purpose: Deploy test contour from a specific git ref and verify API health.
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
HEALTHCHECK_URL="${TEST_HEALTHCHECK_URL:-https://test.datowave.com/health}"
FULL_RECREATE="${FULL_RECREATE:-0}"
DEPLOY_FORCE_RECREATE_API="${DEPLOY_FORCE_RECREATE_API:-0}"
DEPLOY_RECREATE_TURN="${DEPLOY_RECREATE_TURN:-0}"
DEPLOY_MINIO_INIT_FAST="${DEPLOY_MINIO_INIT_FAST:-0}"
DEPLOY_SMART_SKIP_BUILD="${DEPLOY_SMART_SKIP_BUILD:-1}"
DEPLOY_FORCE_BUILD="${DEPLOY_FORCE_BUILD:-0}"
EDGE_REPO_DIR="${EDGE_REPO_DIR:-$HOME/srv/edge}"
EDGE_STATIC_DIR_TEST="${EDGE_STATIC_DIR_TEST:-$EDGE_REPO_DIR/ingress/static/boltorezka/test}"

read_env_value() {
  local key="$1"
  local file="$2"

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  local raw
  raw="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  if [[ -z "$raw" ]]; then
    return 0
  fi

  raw="${raw#*=}"
  raw="${raw%%[[:space:]]#*}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  echo "$raw"
}

image_exists() {
  local image_name="$1"
  docker image inspect "$image_name" >/dev/null 2>&1
}

has_build_relevant_changes() {
  local from_sha="$1"
  local to_sha="$2"

  if [[ -z "$from_sha" || -z "$to_sha" ]]; then
    return 0
  fi

  if [[ "$from_sha" == "$to_sha" ]]; then
    return 1
  fi

  local changed
  changed="$(git diff --name-only "$from_sha" "$to_sha" -- \
    apps/api \
    apps/web \
    infra/docker-compose.host.yml \
    package.json \
    package-lock.json \
    Dockerfile \
    2>/dev/null || true)"

  [[ -n "$changed" ]]
}

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
RESOLVED_COMMIT_DATE="$(git show -s --date=format:'%y.%m.%d.%H.%M' --format=%cd "$RESOLVED_SHA")"
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

TEST_CHAT_STORAGE_PROVIDER_VALUE="$(read_env_value "TEST_CHAT_STORAGE_PROVIDER" "$ENV_FILE")"
if [[ -z "$TEST_CHAT_STORAGE_PROVIDER_VALUE" ]]; then
  TEST_CHAT_STORAGE_PROVIDER_VALUE="localfs"
fi

echo "[deploy-test] deploy mode: api-only + caddy-static-sync (set FULL_RECREATE=1 for full dependency recreate)"
echo "[deploy-test] fast-path flags: force_api_recreate=$DEPLOY_FORCE_RECREATE_API recreate_turn=$DEPLOY_RECREATE_TURN minio_init_fast=$DEPLOY_MINIO_INIT_FAST"
echo "[deploy-test] build flags: smart_skip=$DEPLOY_SMART_SKIP_BUILD force_build=$DEPLOY_FORCE_BUILD"
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
TEST_VITE_APP_VERSION=$RESOLVED_SHA
TEST_VITE_APP_BUILD_DATE=$RESOLVED_COMMIT_DATE
TEST_APP_BUILD_SHA=$RESOLVED_SHA
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

SHOULD_BUILD_API=1
BUILD_DECISION_REASON="default"

if [[ "$DEPLOY_FORCE_BUILD" == "1" ]]; then
  SHOULD_BUILD_API=1
  BUILD_DECISION_REASON="forced"
elif [[ "$DEPLOY_SMART_SKIP_BUILD" == "1" ]]; then
  if ! image_exists "boltorezka-api:test"; then
    SHOULD_BUILD_API=1
    BUILD_DECISION_REASON="image-missing"
  elif has_build_relevant_changes "$PREV_DEPLOY_SHA" "$RESOLVED_SHA"; then
    SHOULD_BUILD_API=1
    BUILD_DECISION_REASON="relevant-diff"
  else
    SHOULD_BUILD_API=0
    BUILD_DECISION_REASON="no-relevant-diff"
  fi
fi

if [[ "$SHOULD_BUILD_API" == "1" ]]; then
  echo "[deploy-test] build boltorezka-api:test (${BUILD_DECISION_REASON})"
  DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" build boltorezka-api-test
else
  echo "[deploy-test] skip build boltorezka-api:test (${BUILD_DECISION_REASON})"
fi

if [[ -d "$EDGE_REPO_DIR/ingress" ]]; then
  echo "[deploy-test] sync static bundle -> $EDGE_STATIC_DIR_TEST"
  mkdir -p "$EDGE_STATIC_DIR_TEST"
  touch "$EDGE_STATIC_DIR_TEST/.gitkeep"

  WEB_IMAGE_CID="$(docker create boltorezka-api:test)"
  docker cp "$WEB_IMAGE_CID:/app/public/." "$TMP_WEB_DIST_DIR/"
  docker rm "$WEB_IMAGE_CID" >/dev/null
  WEB_IMAGE_CID=""

  # Keep desktop distribution artifacts under static root between API/web deploys.
  find "$EDGE_STATIC_DIR_TEST" -mindepth 1 -maxdepth 1 ! -name '.gitkeep' ! -name 'desktop' -exec rm -rf {} +
  cp -R "$TMP_WEB_DIST_DIR/." "$EDGE_STATIC_DIR_TEST/"
else
  echo "[deploy-test] warning: edge repo not found at $EDGE_REPO_DIR; static sync skipped"
fi

if [[ "$FULL_RECREATE" == "1" ]]; then
  echo "[deploy-test] full recreate enabled"
  if [[ "$TEST_CHAT_STORAGE_PROVIDER_VALUE" == "minio" ]]; then
    echo "[deploy-test] storage provider=minio -> ensure minio-test profile is up"
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" --profile minio-test up -d boltorezka-minio-test boltorezka-minio-test-init
  fi
  DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --force-recreate boltorezka-api-test
else
  # Keep api-only fast path, but make sure core deps (including TURN) are up.
  DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --no-recreate boltorezka-db-test boltorezka-redis-test
  if [[ "$DEPLOY_RECREATE_TURN" == "1" ]]; then
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" rm -f -s boltorezka-turn >/dev/null 2>&1 || true
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d boltorezka-turn
  else
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --no-recreate boltorezka-turn
  fi
  if [[ "$TEST_CHAT_STORAGE_PROVIDER_VALUE" == "minio" ]]; then
    echo "[deploy-test] storage provider=minio -> ensure minio-test profile is up"
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" --profile minio-test up -d boltorezka-minio-test
    if [[ "$DEPLOY_MINIO_INIT_FAST" == "1" ]]; then
      DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" --profile minio-test up -d boltorezka-minio-test-init
    fi
  fi
  if [[ "$DEPLOY_FORCE_RECREATE_API" == "1" ]]; then
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --no-deps --force-recreate boltorezka-api-test
  else
    DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$TMP_DEPLOY_ENV" up -d --no-deps boltorezka-api-test
  fi
fi

echo "[deploy-test] wait api health"
for i in {1..180}; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
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
