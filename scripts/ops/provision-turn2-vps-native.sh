#!/usr/bin/env bash
# Purpose: provision TURN2 directly on VPS host (coturn + systemd), optimized for low-memory nodes.
set -euo pipefail

SSH_TARGET="${TURN2_SSH_TARGET:-root@46.149.71.86}"
SSH_PORT="${TURN2_SSH_PORT:-22}"

TURN_DOMAIN="${TURN2_DOMAIN:-}"
TURN_REALM="${TURN2_REALM:-${TURN2_DOMAIN:-}}"
TURN_EXTERNAL_IP="${TURN2_EXTERNAL_IP:-}"
TURN_USERNAME="${TURN2_USERNAME:-}"
TURN_PASSWORD="${TURN2_PASSWORD:-}"
TURN_MIN_PORT="${TURN2_MIN_PORT:-49160}"
TURN_MAX_PORT="${TURN2_MAX_PORT:-49359}"
ACME_EMAIL="${TURN2_ACME_EMAIL:-}"

TURN2_SWAP_SIZE_GB="${TURN2_SWAP_SIZE_GB:-1}"
TURN2_PURGE_DOCKER="${TURN2_PURGE_DOCKER:-1}"
TURN2_JOURNAL_MAX_USE="${TURN2_JOURNAL_MAX_USE:-64M}"
TURN2_JOURNAL_RUNTIME_MAX_USE="${TURN2_JOURNAL_RUNTIME_MAX_USE:-32M}"

if [[ -z "$TURN_DOMAIN" || -z "$TURN_REALM" || -z "$TURN_EXTERNAL_IP" || -z "$TURN_USERNAME" || -z "$TURN_PASSWORD" || -z "$ACME_EMAIL" ]]; then
  echo "[provision-turn2-vps-native] required env vars:" >&2
  echo "  TURN2_DOMAIN, TURN2_EXTERNAL_IP, TURN2_USERNAME, TURN2_PASSWORD, TURN2_ACME_EMAIL" >&2
  echo "  optional: TURN2_REALM, TURN2_MIN_PORT, TURN2_MAX_PORT, TURN2_SWAP_SIZE_GB, TURN2_PURGE_DOCKER" >&2
  exit 1
fi

if ! [[ "$TURN_MIN_PORT" =~ ^[0-9]+$ && "$TURN_MAX_PORT" =~ ^[0-9]+$ ]]; then
  echo "[provision-turn2-vps-native] TURN2_MIN_PORT and TURN2_MAX_PORT must be numeric" >&2
  exit 1
fi

if (( TURN_MIN_PORT < 1024 || TURN_MAX_PORT > 65535 || TURN_MIN_PORT > TURN_MAX_PORT )); then
  echo "[provision-turn2-vps-native] invalid TURN relay range: ${TURN_MIN_PORT}-${TURN_MAX_PORT}" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "[provision-turn2-vps-native] ssh command is required" >&2
  exit 1
fi

echo "[provision-turn2-vps-native] target=${SSH_TARGET}:${SSH_PORT}"

ssh -t -p "$SSH_PORT" "$SSH_TARGET" \
  "TURN2_DOMAIN='$TURN_DOMAIN' TURN2_REALM='$TURN_REALM' TURN2_EXTERNAL_IP='$TURN_EXTERNAL_IP' TURN2_USERNAME='$TURN_USERNAME' TURN2_PASSWORD='$TURN_PASSWORD' TURN2_MIN_PORT='$TURN_MIN_PORT' TURN2_MAX_PORT='$TURN_MAX_PORT' TURN2_ACME_EMAIL='$ACME_EMAIL' TURN2_SWAP_SIZE_GB='$TURN2_SWAP_SIZE_GB' TURN2_PURGE_DOCKER='$TURN2_PURGE_DOCKER' TURN2_JOURNAL_MAX_USE='$TURN2_JOURNAL_MAX_USE' TURN2_JOURNAL_RUNTIME_MAX_USE='$TURN2_JOURNAL_RUNTIME_MAX_USE' bash -s" <<'REMOTE'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y coturn certbot ufw ca-certificates libcap2-bin

# Low-memory protection: configure swap if missing.
if [[ "${TURN2_SWAP_SIZE_GB}" =~ ^[0-9]+$ ]] && (( TURN2_SWAP_SIZE_GB > 0 )); then
  if ! swapon --show | grep -q '/swapfile'; then
    if ! fallocate -l "${TURN2_SWAP_SIZE_GB}G" /swapfile 2>/dev/null; then
      dd if=/dev/zero of=/swapfile bs=1M count="$(( TURN2_SWAP_SIZE_GB * 1024 ))"
    fi
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '^/swapfile ' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
  fi
  printf 'vm.swappiness=10\n' >/etc/sysctl.d/99-turn2-memory.conf
  sysctl -p /etc/sysctl.d/99-turn2-memory.conf >/dev/null || true
