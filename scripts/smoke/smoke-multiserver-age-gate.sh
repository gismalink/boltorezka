#!/usr/bin/env bash
# Purpose: Validate NSFW age-gate flow in multi-server context: invite/deep-link -> 403 AgeVerificationRequired -> age-confirm -> 200.
set -euo pipefail

REPO_DIR="${1:-$PWD}"
BASE_URL="${SMOKE_API_URL:-https://test.datowave.com}"
COMPOSE_FILE="${SMOKE_COMPOSE_FILE:-infra/docker-compose.host.yml}"
ENV_FILE="${SMOKE_ENV_FILE:-infra/.env.host}"
SMOKE_ENV_SCOPE="${SMOKE_ENV_SCOPE:-test}"

if [[ "$SMOKE_ENV_SCOPE" == "prod" ]]; then
  POSTGRES_SERVICE="${SMOKE_POSTGRES_SERVICE:-boltorezka-db-prod}"
  REDIS_SERVICE="${SMOKE_REDIS_SERVICE:-boltorezka-redis-prod}"
  API_SERVICE="${SMOKE_API_SERVICE:-boltorezka-api-prod}"
else
  POSTGRES_SERVICE="${SMOKE_POSTGRES_SERVICE:-boltorezka-db-test}"
  REDIS_SERVICE="${SMOKE_REDIS_SERVICE:-boltorezka-redis-test}"
  API_SERVICE="${SMOKE_API_SERVICE:-boltorezka-api-test}"
fi

USER_EMAIL="${SMOKE_USER_EMAIL:-smoke-rtc-1@example.test}"
USER_EMAIL_SECOND="${SMOKE_USER_EMAIL_SECOND:-smoke-rtc-2@example.test}"

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  grep -E "^${key}=" "$file" | head -n 1 | cut -d'=' -f2-
}

SMOKE_POSTGRES_DB="${SMOKE_POSTGRES_DB:-$(read_env_value TEST_POSTGRES_DB "$ENV_FILE")}" 
SMOKE_POSTGRES_USER="${SMOKE_POSTGRES_USER:-$(read_env_value TEST_POSTGRES_USER "$ENV_FILE")}" 
SMOKE_AUTH_SESSION_TTL_SEC="${SMOKE_AUTH_SESSION_TTL_SEC:-2592000}"

if [[ -z "$SMOKE_POSTGRES_DB" || -z "$SMOKE_POSTGRES_USER" ]]; then
  echo "[smoke:multiserver:age-gate] missing test postgres credentials" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[smoke:multiserver:age-gate] missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

compose() {
  docker compose --profile "$SMOKE_ENV_SCOPE" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

make_hs256_jwt() {
  local secret="$1"
  local sub="$2"
  local role="$3"
  local sid="$4"
  local now exp header payload unsigned signature

  now="$(date +%s)"
  exp="$((now + 3600))"
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"sub\":\"$sub\",\"sid\":\"$sid\",\"role\":\"$role\",\"authMode\":\"sso\",\"iat\":$now,\"exp\":$exp}"

  unsigned="$(printf '%s' "$header" | base64url).$(printf '%s' "$payload" | base64url)"
  signature="$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$secret" -binary | base64url)"
  printf '%s.%s' "$unsigned" "$signature"
}

resolve_user_meta_by_email() {
  local email="$1"
  compose exec -T "$POSTGRES_SERVICE" psql -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tAc \
    "select id::text || '|' || coalesce(role,'user') from users where email='${email}' limit 1;" | tr -d '[:space:]'
}

json_get() {
  local key="$1"
  node -e 'const fs=require("fs");const k=process.argv[1];const d=JSON.parse(fs.readFileSync(0,"utf8"));const v=k.split(".").reduce((a,p)=>a&&a[p],d);if(v===undefined||v===null){process.exit(2)};process.stdout.write(String(v));' "$key"
}

resolve_operable_server_id() {
  local token="$1"
  local status body operable create_name created

  status="$(curl -sS -o /tmp/smoke-default-server.json -w '%{http_code}' -H "Authorization: Bearer $token" "$BASE_URL/v1/servers/default")"
  if [[ "$status" == "200" ]]; then
    body="$(cat /tmp/smoke-default-server.json)"
    printf '%s' "$body" | json_get 'server.id'
    return 0
  fi

  status="$(curl -sS -o /tmp/smoke-servers-list.json -w '%{http_code}' -H "Authorization: Bearer $token" "$BASE_URL/v1/servers")"
  if [[ "$status" != "200" ]]; then
    echo "[smoke:multiserver:age-gate] servers list failed: status=$status" >&2
    return 1
  fi

  operable="$(node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(0,"utf8"));const list=Array.isArray(data.servers)?data.servers:[];const item=list.find((s)=>String(s?.role||"")==="owner"||String(s?.role||"")==="admin");if(item?.id){process.stdout.write(String(item.id));}' < /tmp/smoke-servers-list.json)"
  if [[ -n "$operable" ]]; then
    printf '%s' "$operable"
    return 0
  fi

  create_name="SmokeAgeGate-$(date +%s)"
  status="$(curl -sS -o /tmp/smoke-create-server.json -w '%{http_code}' -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "{\"name\":\"$create_name\"}" "$BASE_URL/v1/servers")"
  if [[ "$status" != "201" ]]; then
    echo "[smoke:multiserver:age-gate] create server failed: status=$status" >&2
    return 1
  fi

  created="$(cat /tmp/smoke-create-server.json | json_get 'server.id')"
  if [[ -z "$created" ]]; then
    echo "[smoke:multiserver:age-gate] created server id is empty" >&2
    return 1
  fi

  printf '%s' "$created"
}

