#!/usr/bin/env bash
# Purpose: Verify a single user can hold different roles (owner/admin/member) across different servers.
set -euo pipefail

REPO_DIR="${1:-$PWD}"
COMPOSE_FILE="${SMOKE_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${SMOKE_ENV_FILE:-infra/.env.host}"
SMOKE_ENV_SCOPE="${SMOKE_ENV_SCOPE:-test}"

if [[ "$SMOKE_ENV_SCOPE" == "prod" ]]; then
  POSTGRES_SERVICE="${SMOKE_POSTGRES_SERVICE:-boltorezka-db-prod}"
else
  POSTGRES_SERVICE="${SMOKE_POSTGRES_SERVICE:-boltorezka-db-test}"
fi

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  grep -E "^${key}=" "$file" | head -n 1 | cut -d'=' -f2-
}

if [[ "$SMOKE_ENV_SCOPE" == "prod" ]]; then
  SMOKE_POSTGRES_DB="${SMOKE_POSTGRES_DB:-$(read_env_value PROD_POSTGRES_DB "$ENV_FILE") }"
  SMOKE_POSTGRES_USER="${SMOKE_POSTGRES_USER:-$(read_env_value PROD_POSTGRES_USER "$ENV_FILE") }"
else
  SMOKE_POSTGRES_DB="${SMOKE_POSTGRES_DB:-$(read_env_value TEST_POSTGRES_DB "$ENV_FILE") }"
  SMOKE_POSTGRES_USER="${SMOKE_POSTGRES_USER:-$(read_env_value TEST_POSTGRES_USER "$ENV_FILE") }"
fi

SMOKE_POSTGRES_DB="$(echo "${SMOKE_POSTGRES_DB:-}" | xargs)"
SMOKE_POSTGRES_USER="$(echo "${SMOKE_POSTGRES_USER:-}" | xargs)"

if [[ -z "$SMOKE_POSTGRES_DB" || -z "$SMOKE_POSTGRES_USER" ]]; then
  echo "[smoke:multiserver:role-matrix] missing postgres credentials" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[smoke:multiserver:role-matrix] missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

compose() {
  docker compose --profile "$SMOKE_ENV_SCOPE" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

cd "$REPO_DIR"

SQL_QUERY="BEGIN; \
WITH candidate AS ( \
  SELECT sm.user_id \
  FROM server_members sm \
  WHERE sm.status = 'active' AND sm.role = 'owner' \
  ORDER BY sm.joined_at ASC \
  LIMIT 1 \
), created_admin_server AS ( \
  INSERT INTO servers (slug, name, owner_user_id, is_default) \
  SELECT 'role-check-admin-' || substr(md5(random()::text), 1, 8), 'RoleCheckAdmin', candidate.user_id, FALSE \
  FROM candidate \
  RETURNING id \
), assign_admin AS ( \
  INSERT INTO server_members (server_id, user_id, role, status) \
  SELECT created_admin_server.id, candidate.user_id, 'admin', 'active' \
  FROM created_admin_server, candidate \
  ON CONFLICT (server_id, user_id) DO UPDATE SET role='admin', status='active' \
), created_member_server AS ( \
  INSERT INTO servers (slug, name, owner_user_id, is_default) \
  SELECT 'role-check-member-' || substr(md5(random()::text), 1, 8), 'RoleCheckMember', candidate.user_id, FALSE \
  FROM candidate \
  RETURNING id \
), assign_member AS ( \
  INSERT INTO server_members (server_id, user_id, role, status) \
  SELECT created_member_server.id, candidate.user_id, 'member', 'active' \
  FROM created_member_server, candidate \
  ON CONFLICT (server_id, user_id) DO UPDATE SET role='member', status='active' \
) \
SELECT \
  (coalesce(bool_or(sm.role = 'owner'), FALSE)::int)::text || '|' || \
  (coalesce(bool_or(sm.role = 'admin'), FALSE)::int)::text || '|' || \
  (coalesce(bool_or(sm.role = 'member'), FALSE)::int)::text || '|' || \
  coalesce(array_to_string(array_agg(DISTINCT sm.role ORDER BY sm.role), ','), '') \
FROM server_members sm \
WHERE sm.user_id = (SELECT user_id FROM candidate) \
  AND sm.status = 'active'; \
ROLLBACK;"

RAW_OUTPUT="$(compose exec -T "$POSTGRES_SERVICE" psql -v ON_ERROR_STOP=1 -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tA -c "$SQL_QUERY" | tr -d '\r')"
ROLE_MATRIX_LINE="$(printf '%s\n' "$RAW_OUTPUT" | grep -E '^[01]\|[01]\|[01]\|' | tail -n 1 || true)"

if [[ -z "$ROLE_MATRIX_LINE" ]]; then
  echo "[smoke:multiserver:role-matrix] role matrix output missing" >&2
  exit 1
fi

HAS_OWNER="${ROLE_MATRIX_LINE%%|*}"
REMAINDER="${ROLE_MATRIX_LINE#*|}"
HAS_ADMIN="${REMAINDER%%|*}"
REMAINDER="${REMAINDER#*|}"
HAS_MEMBER="${REMAINDER%%|*}"
ROLES="${REMAINDER#*|}"

if [[ "$HAS_OWNER" != "1" || "$HAS_ADMIN" != "1" || "$HAS_MEMBER" != "1" ]]; then
  echo "[smoke:multiserver:role-matrix] expected owner/admin/member, got roles=$ROLES" >&2
  exit 1
fi

echo "[smoke:multiserver:role-matrix] ok roles=$ROLES"
