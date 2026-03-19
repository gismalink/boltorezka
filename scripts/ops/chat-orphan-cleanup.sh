#!/usr/bin/env bash
# Purpose: Run periodic chat object-storage orphan cleanup via admin API endpoint.
set -euo pipefail

CHAT_ORPHAN_BASE_URL="${CHAT_ORPHAN_BASE_URL:-https://test.boltorezka.gismalink.art}"
CHAT_ORPHAN_ENDPOINT="${CHAT_ORPHAN_ENDPOINT:-/v1/admin/chat/uploads/orphan-cleanup}"
CHAT_ORPHAN_BEARER_TOKEN="${CHAT_ORPHAN_BEARER_TOKEN:-${TEST_SMOKE_TEST_BEARER_TOKEN:-}}"
CHAT_ORPHAN_BEARER_TOKEN_FILE="${CHAT_ORPHAN_BEARER_TOKEN_FILE:-.deploy/smoke-auth-livekit-gate.env}"
CHAT_ORPHAN_BEARER_TOKEN_FILE_KEY="${CHAT_ORPHAN_BEARER_TOKEN_FILE_KEY:-SMOKE_TEST_BEARER_TOKEN}"

CHAT_ORPHAN_PREFIX="${CHAT_ORPHAN_PREFIX:-chat-attachments/}"
CHAT_ORPHAN_OLDER_THAN_SEC="${CHAT_ORPHAN_OLDER_THAN_SEC:-86400}"
CHAT_ORPHAN_MAX_SCAN="${CHAT_ORPHAN_MAX_SCAN:-5000}"
CHAT_ORPHAN_MAX_DELETE="${CHAT_ORPHAN_MAX_DELETE:-500}"
CHAT_ORPHAN_DRY_RUN="${CHAT_ORPHAN_DRY_RUN:-0}"
CHAT_ORPHAN_STRICT="${CHAT_ORPHAN_STRICT:-1}"

if [[ -z "$CHAT_ORPHAN_BEARER_TOKEN" && -n "$CHAT_ORPHAN_BEARER_TOKEN_FILE" && -f "$CHAT_ORPHAN_BEARER_TOKEN_FILE" ]]; then
  token_line="$(grep -E "^${CHAT_ORPHAN_BEARER_TOKEN_FILE_KEY}=" "$CHAT_ORPHAN_BEARER_TOKEN_FILE" | tail -n 1 || true)"
  if [[ -n "$token_line" ]]; then
    CHAT_ORPHAN_BEARER_TOKEN="${token_line#*=}"
  fi
fi

if [[ -z "$CHAT_ORPHAN_BEARER_TOKEN" ]]; then
  echo "[chat-orphan-cleanup] missing CHAT_ORPHAN_BEARER_TOKEN (or TEST_SMOKE_TEST_BEARER_TOKEN)" >&2
  echo "[chat-orphan-cleanup] set token or provide token file: $CHAT_ORPHAN_BEARER_TOKEN_FILE" >&2
  exit 1
fi

if [[ ! "$CHAT_ORPHAN_OLDER_THAN_SEC" =~ ^[0-9]+$ ]]; then
  echo "[chat-orphan-cleanup] CHAT_ORPHAN_OLDER_THAN_SEC must be integer" >&2
  exit 1
fi

if [[ ! "$CHAT_ORPHAN_MAX_SCAN" =~ ^[1-9][0-9]*$ ]]; then
  echo "[chat-orphan-cleanup] CHAT_ORPHAN_MAX_SCAN must be positive integer" >&2
  exit 1
fi

if [[ ! "$CHAT_ORPHAN_MAX_DELETE" =~ ^[1-9][0-9]*$ ]]; then
  echo "[chat-orphan-cleanup] CHAT_ORPHAN_MAX_DELETE must be positive integer" >&2
  exit 1
fi

if [[ "$CHAT_ORPHAN_DRY_RUN" != "0" && "$CHAT_ORPHAN_DRY_RUN" != "1" ]]; then
  echo "[chat-orphan-cleanup] CHAT_ORPHAN_DRY_RUN must be 0 or 1" >&2
  exit 1
fi

if [[ "$CHAT_ORPHAN_STRICT" != "0" && "$CHAT_ORPHAN_STRICT" != "1" ]]; then
  echo "[chat-orphan-cleanup] CHAT_ORPHAN_STRICT must be 0 or 1" >&2
  exit 1
fi

tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

base_url="${CHAT_ORPHAN_BASE_URL%/}"
endpoint="/${CHAT_ORPHAN_ENDPOINT#/}"
request_url="${base_url}${endpoint}"

request_body="$(cat <<EOF
{"dryRun":$([[ "$CHAT_ORPHAN_DRY_RUN" == "1" ]] && echo true || echo false),"prefix":"$CHAT_ORPHAN_PREFIX","olderThanSec":$CHAT_ORPHAN_OLDER_THAN_SEC,"maxScan":$CHAT_ORPHAN_MAX_SCAN,"maxDelete":$CHAT_ORPHAN_MAX_DELETE}
EOF
)"

http_code="$(curl -sS -o "$tmp_body" -w "%{http_code}" \
  -H "Authorization: Bearer $CHAT_ORPHAN_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$request_url" \
  --data "$request_body")"

if [[ "$http_code" != "200" ]]; then
  echo "[chat-orphan-cleanup] HTTP $http_code from $request_url" >&2
  sed -n '1,120p' "$tmp_body" >&2 || true
  exit 1
fi

node - "$tmp_body" "$CHAT_ORPHAN_STRICT" <<'NODE'
const fs = require("fs");

const bodyPath = process.argv[2];
const strict = String(process.argv[3] || "1") === "1";

let payload;
try {
  payload = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
} catch (error) {
  console.error("[chat-orphan-cleanup] failed to parse response JSON", error && error.message ? error.message : error);
  process.exit(1);
}

const toInt = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

const dryRun = Boolean(payload.dryRun);
const scannedCount = toInt(payload.scannedCount);
const eligibleCount = toInt(payload.eligibleCount);
const orphanCount = toInt(payload.orphanCount);
const deletedCount = toInt(payload.deletedCount);
const failedDeleteCount = toInt(payload.failedDeleteCount);
const provider = String(payload.provider || "unknown");

console.log(
  `[chat-orphan-cleanup] provider=${provider} dryRun=${dryRun ? "1" : "0"} ` +
  `scanned=${scannedCount} eligible=${eligibleCount} orphan=${orphanCount} ` +
  `deleted=${deletedCount} failed=${failedDeleteCount}`
);

if (!dryRun && strict && failedDeleteCount > 0) {
  console.error(`[chat-orphan-cleanup] strict mode failed: failedDeleteCount=${failedDeleteCount}`);
  process.exit(2);
}
NODE