resolve_operable_server_with_room() {
  local user_id="$1"
  local fallback_token="$2"
  local server_id

  server_id="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tAc \
    "select s.id::text
     from servers s
     join server_members sm on sm.server_id = s.id
     where sm.user_id = '${user_id}'
       and sm.status = 'active'
       and sm.role in ('owner','admin')
       and exists (
         select 1 from rooms r where r.server_id = s.id and r.is_archived = false
       )
     order by s.is_default desc, s.created_at asc
     limit 1;" | tr -d '[:space:]')"

  if [[ -n "$server_id" ]]; then
    printf '%s' "$server_id"
    return 0
  fi

  resolve_operable_server_id "$fallback_token"
}

create_session_token() {
  local user_id="$1"
  local role="$2"
  local secret="$3"
  local sid bearer auth_payload

  sid="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  bearer="$(make_hs256_jwt "$secret" "$user_id" "$role" "$sid")"
  auth_payload="$(printf '{"userId":"%s","authMode":"sso","issuedAt":"%s","rotatedFrom":null}' "$user_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  compose exec -T "$REDIS_SERVICE" redis-cli SETEX "auth:session:$sid" "$SMOKE_AUTH_SESSION_TTL_SEC" "$auth_payload" >/dev/null
  printf '%s' "$bearer"
}

restore_room_nsfw() {
  if [[ -n "${ROOM_SLUG:-}" && -n "${SERVER_ID:-}" && -n "${ROOM_NSFW_PREV:-}" ]]; then
    local prev=false
    if [[ "$ROOM_NSFW_PREV" == "1" ]]; then
      prev=true
    fi

    compose exec -T "$POSTGRES_SERVICE" psql -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tAc \
      "update rooms set nsfw = ${prev} where slug='${ROOM_SLUG}' and server_id='${SERVER_ID}';" >/dev/null || true
  fi
}
trap restore_room_nsfw EXIT

cd "$REPO_DIR"

JWT_SECRET_CANDIDATE="${JWT_SECRET:-}"
if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
  JWT_SECRET_CANDIDATE="$(compose exec -T "$API_SERVICE" printenv JWT_SECRET 2>/dev/null | tr -d '\r\n')"
fi
if [[ -z "$JWT_SECRET_CANDIDATE" ]]; then
  echo "[smoke:multiserver:age-gate] cannot resolve JWT_SECRET" >&2
  exit 1
fi

USER_META="$(resolve_user_meta_by_email "$USER_EMAIL")"
USER_META_SECOND="$(resolve_user_meta_by_email "$USER_EMAIL_SECOND")"
USER_ID="${USER_META%%|*}"
USER_ROLE="${USER_META##*|}"
USER_ID_SECOND="${USER_META_SECOND%%|*}"
USER_ROLE_SECOND="${USER_META_SECOND##*|}"

if [[ -z "$USER_ID" || -z "$USER_ID_SECOND" ]]; then
  echo "[smoke:multiserver:age-gate] smoke users not found" >&2
  exit 1
fi

TOKEN_OWNER="$(create_session_token "$USER_ID" "$USER_ROLE" "$JWT_SECRET_CANDIDATE")"
TOKEN_SECOND="$(create_session_token "$USER_ID_SECOND" "$USER_ROLE_SECOND" "$JWT_SECRET_CANDIDATE")"

SERVER_ID="$(resolve_operable_server_with_room "$USER_ID" "$TOKEN_OWNER")"
if [[ -z "$SERVER_ID" ]]; then
  echo "[smoke:multiserver:age-gate] cannot resolve operable server id" >&2
  exit 1
fi

INVITE_STATUS="$(curl -sS -o /tmp/smoke-agegate-invite.json -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN_OWNER" -H 'Content-Type: application/json' -d '{"ttlHours":1,"maxUses":3}' "$BASE_URL/v1/servers/$SERVER_ID/invites")"

