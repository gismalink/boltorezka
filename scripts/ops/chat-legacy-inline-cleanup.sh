#!/usr/bin/env bash
# Purpose: Clean legacy inline data:image base64 payloads from messages text with reversible backup.

set -euo pipefail

BASE_DIR="${REPO_DIR:-$PWD}"
ENV_FILE_REL="infra/.env.host"
COMPOSE_FILE_REL="infra/docker-compose.host.yml"

SCOPE="${LEGACY_INLINE_ENV_SCOPE:-test}"
ACTION="${LEGACY_INLINE_ACTION:-dry-run}"
RUN_ID="${LEGACY_INLINE_RUN_ID:-}"
BATCH_LIMIT="${LEGACY_INLINE_BATCH_LIMIT:-500}"
BACKUP_TABLE="${LEGACY_INLINE_BACKUP_TABLE:-message_legacy_inline_cleanup_backup}"
PLACEHOLDER="${LEGACY_INLINE_PLACEHOLDER:-[legacy-inline-image-removed]}"

if [[ "$SCOPE" != "test" && "$SCOPE" != "prod" ]]; then
  echo "[chat-legacy-inline-cleanup] LEGACY_INLINE_ENV_SCOPE must be test|prod" >&2
  exit 1
fi

if [[ "$ACTION" != "dry-run" && "$ACTION" != "apply" && "$ACTION" != "rollback" ]]; then
  echo "[chat-legacy-inline-cleanup] LEGACY_INLINE_ACTION must be dry-run|apply|rollback" >&2
  exit 1
fi

if ! [[ "$BATCH_LIMIT" =~ ^[0-9]+$ ]] || [[ "$BATCH_LIMIT" -le 0 ]]; then
  echo "[chat-legacy-inline-cleanup] LEGACY_INLINE_BATCH_LIMIT must be positive integer" >&2
  exit 1
fi

if [[ "$ACTION" == "rollback" && -z "$RUN_ID" ]]; then
  echo "[chat-legacy-inline-cleanup] LEGACY_INLINE_RUN_ID is required for rollback" >&2
  exit 1
fi

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="legacy-inline-$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [[ ! -f "$BASE_DIR/$ENV_FILE_REL" ]]; then
  echo "[chat-legacy-inline-cleanup] missing env file: $BASE_DIR/$ENV_FILE_REL" >&2
  exit 1
fi

if [[ ! -f "$BASE_DIR/$COMPOSE_FILE_REL" ]]; then
  echo "[chat-legacy-inline-cleanup] missing compose file: $BASE_DIR/$COMPOSE_FILE_REL" >&2
  exit 1
fi

read_env() {
  local key="$1"
  grep -E "^${key}=" "$BASE_DIR/$ENV_FILE_REL" | tail -n1 | cut -d= -f2-
}

compose() {
  docker compose -f "$BASE_DIR/$COMPOSE_FILE_REL" --env-file "$BASE_DIR/$ENV_FILE_REL" "$@"
}

if [[ "$SCOPE" == "test" ]]; then
  DB_SERVICE="boltorezka-db-test"
  DB_USER="$(read_env TEST_POSTGRES_USER)"
  DB_NAME="$(read_env TEST_POSTGRES_DB)"
else
  DB_SERVICE="boltorezka-db-prod"
  DB_USER="$(read_env PROD_POSTGRES_USER)"
  DB_NAME="$(read_env PROD_POSTGRES_DB)"
fi

if [[ -z "$DB_USER" || -z "$DB_NAME" ]]; then
  echo "[chat-legacy-inline-cleanup] failed to resolve DB credentials for scope=$SCOPE" >&2
  exit 1
fi

