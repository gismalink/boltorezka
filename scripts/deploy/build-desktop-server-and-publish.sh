#!/usr/bin/env bash
# Purpose: Build desktop artifacts directly on server and publish them into edge static downloads with latest manifest.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-ref> [repo-dir]" >&2
  echo "Example: $0 origin/feature/electron-desktop-foundation ~/srv/datowave" >&2
  exit 1
fi

GIT_REF="$1"
REPO_DIR="${2:-$PWD}"
DESKTOP_CHANNEL="${DESKTOP_CHANNEL:-test}"
DESKTOP_SIGNING_MODE="${DESKTOP_SIGNING_MODE:-auto}"
EDGE_REPO_DIR="${EDGE_REPO_DIR:-$HOME/srv/edge}"
EDGE_DESKTOP_DIR_BASE="${EDGE_DESKTOP_DIR_BASE:-$EDGE_REPO_DIR/ingress/static/datowave}"
# Caddy serves test/prod from /srv/static/datowave/<env>, so desktop artifacts must live under that root.
PUBLISH_DIR="$EDGE_DESKTOP_DIR_BASE/$DESKTOP_CHANNEL/desktop/$DESKTOP_CHANNEL"
PUBLIC_BASE_URL="${DESKTOP_PUBLIC_BASE_URL:-}"

if [[ "$DESKTOP_CHANNEL" != "test" && "$DESKTOP_CHANNEL" != "prod" ]]; then
  echo "[desktop-build] DESKTOP_CHANNEL must be test|prod, got: $DESKTOP_CHANNEL" >&2
  exit 1
fi

if [[ "$DESKTOP_SIGNING_MODE" != "auto" && "$DESKTOP_SIGNING_MODE" != "unsigned" && "$DESKTOP_SIGNING_MODE" != "self-signed" ]]; then
  echo "[desktop-build] DESKTOP_SIGNING_MODE must be auto|unsigned|self-signed, got: $DESKTOP_SIGNING_MODE" >&2
  exit 1
fi

if [[ "$DESKTOP_CHANNEL" == "prod" && "$DESKTOP_SIGNING_MODE" != "auto" ]]; then
  echo "[desktop-build] prod supports only DESKTOP_SIGNING_MODE=auto" >&2
  exit 1
fi

if [[ "$DESKTOP_SIGNING_MODE" == "self-signed" && "$DESKTOP_CHANNEL" != "test" ]]; then
  echo "[desktop-build] self-signed mode is allowed only for test channel" >&2
  exit 1
fi

cd "$REPO_DIR"

bash ./scripts/ops/require-node-version.sh 22.12.0

echo "[desktop-build] repo: $REPO_DIR"
echo "[desktop-build] ref: $GIT_REF"
echo "[desktop-build] channel: $DESKTOP_CHANNEL"
echo "[desktop-build] signing mode: $DESKTOP_SIGNING_MODE"

if [[ "$DESKTOP_SIGNING_MODE" == "unsigned" ]]; then
  # Deterministic unsigned test build: disable auto-discovery and clear explicit signing secrets.
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  unset CSC_LINK CSC_KEY_PASSWORD
  unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  unset WIN_CSC_LINK WIN_CSC_KEY_PASSWORD
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[desktop-build] repo must be clean before build" >&2
  exit 1
fi

git fetch --all --tags --prune
RESOLVED_SHA="$(git rev-parse "$GIT_REF")"
RESOLVED_SHA_SHORT="$(git rev-parse --short "$RESOLVED_SHA")"
BUILD_TS_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BASE_APP_VERSION="$(node -p "require('./apps/desktop-electron/package.json').version")"

if [[ -z "$BASE_APP_VERSION" ]]; then
  echo "[desktop-build] desktop package version is empty" >&2
  exit 1
fi

if [[ "$DESKTOP_CHANNEL" == "test" ]]; then
  if [[ -n "${DESKTOP_BUILD_VERSION:-}" ]]; then
    APP_VERSION="$DESKTOP_BUILD_VERSION"
  else
    VERSION_TZ="Europe/Moscow"
    VERSION_DATE_TAG="$(TZ="$VERSION_TZ" date +%Y%m%d)"
    VERSION_TIME_TAG="$(TZ="$VERSION_TZ" date +%H%M)"
    APP_VERSION="${BASE_APP_VERSION}-test.${VERSION_DATE_TAG}.${VERSION_TIME_TAG}"
  fi
