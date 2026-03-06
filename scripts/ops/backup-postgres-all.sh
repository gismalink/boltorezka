#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${BACKUP_ENV_FILE:-infra/.env.host}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/srv/backups/boltorezka/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

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
  local target_dir="$BACKUP_ROOT/$label"
  local outfile="$target_dir/${TIMESTAMP}_pgdumpall.sql.gz"
  local checksum_file="${outfile}.sha256"
  local tmp_file="${outfile}.tmp"

  mkdir -p "$target_dir"

  echo "[backup-db] backup $label from service=$service -> $outfile"
  compose exec -T "$service" sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dumpall -U "$POSTGRES_USER" --clean --if-exists' \
    | gzip -9 > "$tmp_file"

  mv "$tmp_file" "$outfile"
  shasum -a 256 "$outfile" > "$checksum_file"

  find "$target_dir" -type f -name "*_pgdumpall.sql.gz" -mtime "+$RETENTION_DAYS" -delete
  find "$target_dir" -type f -name "*_pgdumpall.sql.gz.sha256" -mtime "+$RETENTION_DAYS" -delete

  echo "[backup-db] done $label"
}

run_backup_for_service "test" "${BACKUP_TEST_DB_SERVICE:-boltorezka-db-test}"
run_backup_for_service "prod" "${BACKUP_PROD_DB_SERVICE:-boltorezka-db-prod}"

echo "[backup-db] all backups completed at $BACKUP_ROOT"