psql_exec() {
  compose exec -T "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "[chat-legacy-inline-cleanup] scope=$SCOPE action=$ACTION run_id=$RUN_ID batch_limit=$BATCH_LIMIT"

psql_exec <<SQL
CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
  run_id TEXT NOT NULL,
  message_id UUID NOT NULL,
  room_id UUID,
  user_id UUID,
  created_at TIMESTAMPTZ,
  original_text TEXT NOT NULL,
  cleaned_text TEXT NOT NULL,
  backup_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_${BACKUP_TABLE}_message_id ON ${BACKUP_TABLE}(message_id);
SQL

if [[ "$ACTION" == "dry-run" ]]; then
  psql_exec -tA <<SQL
WITH candidate AS (
  SELECT id, octet_length(text) AS text_bytes
  FROM messages
  WHERE text LIKE '%data:image/%'
)
SELECT
  COUNT(*)::TEXT || '|' ||
  COALESCE(SUM(text_bytes), 0)::TEXT || '|' ||
  COALESCE(MIN(id)::TEXT, '') || '|' ||
  COALESCE(MAX(id)::TEXT, '')
FROM candidate;
SQL
  exit 0
fi

if [[ "$ACTION" == "apply" ]]; then
  psql_exec -v run_id="$RUN_ID" -v batch_limit="$BATCH_LIMIT" -v placeholder="$PLACEHOLDER" <<'SQL'
BEGIN;

WITH candidate AS (
  SELECT
    id,
    room_id,
    user_id,
    created_at,
    text AS original_text,
    regexp_replace(
      regexp_replace(
        text,
        '!\[[^\]]*\]\(data:image\/[A-Za-z0-9.+-]+;base64,[^)]*\)',
        :'placeholder',
        'gi'
      ),
      'data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+',
      :'placeholder',
      'gi'
    ) AS cleaned_text
  FROM messages
  WHERE text LIKE '%data:image/%'
  ORDER BY created_at ASC, id ASC
  LIMIT :'batch_limit'
),
backup_rows AS (
  INSERT INTO message_legacy_inline_cleanup_backup (
    run_id,
    message_id,
    room_id,
    user_id,
    created_at,
    original_text,
    cleaned_text
  )
  SELECT
    :'run_id',
    id,
    room_id,
    user_id,
    created_at,
    original_text,
    cleaned_text
  FROM candidate
  ON CONFLICT (run_id, message_id) DO NOTHING
  RETURNING message_id
),
updated AS (
  UPDATE messages m
  SET text = b.cleaned_text,
      updated_at = NOW()
  FROM message_legacy_inline_cleanup_backup b
  WHERE b.run_id = :'run_id'
    AND b.message_id = m.id
  RETURNING m.id
)
SELECT
  (SELECT COUNT(*) FROM candidate) AS candidate_count,
  (SELECT COUNT(*) FROM backup_rows) AS backup_count,
  (SELECT COUNT(*) FROM updated) AS updated_count;

COMMIT;
SQL

  psql_exec -v run_id="$RUN_ID" -tA <<'SQL'
SELECT
  COUNT(*)::TEXT || '|' || COALESCE(SUM(CASE WHEN text LIKE '%data:image/%' THEN 1 ELSE 0 END), 0)::TEXT
FROM messages
WHERE id IN (
  SELECT message_id
  FROM message_legacy_inline_cleanup_backup
  WHERE run_id = :'run_id'
);
SQL

  exit 0
fi

psql_exec -v run_id="$RUN_ID" <<'SQL'
BEGIN;
WITH restored AS (
  UPDATE messages m
  SET text = b.original_text,
      updated_at = NOW()
  FROM message_legacy_inline_cleanup_backup b
  WHERE b.run_id = :'run_id'
    AND b.message_id = m.id
  RETURNING m.id
)
SELECT COUNT(*) AS restored_count FROM restored;
COMMIT;
SQL

psql_exec -v run_id="$RUN_ID" -tA <<'SQL'
SELECT COUNT(*)
FROM messages m
JOIN message_legacy_inline_cleanup_backup b ON b.message_id = m.id
WHERE b.run_id = :'run_id'
  AND m.text LIKE '%data:image/%';
SQL
