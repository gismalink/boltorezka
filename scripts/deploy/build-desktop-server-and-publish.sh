#!/usr/bin/env bash
# Purpose: Build desktop artifacts directly on server and publish them into edge static downloads with latest manifest.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-ref> [repo-dir]" >&2
  echo "Example: $0 origin/feature/electron-desktop-foundation ~/srv/boltorezka" >&2
  exit 1
fi

GIT_REF="$1"
REPO_DIR="${2:-$PWD}"
DESKTOP_CHANNEL="${DESKTOP_CHANNEL:-test}"
EDGE_REPO_DIR="${EDGE_REPO_DIR:-$HOME/srv/edge}"
EDGE_DESKTOP_DIR_BASE="${EDGE_DESKTOP_DIR_BASE:-$EDGE_REPO_DIR/ingress/static/boltorezka/desktop}"
PUBLISH_DIR="$EDGE_DESKTOP_DIR_BASE/$DESKTOP_CHANNEL"
PUBLIC_BASE_URL="${DESKTOP_PUBLIC_BASE_URL:-}"

if [[ "$DESKTOP_CHANNEL" != "test" && "$DESKTOP_CHANNEL" != "prod" ]]; then
  echo "[desktop-build] DESKTOP_CHANNEL must be test|prod, got: $DESKTOP_CHANNEL" >&2
  exit 1
fi

cd "$REPO_DIR"

echo "[desktop-build] repo: $REPO_DIR"
echo "[desktop-build] ref: $GIT_REF"
echo "[desktop-build] channel: $DESKTOP_CHANNEL"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[desktop-build] repo must be clean before build" >&2
  exit 1
fi

git fetch --all --tags --prune
RESOLVED_SHA="$(git rev-parse "$GIT_REF")"
RESOLVED_SHA_SHORT="$(git rev-parse --short "$RESOLVED_SHA")"
BUILD_TS_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "[desktop-build] resolved sha: $RESOLVED_SHA"
git checkout --detach "$RESOLVED_SHA"

npm --prefix apps/web ci
npm --prefix apps/desktop-electron ci

if [[ "$DESKTOP_CHANNEL" == "prod" ]]; then
  APP_BUILD_SHA="$RESOLVED_SHA" npm --prefix apps/desktop-electron run dist:prod
else
  APP_BUILD_SHA="$RESOLVED_SHA" npm --prefix apps/desktop-electron run dist:test
fi

DIST_DIR="apps/desktop-electron/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "[desktop-build] dist dir is missing: $DIST_DIR" >&2
  exit 1
fi

TARGET_DIR="$PUBLISH_DIR/$RESOLVED_SHA"
mkdir -p "$TARGET_DIR"

# Keep only current build snapshot in target dir for idempotency.
find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$DIST_DIR/." "$TARGET_DIR/"

MANIFEST_TMP="$(mktemp)"
CHANNEL_MANIFEST="$PUBLISH_DIR/latest.json"
BUILD_MANIFEST="$TARGET_DIR/manifest.json"

node - <<'NODE' "$TARGET_DIR" "$DESKTOP_CHANNEL" "$RESOLVED_SHA" "$BUILD_TS_UTC" "$PUBLIC_BASE_URL" "$MANIFEST_TMP"
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const targetDir = process.argv[2];
const channel = process.argv[3];
const sha = process.argv[4];
const builtAt = process.argv[5];
const publicBaseUrl = String(process.argv[6] || "").trim().replace(/\/+$/, "");
const outputPath = process.argv[7];

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
if [[ -n "$PUBLIC_BASE_URL" ]]; then
  echo "[desktop-build] public base: $PUBLIC_BASE_URL"
fi

mkdir -p .deploy
cat > .deploy/last-desktop-build.env <<EOF
DESKTOP_BUILD_CHANNEL="$DESKTOP_CHANNEL"
DESKTOP_BUILD_REF="$GIT_REF"
DESKTOP_BUILD_SHA="$RESOLVED_SHA"
DESKTOP_BUILD_TIMESTAMP_UTC="$BUILD_TS_UTC"
DESKTOP_BUILD_TARGET_DIR="$TARGET_DIR"
DESKTOP_BUILD_MANIFEST="$CHANNEL_MANIFEST"
EOF

echo "[desktop-build] marker updated: .deploy/last-desktop-build.env"
