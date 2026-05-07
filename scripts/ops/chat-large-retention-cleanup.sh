#!/usr/bin/env bash
# Purpose: Run periodic chat large-file retention cleanup via admin API endpoint.
set -euo pipefail

CHAT_LARGE_RETENTION_BASE_URL="${CHAT_LARGE_RETENTION_BASE_URL:-https://test.datowave.com}"
CHAT_LARGE_RETENTION_ENDPOINT="${CHAT_LARGE_RETENTION_ENDPOINT:-/v1/admin/chat/uploads/large-retention-cleanup}"
CHAT_LARGE_RETENTION_BEARER_TOKEN="${CHAT_LARGE_RETENTION_BEARER_TOKEN:-${TEST_SMOKE_TEST_BEARER_TOKEN:-}}"
CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE="${CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE:-.deploy/smoke-auth-livekit-gate.env}"
CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE_KEY="${CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE_KEY:-SMOKE_TEST_BEARER_TOKEN}"

CHAT_LARGE_RETENTION_DRY_RUN="${CHAT_LARGE_RETENTION_DRY_RUN:-1}"
CHAT_LARGE_RETENTION_THRESHOLD_BYTES="${CHAT_LARGE_RETENTION_THRESHOLD_BYTES:-26214400}"
CHAT_LARGE_RETENTION_DAYS="${CHAT_LARGE_RETENTION_DAYS:-7}"
CHAT_LARGE_RETENTION_MAX_DELETE="${CHAT_LARGE_RETENTION_MAX_DELETE:-200}"
CHAT_LARGE_RETENTION_STRICT="${CHAT_LARGE_RETENTION_STRICT:-1}"

if [[ -z "$CHAT_LARGE_RETENTION_BEARER_TOKEN" && -n "$CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE" && -f "$CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE" ]]; then
  token_line="$(grep -E "^${CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE_KEY}=" "$CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE" | tail -n 1 || true)"
  if [[ -n "$token_line" ]]; then
    CHAT_LARGE_RETENTION_BEARER_TOKEN="${token_line#*=}"
  fi
fi

if [[ -z "$CHAT_LARGE_RETENTION_BEARER_TOKEN" ]]; then
  echo "[chat-large-retention-cleanup] missing CHAT_LARGE_RETENTION_BEARER_TOKEN (or TEST_SMOKE_TEST_BEARER_TOKEN)" >&2
  echo "[chat-large-retention-cleanup] set token or provide token file: $CHAT_LARGE_RETENTION_BEARER_TOKEN_FILE" >&2
  exit 1
fi

if [[ "$CHAT_LARGE_RETENTION_DRY_RUN" != "0" && "$CHAT_LARGE_RETENTION_DRY_RUN" != "1" ]]; then
  echo "[chat-large-retention-cleanup] CHAT_LARGE_RETENTION_DRY_RUN must be 0 or 1" >&2
  exit 1
fi

if [[ ! "$CHAT_LARGE_RETENTION_THRESHOLD_BYTES" =~ ^[1-9][0-9]*$ ]]; then
  echo "[chat-large-retention-cleanup] CHAT_LARGE_RETENTION_THRESHOLD_BYTES must be positive integer" >&2
  exit 1
fi

if [[ ! "$CHAT_LARGE_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "[chat-large-retention-cleanup] CHAT_LARGE_RETENTION_DAYS must be positive integer" >&2
  exit 1
fi

if [[ ! "$CHAT_LARGE_RETENTION_MAX_DELETE" =~ ^[1-9][0-9]*$ ]]; then
  echo "[chat-large-retention-cleanup] CHAT_LARGE_RETENTION_MAX_DELETE must be positive integer" >&2
  exit 1
fi

if [[ "$CHAT_LARGE_RETENTION_STRICT" != "0" && "$CHAT_LARGE_RETENTION_STRICT" != "1" ]]; then
  echo "[chat-large-retention-cleanup] CHAT_LARGE_RETENTION_STRICT must be 0 or 1" >&2
  exit 1
fi

tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

base_url="${CHAT_LARGE_RETENTION_BASE_URL%/}"
endpoint="/${CHAT_LARGE_RETENTION_ENDPOINT#/}"
request_url="${base_url}${endpoint}"

request_body="$(cat <<EOF
{"dryRun":$([[ "$CHAT_LARGE_RETENTION_DRY_RUN" == "1" ]] && echo true || echo false),"thresholdBytes":$CHAT_LARGE_RETENTION_THRESHOLD_BYTES,"retentionDays":$CHAT_LARGE_RETENTION_DAYS,"maxDelete":$CHAT_LARGE_RETENTION_MAX_DELETE}
EOF
)"

http_code="$(curl -sS -o "$tmp_body" -w "%{http_code}" \
  -H "Authorization: Bearer $CHAT_LARGE_RETENTION_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$request_url" \
  --data "$request_body")"

if [[ "$http_code" != "200" ]]; then
  echo "[chat-large-retention-cleanup] HTTP $http_code from $request_url" >&2
  sed -n '1,120p' "$tmp_body" >&2 || true
  exit 1
fi

node - "$tmp_body" "$CHAT_LARGE_RETENTION_STRICT" <<'NODE'
const fs = require("fs");

const bodyPath = process.argv[2];
const strict = String(process.argv[3] || "1") === "1";

let payload;
try {
  payload = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
} catch (error) {
  console.error("[chat-large-retention-cleanup] failed to parse response JSON", error && error.message ? error.message : error);
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
const deletedObjectCount = toInt(payload.deletedObjectCount);
const deletedAttachmentCount = toInt(payload.deletedAttachmentCount);
const failedObjectDeleteCount = toInt(payload.failedObjectDeleteCount);
const failedDbDeleteCount = toInt(payload.failedDbDeleteCount);
const thresholdBytes = toInt(payload.thresholdBytes);
const retentionDays = toInt(payload.retentionDays);

console.log(
  `[chat-large-retention-cleanup] dryRun=${dryRun ? "1" : "0"} scanned=${scannedCount} ` +
  `thresholdBytes=${thresholdBytes} retentionDays=${retentionDays} ` +
  `deletedObjects=${deletedObjectCount} deletedRows=${deletedAttachmentCount} ` +
  `failedObjects=${failedObjectDeleteCount} failedRows=${failedDbDeleteCount}`
);

if (!dryRun && strict && (failedObjectDeleteCount > 0 || failedDbDeleteCount > 0)) {
  console.error(
    `[chat-large-retention-cleanup] strict mode failed: failedObjectDeleteCount=${failedObjectDeleteCount} failedDbDeleteCount=${failedDbDeleteCount}`
  );
  process.exit(2);
}
NODE