if [[ "$INVITE_STATUS" == "201" ]]; then
  INVITE_TOKEN="$(cat /tmp/smoke-agegate-invite.json | json_get 'token')"
  if [[ -z "$INVITE_TOKEN" ]]; then
    echo "[smoke:multiserver:age-gate] invite token missing" >&2
    exit 1
  fi
  curl -fsS -X POST -H "Authorization: Bearer $TOKEN_SECOND" "$BASE_URL/v1/invites/$INVITE_TOKEN/accept" >/dev/null
elif [[ "$INVITE_STATUS" == "409" ]]; then
  INVITE_ERROR="$(node -e 'const fs=require("fs");try{const d=JSON.parse(fs.readFileSync("/tmp/smoke-agegate-invite.json","utf8"));process.stdout.write(String(d.error||""));}catch{process.stdout.write("");}')"
  if [[ "$INVITE_ERROR" != "ActiveInviteLimitReached" ]]; then
    echo "[smoke:multiserver:age-gate] invite create failed: status=$INVITE_STATUS error=$INVITE_ERROR" >&2
    exit 1
  fi

  MEMBERS_STATUS="$(curl -sS -o /tmp/smoke-agegate-members.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN_OWNER" "$BASE_URL/v1/servers/$SERVER_ID/members")"
  if [[ "$MEMBERS_STATUS" != "200" ]]; then
    echo "[smoke:multiserver:age-gate] invite limit reached and members fetch failed: status=$MEMBERS_STATUS" >&2
    exit 1
  fi

  SECOND_IS_MEMBER="$(node -e 'const fs=require("fs");const uid=process.argv[1];const d=JSON.parse(fs.readFileSync("/tmp/smoke-agegate-members.json","utf8"));const list=Array.isArray(d.members)?d.members:[];process.stdout.write(list.some((m)=>String(m.userId||"")===uid)?"1":"0");' "$USER_ID_SECOND")"
  if [[ "$SECOND_IS_MEMBER" != "1" ]]; then
    echo "[smoke:multiserver:age-gate] invite limit reached and second user is not server member" >&2
    exit 1
  fi

  echo "[smoke:multiserver:age-gate] invite limit reached, continue with existing membership"
else
  echo "[smoke:multiserver:age-gate] invite create failed: status=$INVITE_STATUS" >&2
  exit 1
fi

ROOM_META="$(compose exec -T "$POSTGRES_SERVICE" psql -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tAc \
  "select slug || '|' || case when nsfw then '1' else '0' end from rooms where server_id='${SERVER_ID}' and is_archived=false order by created_at asc limit 1;" | tr -d '[:space:]')"
ROOM_SLUG="${ROOM_META%%|*}"
ROOM_NSFW_PREV="${ROOM_META##*|}"

if [[ -z "$ROOM_SLUG" ]]; then
  echo "[smoke:multiserver:age-gate] no room found for server: $SERVER_ID" >&2
  exit 1
fi

compose exec -T "$POSTGRES_SERVICE" psql -U "$SMOKE_POSTGRES_USER" -d "$SMOKE_POSTGRES_DB" -tAc \
  "update rooms set nsfw = true where slug='${ROOM_SLUG}' and server_id='${SERVER_ID}';" >/dev/null

HTTP_BEFORE="$(curl -sS -o /tmp/smoke-agegate-before.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN_SECOND" "$BASE_URL/v1/rooms/$ROOM_SLUG/messages?limit=5")"
if [[ "$HTTP_BEFORE" != "403" ]]; then
  echo "[smoke:multiserver:age-gate] expected 403 before age-confirm, got: $HTTP_BEFORE" >&2
  exit 1
fi

ERROR_CODE="$(cat /tmp/smoke-agegate-before.json | json_get 'error')"
if [[ "$ERROR_CODE" != "AgeVerificationRequired" ]]; then
  echo "[smoke:multiserver:age-gate] expected AgeVerificationRequired, got: $ERROR_CODE" >&2
  exit 1
fi

CONFIRM_JSON="$(curl -fsS -X POST -H "Authorization: Bearer $TOKEN_SECOND" -H 'Content-Type: application/json' \
  -d '{"source":"smoke-multiserver-age-gate"}' "$BASE_URL/v1/servers/$SERVER_ID/age-confirm")"
CONFIRM_OK="$(printf '%s' "$CONFIRM_JSON" | json_get 'ok')"
if [[ "$CONFIRM_OK" != "true" ]]; then
  echo "[smoke:multiserver:age-gate] age-confirm response is not ok=true" >&2
  exit 1
fi

HTTP_AFTER="$(curl -sS -o /tmp/smoke-agegate-after.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN_SECOND" "$BASE_URL/v1/rooms/$ROOM_SLUG/messages?limit=5")"
if [[ "$HTTP_AFTER" != "200" ]]; then
  echo "[smoke:multiserver:age-gate] expected 200 after age-confirm, got: $HTTP_AFTER" >&2
  exit 1
fi

echo "[smoke:multiserver:age-gate] ok base=$BASE_URL serverId=$SERVER_ID roomSlug=$ROOM_SLUG before=403 after=200"
