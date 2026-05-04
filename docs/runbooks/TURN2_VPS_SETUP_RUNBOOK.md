# TURN2 VPS Setup Runbook

Цель: развернуть и поддерживать дополнительный TURN2 на отдельном VPS (Ubuntu 24.04) в native режиме (coturn + systemd) без Docker.

## 1) Scope и baseline

- Текущий TURN на `turns.datowave.com:5349` остаётся рабочим fallback.
- TURN2 поднимается на `46.149.71.86` и домене `turn2.datowave.com`.
- Целевой режим для TURN2: native `coturn` как systemd-сервис `coturn`.
- Базовый relay range для TURN2: `49160-49359` (ровно 200 портов).
- Режим rollout: сначала `test`, затем при green smoke — promotion в `prod`.

## 2) Preconditions

1. DNS A record: `turn2.datowave.com -> 46.149.71.86`.
2. Доступ к VPS по SSH.
3. На локальной машине есть SSH public key (`~/.ssh/id_ed25519.pub`).

Ограничения провайдера VPS (закрытые порты):

- `25`, `465`, `2525`, `3389`, `389`, `587`, `53413`
- Эти порты не использовать в планировании сервисов/health checks.

## 3) SSH bootstrap

Интерактивно добавляем ключ на VPS:

```bash
cd ~/srv/datowave
bash ./scripts/ops/bootstrap-vps-ssh-key.sh 46.149.71.86 root
```

Скрипт попросит пароль VPS и затем проверит key-based login.

## 4) Provision TURN2 на VPS

Используем только native provisioning скрипт:

```bash
cd ~/srv/datowave
TURN2_SSH_TARGET=root@46.149.71.86 \
TURN2_DOMAIN=turn2.datowave.com \
TURN2_EXTERNAL_IP=46.149.71.86 \
TURN2_USERNAME=<turn2-username> \
TURN2_PASSWORD=<turn2-password> \
TURN2_ACME_EMAIL=<ops-email> \
TURN2_MIN_PORT=49160 \
TURN2_MAX_PORT=49359 \
bash ./scripts/ops/provision-turn2-vps-native.sh
```

Что делает скрипт:

1. Устанавливает `coturn`, `certbot`, `ufw`, системные зависимости.
2. Настраивает firewall (`22`, `3478 tcp/udp`, `443 tcp`, relay range `49160-49359` tcp/udp).
3. Выпускает/обновляет TLS cert через certbot standalone (временно открывает `80/tcp` для ACME challenge).
4. Синхронизирует cert/key в `/etc/turnserver/certs` (права `640`, group `turnserver`).
5. Пишет `/etc/turnserver.conf` с `lt-cred-mech` и статическим `user=<username>:<password>`.
6. Ставит certbot deploy-hook в `/etc/letsencrypt/renewal-hooks/deploy/turn2-restart-coturn.sh`.
7. Перезапускает и включает `coturn` через systemd.

Renewal note: повторный ручной provisioning для renew обычно не нужен, так как deploy-hook ставится автоматически.

## Нужно ли прятать TURN за Caddy?

Нет, в этом сценарии это не нужно.

- TURN на `443/tcp` — не HTTP трафик; обычный Caddy reverse proxy не дает выигрыша для coturn.
- Для TURN на 443 проще и надежнее оставлять прямой bind coturn + certbot renew-hook (уже автоматизировано).
- Вариант с Caddy имеет смысл только при отдельной сложной задаче L4 multiplexing на одном IP/443 (другой класс сложности и рисков).

Если DNS еще не распространился, можно сделать pre-DNS прогон:

```bash
cd ~/srv/datowave
TURN2_SSH_TARGET=root@46.149.71.86 \
TURN2_DOMAIN=turn2.datowave.com \
TURN2_EXTERNAL_IP=46.149.71.86 \
TURN2_USERNAME=<turn2-username> \
TURN2_PASSWORD=<turn2-password> \
TURN2_ACME_EMAIL=<ops-email> \
bash ./scripts/ops/provision-turn2-vps-native.sh
```

Примечание: для native baseline рекомендуется делать стандартный прогон с certbot после появления DNS.

## 5) Validation

Проверки после deploy:

```bash
ssh root@46.149.71.86 'systemctl --no-pager --full status coturn | sed -n "1,40p"'
ssh root@46.149.71.86 'ss -lntup | egrep ":443|:3478|:4916|:4935"'
ssh root@46.149.71.86 'egrep -n "^(realm|lt-cred-mech|user=|min-port|max-port|cert|pkey)" /etc/turnserver.conf'
openssl s_client -connect turn2.datowave.com:443 -servername turn2.datowave.com -brief
```

Проверка auth/allocate без “реального” пользователя:

```bash
ssh root@46.149.71.86 'turnutils_uclient -v -S -T -u <turn2-username> -w "<turn2-password>" -p 443 -n 1 turn2.datowave.com'
```

Ожидаемо: есть `allocate response received` и `success`.

Дополнительно: проверить candidate relay в test-вызове из VPN/корп сети.

Контекстная проверка на клиенте:

- В call log должен появляться маркер вида:
	- `livekit relay connected via turns:... protocol=tcp`
- Это показывает, через какой TURN endpoint реально поднят relay path.

Если provisioning запускался до стабилизации DNS, повторить стандартный прогон после появления корректной A-записи.

## 6) Dual-TURN rollout (test-first)

В `TEST_VITE_RTC_ICE_SERVERS_JSON` используем порядок:

1. `turns:turn2.datowave.com:443?transport=tcp`
2. `turns:turns.datowave.com:5349?transport=tcp`

После обновления test env:

1. `npm run deploy:test:smoke`
2. ручной VPN smoke voice
3. проверка turn allocation ошибок в summary

## 7) Rollback

Быстрый rollback без остановки нового VPS:

1. убрать `turn2` из ICE JSON (оставить только текущий `turns.datowave.com:5349`),
2. redeploy в `test`,
3. smoke повторно.

## 8) Secrets policy

- Секреты не коммитим в git.
- Source of truth: password manager.
- На VPS секреты для TURN2 хранятся в `/etc/turnserver.conf` (ограничить доступ root/turnserver, не выгружать в логи/чаты).
- Ротацию credentials фиксируем через текущий TURN runbook и release evidence.
