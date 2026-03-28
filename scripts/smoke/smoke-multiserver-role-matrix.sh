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
CREATE TEMP TABLE role_matrix_ctx ON COMMIT DROP AS \
WITH candidate AS ( \
  SELECT sm.user_id \
  FROM server_members sm \
  WHERE sm.status = 'active' AND sm.role IN ('member', 'admin') \
  ORDER BY sm.joined_at ASC \
  LIMIT 1 \
), helper_user AS ( \
  SELECT sm.user_id \
  FROM server_members sm, candidate \
  WHERE sm.status = 'active' \
    AND sm.user_id <> candidate.user_id \
  ORDER BY sm.joined_at ASC \
  LIMIT 1 \
) \
SELECT candidate.user_id AS candidate_user_id, helper_user.user_id AS helper_user_id \
FROM candidate \
CROSS JOIN helper_user; \
CREATE TEMP TABLE role_matrix_owner_server ON COMMIT DROP AS \
INSERT INTO servers (slug, name, owner_user_id, is_default) \
SELECT 'role-check-owner-' || substr(md5(random()::text), 1, 8), 'RoleCheckOwner', role_matrix_ctx.candidate_user_id, FALSE \
FROM role_matrix_ctx \
RETURNING id; \
CREATE TEMP TABLE role_matrix_admin_server ON COMMIT DROP AS \
INSERT INTO servers (slug, name, owner_user_id, is_default) \
SELECT 'role-check-admin-' || substr(md5(random()::text), 1, 8), 'RoleCheckAdmin', role_matrix_ctx.helper_user_id, FALSE \
FROM role_matrix_ctx \
RETURNING id; \
CREATE TEMP TABLE role_matrix_member_server ON COMMIT DROP AS \
INSERT INTO servers (slug, name, owner_user_id, is_default) \
SELECT 'role-check-member-' || substr(md5(random()::text), 1, 8), 'RoleCheckMember', role_matrix_ctx.helper_user_id, FALSE \
FROM role_matrix_ctx \
RETURNING id; \
INSERT INTO server_members (server_id, user_id, role, status) \
SELECT role_matrix_owner_server.id, role_matrix_ctx.candidate_user_id, 'owner', 'active' \
FROM role_matrix_owner_server, role_matrix_ctx \
ON CONFLICT (server_id, user_id) DO UPDATE SET role='owner', status='active'; \
INSERT INTO server_members (server_id, user_id, role, status) \
SELECT role_matrix_admin_server.id, role_matrix_ctx.candidate_user_id, 'admin', 'active' \
FROM role_matrix_admin_server, role_matrix_ctx \
ON CONFLICT (server_id, user_id) DO UPDATE SET role='admin', status='active'; \
INSERT INTO server_members (server_id, user_id, role, status) \
SELECT role_matrix_member_server.id, role_matrix_ctx.candidate_user_id, 'member', 'active' \
FROM role_matrix_member_server, role_matrix_ctx \
ON CONFLICT (server_id, user_id) DO UPDATE SET role='member', status='active'; \
SELECT \
  (coalesce(bool_or(sm.role = 'owner'), FALSE)::int)::text || '|' || \
  (coalesce(bool_or(sm.role = 'admin'), FALSE)::int)::text || '|' || \
  (coalesce(bool_or(sm.role = 'member'), FALSE)::int)::text || '|' || \
  coalesce(array_to_string(array_agg(DISTINCT sm.role ORDER BY sm.role), ','), '') || '|' || \
  coalesce((SELECT COUNT(*)::text FROM server_members m \
    WHERE m.user_id = (SELECT candidate_user_id FROM role_matrix_ctx LIMIT 1) \
      AND m.server_id IN (SELECT id FROM role_matrix_owner_server) \
      AND m.role = 'owner'), '0') || '|' || \
  coalesce((SELECT COUNT(*)::text FROM server_members m \
    WHERE m.user_id = (SELECT candidate_user_id FROM role_matrix_ctx LIMIT 1) \
      AND m.server_id IN (SELECT id FROM role_matrix_admin_server) \
      AND m.role = 'admin'), '0') || '|' || \
  coalesce((SELECT COUNT(*)::text FROM server_members m \
    WHERE m.user_id = (SELECT candidate_user_id FROM role_matrix_ctx LIMIT 1) \
      AND m.server_id IN (SELECT id FROM role_matrix_member_server) \
      AND m.role = 'member'), '0') || '|' || \
  (SELECT COUNT(*)::text FROM role_matrix_ctx) \
FROM server_members sm \
WHERE sm.user_id = (SELECT candidate_user_id FROM role_matrix_ctx LIMIT 1); \
ROLLBACK;"

RAW_OUTPUT="$(compose exec -T "$POSTGRES_SERVICE" psql -v ON_ERROR_STOP=1 -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tA -c "$SQL_QUERY" | tr -d '\r')"
ROLE_MATRIX_LINE="$(printf '%s\n' "$RAW_OUTPUT" | grep -E '^[01]\|[01]\|[01]\|' | tail -n 1 || true)"

if [[ -z "$ROLE_MATRIX_LINE" ]]; then
  echo "[smoke:multiserver:role-matrix] role matrix output missing" >&2
  exit 1
fi

IFS='|' read -r HAS_OWNER HAS_ADMIN HAS_MEMBER ROLES OWNER_ROWS ADMIN_ROWS MEMBER_ROWS HAS_HELPER <<< "$ROLE_MATRIX_LINE"

if [[ "$HAS_HELPER" != "1" ]]; then
  echo "[smoke:multiserver:role-matrix] missing helper user for synthetic server ownership" >&2
  exit 1
fi

if [[ "$OWNER_ROWS" -lt 1 || "$ADMIN_ROWS" -lt 1 || "$MEMBER_ROWS" -lt 1 ]]; then
  echo "[smoke:multiserver:role-matrix] failed to assign synthetic owner/admin/member rows (owner_rows=$OWNER_ROWS admin_rows=$ADMIN_ROWS member_rows=$MEMBER_ROWS)" >&2
  exit 1
fi

if [[ "$HAS_OWNER" != "1" || "$HAS_ADMIN" != "1" || "$HAS_MEMBER" != "1" ]]; then
  echo "[smoke:multiserver:role-matrix] expected owner/admin/member, got roles=$ROLES" >&2
  exit 1
fi

echo "[smoke:multiserver:role-matrix] ok roles=$ROLES"
