#!/usr/bin/env bash
# Purpose: rotate TURN static credentials in host env and write rotation metadata for smoke gates.
set -euo pipefail

ENV_FILE="${TURN_ROTATE_ENV_FILE:-infra/.env.host}"
META_FILE="${TURN_ROTATE_META_FILE:-.deploy/turn-credentials-last-rotation.env}"
HISTORY_FILE="${TURN_ROTATE_HISTORY_FILE:-.deploy/turn-credentials-rotation.log}"
APPLY="${TURN_ROTATE_APPLY:-0}"
UPDATE_ICE_JSON="${TURN_ROTATE_UPDATE_ICE_JSON:-1}"

read_env_raw() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  printf '%s' "${line#*=}"
}

strip_outer_quotes() {
  local value="$1"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      printf '%s' "${value:1:${#value}-2}"
      return
    fi
    if [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      printf '%s' "${value:1:${#value}-2}"
      return
    fi
  fi
  printf '%s' "$value"
}

apply_original_quotes() {
  local old_raw="$1"
  local new_value="$2"
  if [[ ${#old_raw} -ge 2 && "${old_raw:0:1}" == '"' && "${old_raw: -1}" == '"' ]]; then
    printf '"%s"' "$new_value"
    return
  fi
  if [[ ${#old_raw} -ge 2 && "${old_raw:0:1}" == "'" && "${old_raw: -1}" == "'" ]]; then
    printf "'%s'" "$new_value"
    return
  fi
  printf '%s' "$new_value"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^[[:space:]]*" k "=" {
      print k "=" v
      done = 1
      next
    }
    { print }
    END {
      if (done == 0) {
        print k "=" v
      }
    }
  ' "$file" >"$tmp_file"

  mv "$tmp_file" "$file"
}

rand_alnum() {
  local length="$1"
  local out=""
  while [[ ${#out} -lt "$length" ]]; do
    if command -v openssl >/dev/null 2>&1; then
      out+="$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9')"
    else
      out+="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 64)"
    fi
  done
  printf '%s' "${out:0:length}"
}

replace_ice_json_if_matching() {
  local key="$1"
  local old_user="$2"
  local old_pass="$3"
  local new_user="$4"
  local new_pass="$5"
  local file="$6"

  local raw
  raw="$(read_env_raw "$key" "$file" || true)"
  if [[ -z "$raw" ]]; then
    echo "[turn-rotate] $key skipped (empty)"
    return 0
  fi

  local plain updated wrapped
  plain="$(strip_outer_quotes "$raw")"

  if [[ "$plain" != *"$old_user"* || "$plain" != *"$old_pass"* ]]; then
    echo "[turn-rotate] $key left unchanged (old TURN creds not detected in value)"
    return 0
  fi

  updated="${plain//${old_user}/${new_user}}"
  updated="${updated//${old_pass}/${new_pass}}"
  wrapped="$(apply_original_quotes "$raw" "$updated")"
  set_env_value "$key" "$wrapped" "$file"
  echo "[turn-rotate] $key updated"
}

if [[ "$APPLY" != "1" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "[turn-rotate] dry-run: env file not found locally ($ENV_FILE); nothing to do"
    exit 0
  fi
  echo "[turn-rotate] dry-run: set TURN_ROTATE_APPLY=1 to write changes"
  echo "[turn-rotate] target env file: $ENV_FILE"
  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[turn-rotate] env file not found: $ENV_FILE" >&2
  exit 1
fi

old_user_raw="$(read_env_raw TURN_USERNAME "$ENV_FILE" || true)"
old_pass_raw="$(read_env_raw TURN_PASSWORD "$ENV_FILE" || true)"
old_user="$(strip_outer_quotes "$old_user_raw")"
old_pass="$(strip_outer_quotes "$old_pass_raw")"

if [[ -z "$old_user" || -z "$old_pass" ]]; then
  echo "[turn-rotate] TURN_USERNAME/TURN_PASSWORD must be set in $ENV_FILE" >&2
  exit 1
fi

new_user="turn-$(date -u +%Y%m%d)-$(rand_alnum 6)"
new_pass="$(rand_alnum 40)"

backup_file="${ENV_FILE}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
cp "$ENV_FILE" "$backup_file"

echo "[turn-rotate] backup: $backup_file"

set_env_value "TURN_USERNAME" "$new_user" "$ENV_FILE"
set_env_value "TURN_PASSWORD" "$new_pass" "$ENV_FILE"

echo "[turn-rotate] TURN_USERNAME/TURN_PASSWORD updated"

if [[ "$UPDATE_ICE_JSON" == "1" ]]; then
  replace_ice_json_if_matching "TEST_VITE_RTC_ICE_SERVERS_JSON" "$old_user" "$old_pass" "$new_user" "$new_pass" "$ENV_FILE"
  replace_ice_json_if_matching "PROD_VITE_RTC_ICE_SERVERS_JSON" "$old_user" "$old_pass" "$new_user" "$new_pass" "$ENV_FILE"
else
  echo "[turn-rotate] ICE JSON update skipped (TURN_ROTATE_UPDATE_ICE_JSON=0)"
fi

rotation_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
username_sha256="$(printf '%s' "$new_user" | shasum -a 256 | awk '{print $1}')"
mkdir -p "$(dirname "$META_FILE")"
mkdir -p "$(dirname "$HISTORY_FILE")"

cat >"$META_FILE" <<EOF
TURN_ROTATED_AT_UTC=$rotation_ts
TURN_ROTATE_ENV_FILE=$ENV_FILE
TURN_ROTATED_USERNAME_SHA256=$username_sha256
TURN_ROTATED_BY=${USER:-unknown}
EOF

printf '%s|env_file=%s|username_sha256=%s|by=%s\n' "$rotation_ts" "$ENV_FILE" "$username_sha256" "${USER:-unknown}" >>"$HISTORY_FILE"

echo "[turn-rotate] rotation metadata written: $META_FILE"
echo "[turn-rotate] rotation history appended: $HISTORY_FILE"
echo "[turn-rotate] secrets were rotated in env file; run test smoke before any prod rollout"
