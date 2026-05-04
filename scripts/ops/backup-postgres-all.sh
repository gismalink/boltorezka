#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${BACKUP_ENV_FILE:-infra/.env.host}"
BACKUP_ROOT="${BACKUP_ROOT:-/Volumes/datas3/srv/backups/server-databases/datowave}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TMP_RETENTION_DAYS="${TMP_RETENTION_DAYS:-2}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "[backup-db] RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "$TMP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "[backup-db] TMP_RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[backup-db] compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup-db] env file not found: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

run_backup_for_service() {
  local label="$1"
  local service="$2"
  local db_user="$3"
  local target_dir="$BACKUP_ROOT/$label"
  local outfile="$target_dir/${TIMESTAMP}_pgdumpall.sql.gz"
  local checksum_file="${outfile}.sha256"
  local tmp_file="${outfile}.tmp"

  mkdir -p "$target_dir"

  # Remove stale temp files from interrupted runs so backup dirs stay bounded.
  find "$target_dir" -type f -name "*_pgdumpall.sql.gz.tmp" -mtime "+$TMP_RETENTION_DAYS" -delete || true

  echo "[backup-db] backup $label from service=$service user=$db_user -> $outfile"
  if ! compose exec -T -e BACKUP_DB_USER_OVERRIDE="$db_user" "$service" sh -lc 'set -eu; db_user="${BACKUP_DB_USER_OVERRIDE:-${POSTGRES_USER:-postgres}}"; PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dumpall -U "$db_user" --clean --if-exists' \
    | gzip -9 > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "[backup-db] failed $label" >&2
    return 1
  fi

  mv "$tmp_file" "$outfile"
  shasum -a 256 "$outfile" > "$checksum_file"

  find "$target_dir" -type f -name "*_pgdumpall.sql.gz" -mtime "+$RETENTION_DAYS" -delete
  find "$target_dir" -type f -name "*_pgdumpall.sql.gz.sha256" -mtime "+$RETENTION_DAYS" -delete

  echo "[backup-db] done $label"
}

run_backup_for_service "test" "${BACKUP_TEST_DB_SERVICE:-datowave-db-test}" "${BACKUP_TEST_DB_USER:-}"
run_backup_for_service "prod" "${BACKUP_PROD_DB_SERVICE:-datowave-db-prod}" "${BACKUP_PROD_DB_USER:-}"

echo "[backup-db] all backups completed at $BACKUP_ROOT"
