#!/usr/bin/env bash
# Purpose: Bootstrap dedicated smoke users and generate test-only bearer tokens.
set -euo pipefail

COMPOSE_FILE="${SMOKE_AUTH_COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${SMOKE_AUTH_ENV_FILE:-.env}"
API_BASE_URL="${SMOKE_API_URL:-http://localhost:8080}"

POSTGRES_SERVICE="${SMOKE_AUTH_POSTGRES_SERVICE:-postgres}"
API_SERVICE="${SMOKE_AUTH_API_SERVICE:-api}"

USER1_EMAIL="${SMOKE_AUTH_USER1_EMAIL:-smoke-rtc-1@example.test}"
USER1_NAME="${SMOKE_AUTH_USER1_NAME:-Smoke RTC One}"
USER1_ROLE="${SMOKE_AUTH_USER1_ROLE:-admin}"

USER2_EMAIL="${SMOKE_AUTH_USER2_EMAIL:-smoke-rtc-2@example.test}"
USER2_NAME="${SMOKE_AUTH_USER2_NAME:-Smoke RTC Two}"
USER2_ROLE="${SMOKE_AUTH_USER2_ROLE:-user}"

USER3_EMAIL="${SMOKE_AUTH_USER3_EMAIL:-}"
USER3_NAME="${SMOKE_AUTH_USER3_NAME:-Smoke RTC Three}"
USER3_ROLE="${SMOKE_AUTH_USER3_ROLE:-user}"

TOKEN_TTL_SEC="${SMOKE_AUTH_TOKEN_TTL_SEC:-2592000}"
OUTPUT_FILE_REL="${SMOKE_AUTH_OUTPUT_FILE:-.deploy/smoke-auth.env}"

compose() {
  if [[ -f "$ENV_FILE" ]]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

compose_exec() {
  local service="$1"
  shift

  if ! compose exec -T "$service" "$@"; then
    echo "[smoke-auth-bootstrap] docker compose exec failed for service=$service (is stack running?)" >&2
    return 1
  fi
}

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

make_hs256_jwt() {
  local secret="$1"
  local sub="$2"
  local email="$3"
  local name="$4"
  local role="$5"
  local now exp header payload unsigned signature

  now="$(date +%s)"
  exp="$((now + TOKEN_TTL_SEC))"
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"sub\":\"$sub\",\"email\":\"$email\",\"name\":\"$name\",\"role\":\"$role\",\"authMode\":\"sso\",\"iat\":$now,\"exp\":$exp}"

  unsigned="$(printf '%s' "$header" | base64url).$(printf '%s' "$payload" | base64url)"
  signature="$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$secret" -binary | base64url)"
  printf '%s.%s' "$unsigned" "$signature"
}

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[smoke-auth-bootstrap] missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

DB_USER="${SMOKE_AUTH_DB_USER:-${TEST_POSTGRES_USER:-${POSTGRES_USER:-boltorezka}}}"
DB_NAME="${SMOKE_AUTH_DB_NAME:-${TEST_POSTGRES_DB:-${POSTGRES_DB:-boltorezka}}}"

if [[ -z "$DB_USER" || -z "$DB_NAME" ]]; then
  echo "[smoke-auth-bootstrap] cannot resolve DB user/name (set SMOKE_AUTH_DB_USER and SMOKE_AUTH_DB_NAME)" >&2
  exit 1
fi

JWT_SECRET_CANDIDATE="${SMOKE_AUTH_JWT_SECRET:-${JWT_SECRET:-${TEST_JWT_SECRET:-}}}"
if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
  JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r' | tr -d '\n' || true)"
fi

if [[ -z "$JWT_SECRET_CANDIDATE" && "$COMPOSE_FILE" == "docker-compose.yml" ]]; then
  JWT_SECRET_CANDIDATE="change-this-in-test-and-prod"
fi

if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
  echo "[smoke-auth-bootstrap] cannot resolve JWT secret (set SMOKE_AUTH_JWT_SECRET or ensure API service has JWT_SECRET)" >&2
  exit 1
fi

upsert_user_sql() {
  local email="$1"
  local name="$2"
  local role="$3"
  local email_safe name_safe role_safe
  email_safe="${email//\'/\'\'}"
  name_safe="${name//\'/\'\'}"
  role_safe="${role//\'/\'\'}"
  printf "INSERT INTO users (email, password_hash, name, role) VALUES ('%s', '__sso_only__', '%s', '%s') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role RETURNING id::text, email, coalesce(name,''), coalesce(role,'user');" "$email_safe" "$name_safe" "$role_safe"
}

echo "[smoke-auth-bootstrap] upsert users in DB"
USER1_ROW="$(compose_exec "$POSTGRES_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -F '|' -Atc "$(upsert_user_sql "$USER1_EMAIL" "$USER1_NAME" "$USER1_ROLE")")"
USER2_ROW="$(compose_exec "$POSTGRES_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -F '|' -Atc "$(upsert_user_sql "$USER2_EMAIL" "$USER2_NAME" "$USER2_ROLE")")"
USER3_ROW=""

if [[ -n "$USER3_EMAIL" ]]; then
  USER3_ROW="$(compose_exec "$POSTGRES_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -F '|' -Atc "$(upsert_user_sql "$USER3_EMAIL" "$USER3_NAME" "$USER3_ROLE")")"
