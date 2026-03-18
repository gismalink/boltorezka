#!/usr/bin/env bash
# Purpose: provision a dedicated TURN (coturn) node on a VPS with TLS:443.
set -euo pipefail

SSH_TARGET="${TURN2_SSH_TARGET:-root@72.56.20.97}"
SSH_PORT="${TURN2_SSH_PORT:-22}"
PROJECT_DIR="${TURN2_PROJECT_DIR:-/opt/turn2}"

TURN_DOMAIN="${TURN2_DOMAIN:-}"
TURN_REALM="${TURN2_REALM:-${TURN2_DOMAIN:-}}"
TURN_EXTERNAL_IP="${TURN2_EXTERNAL_IP:-}"
TURN_USERNAME="${TURN2_USERNAME:-}"
TURN_PASSWORD="${TURN2_PASSWORD:-}"
TURN_MIN_PORT="${TURN2_MIN_PORT:-49160}"
TURN_MAX_PORT="${TURN2_MAX_PORT:-51159}"
ACME_EMAIL="${TURN2_ACME_EMAIL:-}"
SKIP_CERTBOT="${TURN2_SKIP_CERTBOT:-0}"
TURN_IMAGE="${TURN2_IMAGE:-ghcr.io/coturn/coturn:4.6.3}"
TURN_PROC_USER="${TURN2_PROC_USER:-nobody}"
TURN_PROC_GROUP="${TURN2_PROC_GROUP:-nogroup}"

if [[ -z "$TURN_DOMAIN" || -z "$TURN_REALM" || -z "$TURN_EXTERNAL_IP" || -z "$TURN_USERNAME" || -z "$TURN_PASSWORD" || -z "$ACME_EMAIL" ]]; then
  echo "[provision-turn2-vps] required env vars:" >&2
  echo "  TURN2_DOMAIN, TURN2_EXTERNAL_IP, TURN2_USERNAME, TURN2_PASSWORD, TURN2_ACME_EMAIL" >&2
  echo "  optional: TURN2_REALM, TURN2_MIN_PORT, TURN2_MAX_PORT, TURN2_SSH_TARGET, TURN2_SSH_PORT, TURN2_SKIP_CERTBOT" >&2
  exit 1
fi

if ! [[ "$TURN_MIN_PORT" =~ ^[0-9]+$ && "$TURN_MAX_PORT" =~ ^[0-9]+$ ]]; then
  echo "[provision-turn2-vps] TURN2_MIN_PORT and TURN2_MAX_PORT must be numeric" >&2
  exit 1
fi

if (( TURN_MIN_PORT < 1024 || TURN_MAX_PORT > 65535 || TURN_MIN_PORT > TURN_MAX_PORT )); then
  echo "[provision-turn2-vps] invalid TURN relay range: ${TURN_MIN_PORT}-${TURN_MAX_PORT}" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "[provision-turn2-vps] ssh command is required" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "[provision-turn2-vps] scp command is required" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat >"$tmp_dir/docker-compose.yml" <<EOF
services:
  turn2:
    image: ${TURN_IMAGE}
    container_name: turn2
    restart: unless-stopped
    command:
      - --no-cli
      - --fingerprint
      - --lt-cred-mech
      - --listening-ip=0.0.0.0
      - --relay-ip=0.0.0.0
      - --realm=\${TURN_REALM}
      - --external-ip=\${TURN_EXTERNAL_IP}
      - --user=\${TURN_USERNAME}:\${TURN_PASSWORD}
      - --listening-port=3478
      - --proc-user=\${TURN_PROC_USER}
      - --proc-group=\${TURN_PROC_GROUP}
      - --min-port=\${TURN_MIN_PORT}
      - --max-port=\${TURN_MAX_PORT}
      - --cert=/certs/fullchain.pem
      - --pkey=/certs/privkey.pem
      - --tls-listening-port=443
      - --verbose
    ports:
      - 3478:3478/tcp
      - 3478:3478/udp
      - 443:443/tcp
      - \${TURN_MIN_PORT}-\${TURN_MAX_PORT}:\${TURN_MIN_PORT}-\${TURN_MAX_PORT}/udp
    volumes:
      - ./certs:/certs:ro
      - ./logs:/var/log/turnserver
EOF

cat >"$tmp_dir/.env" <<EOF
TURN_DOMAIN=${TURN_DOMAIN}
TURN_REALM=${TURN_REALM}
TURN_EXTERNAL_IP=${TURN_EXTERNAL_IP}
TURN_USERNAME=${TURN_USERNAME}
TURN_PASSWORD=${TURN_PASSWORD}
TURN_MIN_PORT=${TURN_MIN_PORT}
TURN_MAX_PORT=${TURN_MAX_PORT}
TURN_PROC_USER=${TURN_PROC_USER}
TURN_PROC_GROUP=${TURN_PROC_GROUP}
EOF

