# План: Chat Attachments v2 (all formats, multi-file, progress, retention)
Date: 2026-05-05
Scope: Расширение вложений чата для room chat и DM: множественные файлы, отображение прогресса/формата, лимит до 1GB, pre-send удаление вложений, политика backup/retention для больших файлов, единый конфиг лимитов и медиа-политик.

## 0) Контекст

- Текущий upload flow уже есть: init -> object PUT -> finalize.
- Сейчас в web composer одновременно поддерживается только один pending file/image.
- На backend есть серверные лимиты и allowed MIME через env-конфиг.
- Есть отдельные настройки chat image policy (max side, quality, max data URL), но они разнесены по разным местам.
- Нужны новые требования продукта:
  - поддержка всех форматов файлов (в рамках конфигурируемого allowlist);
  - мультизагрузка (больше одного файла за раз);
  - прогресс загрузки и отображение формата файла;
  - удаление вложений до отправки сообщения;
  - лимит размера до 1GB;
  - backup не должен включать файлы больше 25MB;
  - файлы больше 25MB должны храниться только 7 дней;
  - все ключевые лимиты должны быть вынесены в единый конфиг.

## 1) Цели

- Реализовать стабильный upload UX для multi-file вложений с визуальным прогрессом по каждому файлу.
- Ввести централизованный конфиг лимитов (chat image policy + file upload/retention/backup thresholds).
- Обеспечить операционные гарантии:
  - файлы >25MB автоматически удаляются через 7 дней;
  - backup flow не включает файлы >25MB.
- Сохранить совместимость существующего API/сообщений и не ломать текущие вложения.

## 2) Workstreams

### 2.1 Backend API и модель данных

- [ ] Расширить контракт upload/finalize для пакетного сценария (батч attach перед send) без ломки одиночного режима.
- [ ] Ввести в metadata вложения признак класса размера (`small` <=25MB, `large` >25MB) и `expiresAt` для large.
- [ ] Добавить server-side валидацию размера до 1GB (через конфиг), единый код ошибок для oversize.
- [ ] Уточнить определение типа вложения: не ограничивать продукт до image/document/audio, хранить MIME и category вычислять отдельно для UI.
- [ ] Сохранить обратную совместимость выдачи attachments для уже существующих сообщений.

### 2.2 Frontend composer UX

- [ ] Перевести composer с single pending attachment на список pending attachments.
- [ ] Добавить multi-select и drag/drop нескольких файлов за раз.
- [ ] Для каждого pending файла показывать:
  - имя;
  - MIME/формат;
  - размер;
  - статус (`queued`, `uploading`, `uploaded`, `failed`);
  - прогресс (0-100%).
- [ ] Разрешить удаление любого pending файла до отправки.
- [ ] Отправка сообщения должна прикладывать все успешно загруженные вложения одним action.
- [ ] Обработать частичные ошибки: часть файлов загрузилась, часть нет (clear UX и retry).

### 2.3 Upload transport и прогресс

- [ ] Перейти на transport с upload progress callback для object PUT (XHR/fetch+stream, где поддерживается).
- [ ] Добавить retry-политику для network ошибок upload (без дублирования finalize).
- [ ] Гарантировать идемпотентность finalize в multi-file сценарии.
- [ ] Добавить client telemetry по этапам upload (init/put/finalize, latency, failure code).

### 2.4 Конфигурация лимитов (единый конфиг)

- [ ] Создать отдельный конфиг-модуль для chat/media ограничений (не смешивать с разрозненными константами).
- [ ] Перенести туда текущие chat image policy параметры.
- [ ] Добавить новые параметры:
  - `CHAT_UPLOAD_MAX_SIZE_BYTES` (по умолчанию 1GB);
  - `CHAT_LARGE_FILE_THRESHOLD_BYTES` (25MB);
  - `CHAT_LARGE_FILE_RETENTION_DAYS` (7);
  - `CHAT_BACKUP_MAX_FILE_SIZE_BYTES` (25MB);
  - allowlist MIME/расширений.
- [ ] Обеспечить согласованность web + api + ops (одни и те же значения по умолчанию и документация).

### 2.5 Retention и cleanup

- [ ] Реализовать плановый cleanup job для large-файлов по `expiresAt` (удаление объекта + cleanup ссылок).
- [ ] Добавить dry-run режим и отчетность cleanup (сколько найдено/удалено/ошибок).
- [ ] Добавить метрики retention cleanup и алерты на рост ошибок удаления.

### 2.6 Backup политика файлов

- [ ] Зафиксировать отдельный file-backup flow для chat objects (если включен в окружении).
- [ ] Добавить жесткий фильтр: backup включает только файлы <=25MB.
- [ ] Проверить, что текущие DB backup scripts не затрагивают object storage файлы.
- [ ] Обновить scheduler job/env и runbook с явным описанием порога 25MB.

### 2.7 Документация и rollout

- [ ] Обновить contracts и API docs по новому multi-file flow.
- [ ] Обновить ops runbooks: upload limits, retention cleanup, backup filter.
- [ ] Добавить migration note для уже существующих вложений и rollback steps.

## 3) Приоритеты

1. P0: Backend+Frontend multi-file upload с прогрессом и pre-send удалением.
2. P0: Единый конфиг лимитов + лимит 1GB.
3. P1: Retention cleanup для >25MB (7 дней).
4. P1: Backup policy для файлов <=25MB.
5. P2: Расширенная observability и отчеты.

## 4) Acceptance criteria

- [ ] Пользователь может выбрать и прикрепить более одного файла за раз.
- [ ] До отправки сообщения можно удалить любой pending файл.
- [ ] В UI видны формат файла и прогресс загрузки по каждому файлу.
- [ ] Сервер принимает файлы до 1GB и корректно отклоняет больше лимита.
- [ ] Файлы >25MB автоматически получают TTL 7 дней и удаляются cleanup job.
- [ ] Backup flow не включает файлы >25MB.
- [ ] Все лимиты вынесены в единый конфиг и задокументированы.
- [ ] Smoke test для test/prod проходит без регрессий отправки сообщений и вложений.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- Изменения API делаются с обратной совместимостью (single-file старый клиент не ломается).
- Cleanup/backup задачи для удаления объектов запускаются сначала в dry-run.

## 6) План выполнения (этапы)

1. Stage A: Design/Contracts
- Утвердить формат batch attachments и lifecycle статусы.
- Зафиксировать unified config schema.

2. Stage B: Backend foundation
- Лимиты 1GB, metadata size-class/expiresAt, finalize для batch.
- Метрики и коды ошибок.

3. Stage C: Frontend composer v2
- Multi-file queue, progress UI, pre-send remove, partial error handling.

4. Stage D: Retention + backup policy
- Cleanup large files (>25MB, 7 дней), backup фильтр <=25MB.

5. Stage E: Test rollout
- Deploy в test, e2e smoke + ручные сценарии (1 файл, N файлов, 1GB-1 byte, >1GB, mixed успех/ошибки).

6. Stage F: Prod rollout
- Deploy в prod, мониторинг ошибок upload/ws, контроль cleanup/backup job.

## 7) Риски и смягчение

- Риск: рост нагрузки/трафика из-за 1GB uploads.
  - Митигация: rate limits, concurrent upload caps, observability по size buckets.
- Риск: удаление нужных large-файлов cleanup job.
  - Митигация: dry-run, safety window, логирование delete decisions.
- Риск: несовместимость старого UI/контракта.
  - Митигация: backward-compatible API и feature-flag rollout.