fi

if [[ -z "$USER1_ROW" || -z "$USER2_ROW" || ( -n "$USER3_EMAIL" && -z "$USER3_ROW" ) ]]; then
  echo "[smoke-auth-bootstrap] failed to upsert users" >&2
  exit 1
fi

IFS='|' read -r USER1_ID USER1_EMAIL_ACTUAL USER1_NAME_ACTUAL USER1_ROLE_ACTUAL <<<"$USER1_ROW"
IFS='|' read -r USER2_ID USER2_EMAIL_ACTUAL USER2_NAME_ACTUAL USER2_ROLE_ACTUAL <<<"$USER2_ROW"

USER3_ID=""
USER3_EMAIL_ACTUAL=""
USER3_NAME_ACTUAL=""
USER3_ROLE_ACTUAL=""
if [[ -n "$USER3_ROW" ]]; then
  IFS='|' read -r USER3_ID USER3_EMAIL_ACTUAL USER3_NAME_ACTUAL USER3_ROLE_ACTUAL <<<"$USER3_ROW"
fi

TOKEN1="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "$USER1_ID" "$USER1_EMAIL_ACTUAL" "$USER1_NAME_ACTUAL" "$USER1_ROLE_ACTUAL")"
TOKEN2="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "$USER2_ID" "$USER2_EMAIL_ACTUAL" "$USER2_NAME_ACTUAL" "$USER2_ROLE_ACTUAL")"
TOKEN3=""
if [[ -n "$USER3_ID" ]]; then
  TOKEN3="$(make_hs256_jwt "$JWT_SECRET_CANDIDATE" "$USER3_ID" "$USER3_EMAIL_ACTUAL" "$USER3_NAME_ACTUAL" "$USER3_ROLE_ACTUAL")"
fi

echo "[smoke-auth-bootstrap] verify generated tokens against /v1/auth/me"
curl -fsS -H "Authorization: Bearer $TOKEN1" "$API_BASE_URL/v1/auth/me" >/dev/null
curl -fsS -H "Authorization: Bearer $TOKEN2" "$API_BASE_URL/v1/auth/me" >/dev/null
if [[ -n "$TOKEN3" ]]; then
  curl -fsS -H "Authorization: Bearer $TOKEN3" "$API_BASE_URL/v1/auth/me" >/dev/null
fi

TOKEN_LIST="$TOKEN1,$TOKEN2"
if [[ -n "$TOKEN3" ]]; then
  TOKEN_LIST="$TOKEN_LIST,$TOKEN3"
fi

mkdir -p "$(dirname "$OUTPUT_FILE_REL")"
cat >"$OUTPUT_FILE_REL" <<EOF
# generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# local-only file (ignored by git)
SMOKE_API_URL=$API_BASE_URL

SMOKE_USER_EMAIL=$USER1_EMAIL_ACTUAL
SMOKE_USER_EMAIL_SECOND=$USER2_EMAIL_ACTUAL

SMOKE_TEST_BEARER_TOKEN=$TOKEN1
SMOKE_TEST_BEARER_TOKEN_SECOND=$TOKEN2
SMOKE_TEST_BEARER_TOKENS=$TOKEN_LIST

SMOKE_USER_ID=$USER1_ID
SMOKE_USER_ID_SECOND=$USER2_ID
SMOKE_USER_ROLE=$USER1_ROLE_ACTUAL
SMOKE_USER_ROLE_SECOND=$USER2_ROLE_ACTUAL

EOF

if [[ -n "$TOKEN3" ]]; then
  cat >>"$OUTPUT_FILE_REL" <<EOF

SMOKE_USER_EMAIL_THIRD=$USER3_EMAIL_ACTUAL

SMOKE_TEST_BEARER_TOKEN_THIRD=$TOKEN3

SMOKE_USER_ID_THIRD=$USER3_ID
SMOKE_USER_ROLE_THIRD=$USER3_ROLE_ACTUAL
EOF
fi

cat >>"$OUTPUT_FILE_REL" <<EOF

# legacy vars are intentionally not emitted by default.
# set SMOKE_ALLOW_LEGACY_BEARER=1 only for explicit temporary compatibility.
EOF

chmod 600 "$OUTPUT_FILE_REL" || true

echo "[smoke-auth-bootstrap] done"
if [[ -n "$USER3_EMAIL_ACTUAL" ]]; then
  echo "[smoke-auth-bootstrap] users: $USER1_EMAIL_ACTUAL ($USER1_ROLE_ACTUAL), $USER2_EMAIL_ACTUAL ($USER2_ROLE_ACTUAL), $USER3_EMAIL_ACTUAL ($USER3_ROLE_ACTUAL)"
else
  echo "[smoke-auth-bootstrap] users: $USER1_EMAIL_ACTUAL ($USER1_ROLE_ACTUAL), $USER2_EMAIL_ACTUAL ($USER2_ROLE_ACTUAL)"
fi
echo "[smoke-auth-bootstrap] env file: $OUTPUT_FILE_REL"
echo "[smoke-auth-bootstrap] use: set -a; source $OUTPUT_FILE_REL; set +a"