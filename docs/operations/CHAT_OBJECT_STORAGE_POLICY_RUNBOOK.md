# Chat Object Storage Policy Runbook

Цель: единая политика лимитов upload + retention + backup для chat object storage в test/prod.

## 1) Политика по умолчанию

- `CHAT_UPLOAD_MAX_SIZE_BYTES=1073741824` (1GB)
- `CHAT_LARGE_FILE_THRESHOLD_BYTES=26214400` (25MB)
- `CHAT_LARGE_FILE_RETENTION_DAYS=7`
- `CHAT_BACKUP_MAX_FILE_SIZE_BYTES=26214400` (25MB)

Chat image policy (server-side defaults):
- `CHAT_IMAGE_MAX_DATA_URL_LENGTH=102400`
- `CHAT_IMAGE_MAX_SIDE=1200`
- `CHAT_IMAGE_JPEG_QUALITY=0.6`

## 2) Где задаются значения

Source of truth для host deployment:
- `infra/.env.host` (шаблон: `infra/.env.host.example`)
- `infra/docker-compose.host.yml` (прокидывание env в `datowave-api-test` и `datowave-api-prod`)

Runtime считывает значения через API модуль `apps/api/src/chat-media-config.ts`.

## 3) Правила retention/backup

- `small` файл: `size <= CHAT_LARGE_FILE_THRESHOLD_BYTES`
- `large` файл: `size > CHAT_LARGE_FILE_THRESHOLD_BYTES`
- large-файлы должны получать TTL `CHAT_LARGE_FILE_RETENTION_DAYS` и удаляться cleanup job.
- backup flow для chat objects должен включать только объекты `<= CHAT_BACKUP_MAX_FILE_SIZE_BYTES`.

Важно:
- DB backup scripts бэкапят Postgres и не включают object storage payloads.
- Для object storage нужен отдельный cleanup/backup контур (см. roadmap/plan по attachments v2).

## 4) Test-first rollout

1. Обновить значения в `infra/.env.host` (при необходимости).
2. Выкатить в test:

```bash
cd ~/srv/datowave
TEST_REF=origin/main npm run deploy:test:smoke
```

3. Проверить, что API получил значения:

```bash
cd ~/srv/datowave
docker compose -f infra/docker-compose.host.yml --env-file infra/.env.host --profile test exec -T datowave-api-test env | grep -E 'CHAT_IMAGE|CHAT_UPLOAD_MAX_SIZE|CHAT_LARGE_FILE|CHAT_BACKUP_MAX_FILE'
```

4. Проверить chat-image policy endpoint:

```bash
curl -sS https://test.datowave.com/v1/admin/server/chat-image-policy -H "Cookie: <session_cookie>"
```

5. Только после успешного test smoke переходить в prod:

```bash
cd ~/srv/datowave
PROD_REF=origin/main npm run deploy:prod
```

## 5) Post-deploy checks

Минимум:
- контейнеры `datowave-api-test` / `datowave-api-prod` в `Up`;
- `curl -I` для соответствующего домена;
- логи API без ошибок валидации upload policy;
- ручная проверка upload сценариев: `1MB`, `26MB`, `>max limit`.

## 6) Безопасность изменений

- Не коммитить реальные секреты из `infra/.env.host`.
- Изменять только нужные policy vars без массового редактирования env.
- Для prod: деплой только из default branch после test smoke.