else
  APP_VERSION="$BASE_APP_VERSION"
fi

echo "[desktop-build] resolved sha: $RESOLVED_SHA"
echo "[desktop-build] app version: $APP_VERSION (base: $BASE_APP_VERSION)"
git checkout --detach "$RESOLVED_SHA"

npm --prefix apps/web ci
if [[ "$(uname -s)" == "Darwin" ]]; then
  npm --prefix apps/desktop-electron ci
else
  npm --prefix apps/desktop-electron ci --omit=optional
fi

# Avoid stale artifacts from previous runs affecting manifest/feed selection.
rm -rf apps/desktop-electron/dist

if [[ "$DESKTOP_CHANNEL" == "prod" ]]; then
  APP_BUILD_SHA="$RESOLVED_SHA" APP_VERSION="$APP_VERSION" VITE_APP_PUBLIC_ORIGIN="$PUBLIC_BASE_URL" npm --prefix apps/desktop-electron run dist:prod
else
  APP_BUILD_SHA="$RESOLVED_SHA" APP_VERSION="$APP_VERSION" VITE_APP_PUBLIC_ORIGIN="$PUBLIC_BASE_URL" npm --prefix apps/desktop-electron run dist:test
fi

DIST_DIR="apps/desktop-electron/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "[desktop-build] dist dir is missing: $DIST_DIR" >&2
  exit 1
fi

TARGET_DIR="$PUBLISH_DIR/$RESOLVED_SHA"
UPDATER_MAC_DIR="$PUBLISH_DIR/mac"
mkdir -p "$TARGET_DIR"

# Keep only current build snapshot in target dir for idempotency.
find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$DIST_DIR/." "$TARGET_DIR/"

# Build electron-updater generic feed for mac channel: /desktop/<channel>/mac/latest-mac.yml
mkdir -p "$UPDATER_MAC_DIR"
find "$UPDATER_MAC_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

MAC_ZIP_NAME="$(find "$TARGET_DIR" -maxdepth 1 -type f -name '*-mac-arm*.zip' -exec basename {} \; | head -n 1)"
if [[ -z "$MAC_ZIP_NAME" ]]; then
  MAC_ZIP_NAME="$(find "$TARGET_DIR" -maxdepth 1 -type f -name '*-mac.zip' -exec basename {} \; | head -n 1)"
fi
if [[ -z "$MAC_ZIP_NAME" ]]; then
  MAC_ZIP_NAME="$(find "$TARGET_DIR" -maxdepth 1 -type f -name '*mac*.zip' -exec basename {} \; | head -n 1)"
fi
if [[ -z "$MAC_ZIP_NAME" ]]; then
  echo "[desktop-build] missing mac zip artifact in $TARGET_DIR" >&2
  exit 1
fi

cp "$TARGET_DIR/$MAC_ZIP_NAME" "$UPDATER_MAC_DIR/"
if [[ -f "$TARGET_DIR/$MAC_ZIP_NAME.blockmap" ]]; then
  cp "$TARGET_DIR/$MAC_ZIP_NAME.blockmap" "$UPDATER_MAC_DIR/"
fi

APP_UPDATE_FEED_BASE="$PUBLIC_BASE_URL"
if [[ -z "$APP_UPDATE_FEED_BASE" ]]; then
  if [[ "$DESKTOP_CHANNEL" == "test" ]]; then
    APP_UPDATE_FEED_BASE="https://test.datowave.com"
  else
    APP_UPDATE_FEED_BASE="https://datowave.com"
  fi
fi
APP_UPDATE_FEED_BASE="${APP_UPDATE_FEED_BASE%/}/desktop/$DESKTOP_CHANNEL/mac"

APP_UPDATE_FILE_PATH="$(find "$TARGET_DIR" -type f -path '*/Datowave.app/Contents/Resources/app-update.yml' | head -n 1)"
if [[ -z "$APP_UPDATE_FILE_PATH" ]]; then
  APP_UPDATE_DIR="$(find "$TARGET_DIR" -type d -path '*/Datowave.app/Contents/Resources' | head -n 1)"
  if [[ -n "$APP_UPDATE_DIR" ]]; then
    APP_UPDATE_FILE_PATH="$APP_UPDATE_DIR/app-update.yml"
  fi
