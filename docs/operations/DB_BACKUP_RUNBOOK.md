# DB Backup Runbook (outside Docker)

Цель: хранить резервные копии Postgres за пределами Docker volumes, чтобы потери volume не приводили к потере данных.

## 1) Что бэкапим

Скрипт делает `pg_dumpall` для обоих контуров:
- `datowave-db-test`
- `datowave-db-prod`

Это включает все базы в каждом Postgres-кластере, роли и глобальные объекты.

## 2) Где лежат бэкапы

По умолчанию:
- `/Volumes/datas3/srv/backups/server-databases/datowave/test`
- `/Volumes/datas3/srv/backups/server-databases/datowave/prod`

Файлы:
- `<UTC_TIMESTAMP>_pgdumpall.sql.gz`
- `<UTC_TIMESTAMP>_pgdumpall.sql.gz.sha256`
- Временный файл: `<UTC_TIMESTAMP>_pgdumpall.sql.gz.tmp` (удаляется автоматически при успехе; устаревшие `.tmp` чистятся по `TMP_RETENTION_DAYS`).

## 3) Ручной запуск

Из репозитория `~/srv/datowave` на сервере:

```bash
bash ./scripts/ops/backup-postgres-all.sh
```

Через npm:

```bash
npm run backup:db:all
```

## 4) Переменные

- `BACKUP_ROOT` - корневая папка бэкапов.
- `RETENTION_DAYS` - срок хранения в днях (default: `14`).
- `TMP_RETENTION_DAYS` - срок хранения временных `.tmp` файлов (default: `2`).
- `BACKUP_COMPOSE_FILE` - compose файл (default: `infra/docker-compose.host.yml`).
- `BACKUP_ENV_FILE` - env файл (default: `infra/.env.host`).
- `BACKUP_TEST_DB_SERVICE` - имя test Postgres service.
- `BACKUP_PROD_DB_SERVICE` - имя prod Postgres service.
- `BACKUP_TEST_DB_USER` - пользователь для `pg_dumpall` test (default: `datowave_test`).
- `BACKUP_PROD_DB_USER` - пользователь для `pg_dumpall` prod (default: `datowave_prod`).

Пример:

```bash
BACKUP_ROOT=/Volumes/datas3/srv/backups/server-databases/datowave RETENTION_DAYS=21 bash ./scripts/ops/backup-postgres-all.sh
```

## 5) Планировщик (рекомендация)

Минимум: запускать ежедневно.

Предпочтительно через единый scheduler interface:

```bash
cd ~/srv/datowave
bash ./scripts/ops/scheduler/install-launchd-job.sh backup-postgres-all
```

Source-of-truth для расписания/команды:
- `scripts/ops/scheduler/jobs/backup-postgres-all.env`

Централизованные execution-логи scheduler:
- `~/srv/datowave/.deploy/scheduler/executions.ndjson`

Пример cron (если используется):

```cron
20 3 * * * cd /Users/davidshvartsman/srv/datowave && /bin/bash ./scripts/ops/backup-postgres-all.sh >> /Volumes/datas3/srv/backups/server-databases/datowave/backup.log 2>&1
```

## 6) Проверка восстановления

Периодически проверять восстановление в отдельный test instance:
1. Развернуть временный Postgres.
2. Распаковать dump и применить через `psql`.
3. Проверить наличие ключевых таблиц/данных (`rooms`, `messages`, `users`).

## 7) Важные замечания

- Бэкап хранится на хосте, не в Docker volume.
- Для защиты от потери хоста рекомендуется дополнительная внешняя копия (off-host / object storage).