fi

# Limit journald RAM/disk pressure.
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/99-turn2-memory.conf <<EOF
[Journal]
Storage=volatile
SystemMaxUse=${TURN2_JOURNAL_MAX_USE}
RuntimeMaxUse=${TURN2_JOURNAL_RUNTIME_MAX_USE}
EOF
systemctl restart systemd-journald || true

if [[ "${TURN2_PURGE_DOCKER}" == "1" ]]; then
  systemctl stop docker docker.socket containerd 2>/dev/null || true
  apt-get purge -y docker-ce docker-ce-cli docker-buildx-plugin docker-compose-plugin containerd.io 2>/dev/null || true
  apt-get autoremove -y 2>/dev/null || true
  rm -rf /var/lib/docker /var/lib/containerd /opt/turn2
fi

ufw allow 22/tcp || true
ufw allow 3478/tcp || true
ufw allow 3478/udp || true
ufw allow 443/tcp || true
ufw allow "${TURN2_MIN_PORT}:${TURN2_MAX_PORT}/udp" || true
ufw allow "${TURN2_MIN_PORT}:${TURN2_MAX_PORT}/tcp" || true
yes | ufw enable || true

if [[ ! -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem" ]]; then
  ufw allow 80/tcp || true
  certbot certonly --standalone --non-interactive --agree-tos -m "${TURN2_ACME_EMAIL}" -d "${TURN2_DOMAIN}"
  ufw delete allow 80/tcp || true
fi

install -d -m 750 -o root -g turnserver /etc/turnserver/certs
cp -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem" /etc/turnserver/certs/fullchain.pem
cp -f "/etc/letsencrypt/live/${TURN2_DOMAIN}/privkey.pem" /etc/turnserver/certs/privkey.pem
chown root:turnserver /etc/turnserver/certs/fullchain.pem /etc/turnserver/certs/privkey.pem
chmod 640 /etc/turnserver/certs/fullchain.pem /etc/turnserver/certs/privkey.pem

mkdir -p /var/log/turnserver
chown turnserver:turnserver /var/log/turnserver

cat >/etc/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=443
listening-ip=0.0.0.0
relay-ip=0.0.0.0
external-ip=${TURN2_EXTERNAL_IP}
realm=${TURN2_REALM}
fingerprint
lt-cred-mech
user=${TURN2_USERNAME}:${TURN2_PASSWORD}
proc-user=turnserver
proc-group=turnserver
cert=/etc/turnserver/certs/fullchain.pem
pkey=/etc/turnserver/certs/privkey.pem
min-port=${TURN2_MIN_PORT}
max-port=${TURN2_MAX_PORT}
no-multicast-peers
stale-nonce
no-tlsv1
no-tlsv1_1
simple-log
log-file=/var/log/turnserver/turnserver.log
no-cli
EOF

hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
mkdir -p "$hook_dir"
cat >"$hook_dir/turn2-restart-coturn.sh" <<HOOK
#!/usr/bin/env bash
set -euo pipefail
install -d -m 750 -o root -g turnserver /etc/turnserver/certs
cp -f /etc/letsencrypt/live/${TURN2_DOMAIN}/fullchain.pem /etc/turnserver/certs/fullchain.pem
cp -f /etc/letsencrypt/live/${TURN2_DOMAIN}/privkey.pem /etc/turnserver/certs/privkey.pem
chown root:turnserver /etc/turnserver/certs/fullchain.pem /etc/turnserver/certs/privkey.pem
chmod 640 /etc/turnserver/certs/fullchain.pem /etc/turnserver/certs/privkey.pem
systemctl restart coturn || true
HOOK
chmod 755 "$hook_dir/turn2-restart-coturn.sh"

setcap cap_net_bind_service=+ep /usr/bin/turnserver

systemctl enable coturn
systemctl restart coturn

echo "[provision-turn2-vps-native] coturn status"
systemctl --no-pager --full status coturn | sed -n '1,25p'
echo "[provision-turn2-vps-native] sockets"
ss -lntup | egrep ':22|:443|:3478|:49|:50|:51' || true
echo "[provision-turn2-vps-native] memory"
free -h
REMOTE

echo "[provision-turn2-vps-native] done"
echo "[provision-turn2-vps-native] validate: openssl s_client -connect ${TURN_DOMAIN}:443 -servername ${TURN_DOMAIN} -brief"