fi

if [[ -n "$APP_UPDATE_FILE_PATH" ]]; then
  cat > "$APP_UPDATE_FILE_PATH" <<EOF
provider: generic
url: $APP_UPDATE_FEED_BASE
channel: latest
EOF
else
  echo "[desktop-build] warning: failed to locate app resources path for app-update.yml" >&2
fi

MAC_ZIP_SIZE="$(stat -f %z "$UPDATER_MAC_DIR/$MAC_ZIP_NAME")"
MAC_ZIP_SHA512="$(shasum -a 512 "$UPDATER_MAC_DIR/$MAC_ZIP_NAME" | awk '{print $1}' | xxd -r -p | base64)"

cat > "$UPDATER_MAC_DIR/latest-mac.yml" <<EOF
version: $APP_VERSION
files:
  - url: $MAC_ZIP_NAME
    sha512: $MAC_ZIP_SHA512
    size: $MAC_ZIP_SIZE
path: $MAC_ZIP_NAME
sha512: $MAC_ZIP_SHA512
releaseDate: '$BUILD_TS_UTC'
EOF

MANIFEST_TMP="$(mktemp)"
CHANNEL_MANIFEST="$PUBLISH_DIR/latest.json"
BUILD_MANIFEST="$TARGET_DIR/manifest.json"

node - <<'NODE' "$TARGET_DIR" "$DESKTOP_CHANNEL" "$RESOLVED_SHA" "$BUILD_TS_UTC" "$PUBLIC_BASE_URL" "$MANIFEST_TMP" "$APP_VERSION"
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const targetDir = process.argv[2];
const channel = process.argv[3];
const sha = process.argv[4];
const builtAt = process.argv[5];
const publicBaseUrl = String(process.argv[6] || "").trim().replace(/\/+$/, "");
const outputPath = process.argv[7];
const appVersion = String(process.argv[8] || "").trim();

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

const files = walk(targetDir)
  .filter((abs) => !abs.endsWith("manifest.json"))
  .map((abs) => {
    const data = fs.readFileSync(abs);
    const rel = path.relative(targetDir, abs).replace(/\\/g, "/");
    const size = fs.statSync(abs).size;
    const sha256 = crypto.createHash("sha256").update(data).digest("hex");
    const urlPath = `/desktop/${channel}/${sha}/${rel}`;
    const url = publicBaseUrl ? `${publicBaseUrl}${urlPath}` : "";
    return {
      name: path.basename(abs),
      relativePath: rel,
      size,
      sha256,
      urlPath,
      url
    };
  })
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const payload = {
  channel,
  sha,
  appVersion,
  builtAt,
  totalFiles: files.length,
  files
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
NODE

cp "$MANIFEST_TMP" "$BUILD_MANIFEST"
cp "$MANIFEST_TMP" "$CHANNEL_MANIFEST"
rm -f "$MANIFEST_TMP"

echo "[desktop-build] published: $TARGET_DIR"
echo "[desktop-build] latest manifest: $CHANNEL_MANIFEST"
echo "[desktop-build] mac updater feed: $UPDATER_MAC_DIR/latest-mac.yml"
if [[ -n "$PUBLIC_BASE_URL" ]]; then
  echo "[desktop-build] public base: $PUBLIC_BASE_URL"
fi

mkdir -p .deploy
cat > .deploy/last-desktop-build.env <<EOF
DESKTOP_BUILD_CHANNEL="$DESKTOP_CHANNEL"
DESKTOP_BUILD_REF="$GIT_REF"
DESKTOP_BUILD_SHA="$RESOLVED_SHA"
DESKTOP_BUILD_TIMESTAMP_UTC="$BUILD_TS_UTC"
DESKTOP_BUILD_APP_VERSION="$APP_VERSION"
DESKTOP_BUILD_TARGET_DIR="$TARGET_DIR"
DESKTOP_BUILD_MANIFEST="$CHANNEL_MANIFEST"
DESKTOP_BUILD_UPDATER_MAC_FEED="$UPDATER_MAC_DIR/latest-mac.yml"
EOF

echo "[desktop-build] marker updated: .deploy/last-desktop-build.env"