echo "[provision-turn2-vps] uploading compose and env to ${SSH_TARGET}:${PROJECT_DIR}"
ssh -p "$SSH_PORT" "$SSH_TARGET" "mkdir -p '$PROJECT_DIR/logs' && chmod 700 '$PROJECT_DIR'"
scp -P "$SSH_PORT" "$tmp_dir/docker-compose.yml" "$tmp_dir/.env" "${SSH_TARGET}:${PROJECT_DIR}/"

echo "[provision-turn2-vps] running remote provisioning"
ssh -t -p "$SSH_PORT" "$SSH_TARGET" \
  "TURN2_DOMAIN='$TURN_DOMAIN' TURN2_ACME_EMAIL='$ACME_EMAIL' TURN2_PROJECT_DIR='$PROJECT_DIR' TURN2_MIN_PORT='$TURN_MIN_PORT' TURN2_MAX_PORT='$TURN_MAX_PORT' TURN2_SKIP_CERTBOT='$SKIP_CERTBOT' bash -s" <<'REMOTE'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${codename} stable" >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y certbot
fi

if ! command -v ufw >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ufw
fi

ufw allow 22/tcp || true
ufw allow 3478/tcp || true
ufw allow 3478/udp || true
ufw allow 443/tcp || true
ufw allow "${TURN2_MIN_PORT}:${TURN2_MAX_PORT}/udp" || true
yes | ufw enable || true

if [[ "${TURN2_SKIP_CERTBOT:-0}" == "1" ]]; then
  echo "[provision-turn2-vps] TURN2_SKIP_CERTBOT=1 -> cert issuance skipped"
elif [[ ! -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem" ]]; then
  ufw allow 80/tcp || true
  certbot certonly --standalone --non-interactive --agree-tos -m "$TURN2_ACME_EMAIL" -d "$TURN2_DOMAIN"
  ufw delete allow 80/tcp || true
fi

if [[ -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem" && -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/privkey.pem" ]]; then
  mkdir -p "$TURN2_PROJECT_DIR/certs"
  cp -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem" "$TURN2_PROJECT_DIR/certs/fullchain.pem"
  cp -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/privkey.pem" "$TURN2_PROJECT_DIR/certs/privkey.pem"
  chgrp 65534 "$TURN2_PROJECT_DIR/certs/fullchain.pem" "$TURN2_PROJECT_DIR/certs/privkey.pem" || true
  chmod 640 "$TURN2_PROJECT_DIR/certs/fullchain.pem" "$TURN2_PROJECT_DIR/certs/privkey.pem"
fi

hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
hook_file="$hook_dir/turn2-sync-certs.sh"
mkdir -p "$hook_dir"
cat >"$hook_file" <<HOOK
#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${TURN2_DOMAIN}"
PROJECT_DIR="${TURN2_PROJECT_DIR}"
SRC_CERT="/etc/letsencrypt/live/\${DOMAIN}/fullchain.pem"
SRC_KEY="/etc/letsencrypt/live/\${DOMAIN}/privkey.pem"
DST_DIR="\${PROJECT_DIR}/certs"

if [[ ! -f "\${SRC_CERT}" || ! -f "\${SRC_KEY}" ]]; then
  exit 0
fi

mkdir -p "\${DST_DIR}"
cp -f "\${SRC_CERT}" "\${DST_DIR}/fullchain.pem"
cp -f "\${SRC_KEY}" "\${DST_DIR}/privkey.pem"
chgrp 65534 "\${DST_DIR}/fullchain.pem" "\${DST_DIR}/privkey.pem" || true
chmod 640 "\${DST_DIR}/fullchain.pem" "\${DST_DIR}/privkey.pem"

if command -v docker >/dev/null 2>&1; then
  docker compose -f "\${PROJECT_DIR}/docker-compose.yml" --env-file "\${PROJECT_DIR}/.env" up -d --no-deps turn2 >/dev/null 2>&1 || true
fi
HOOK
chmod 755 "$hook_file"

chmod 600 "$TURN2_PROJECT_DIR/.env"
cd "$TURN2_PROJECT_DIR"
docker compose pull

if [[ -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem" && -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/privkey.pem" ]]; then
  docker compose up -d
  docker compose ps
else
  echo "[provision-turn2-vps] certificate not found yet for ${TURN2_DOMAIN}; TURN container was not started"
  echo "[provision-turn2-vps] rerun this script after DNS propagation with TURN2_SKIP_CERTBOT=0"
fi
REMOTE

echo "[provision-turn2-vps] completed"
echo "[provision-turn2-vps] validate TLS: openssl s_client -connect ${TURN_DOMAIN}:443 -servername ${TURN_DOMAIN} -brief"
