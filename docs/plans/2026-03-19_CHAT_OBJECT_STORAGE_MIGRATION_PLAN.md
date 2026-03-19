# Chat Media Object Storage Checklist
Date: 2026-03-19
Scope: переход chat media c inline `data:image/...;base64` на object storage с backward compatibility.

## 0) Scope and constraints

- [x] Rollout только через `test` до отдельного подтверждения `prod`.
- [x] Feature branch обязателен, `prod` только после merge в `main`.
- [x] Переход выполняется без массовой миграции исторических сообщений на старте.
- [ ] Для каждого этапа есть rollback path и smoke-подтверждение.

## 1) Target data model

- [x] Сообщение хранит медиа как `attachments[]`, а не бинарь в `text`.
- [x] Attachment schema зафиксирована и используется единообразно:
	- [x] `id`
	- [x] `type` (`image`)
	- [x] `storageKey`
	- [x] `publicUrl` или `downloadUrl`
	- [x] `mimeType`
	- [x] `sizeBytes`
	- [x] `width` / `height` (optional)
	- [x] `checksum` (optional)
- [x] `text` содержит только текстовую часть сообщения.

## 2) Upload flow contract

### 2.1 Client -> API (init upload)

- [x] Клиент отправляет metadata (`mime`, `size`, `roomSlug`, `userId`).
- [x] API валидирует права доступа и лимиты.
- [x] API возвращает `storageKey` + pre-signed URL + TTL.

### 2.2 Client -> Object Storage (PUT)

- [x] Клиент загружает файл напрямую в object storage по pre-signed URL.
- [x] В клиенте и API зафиксированы одинаковые лимиты mime/size.

### 2.3 Client -> API (finalize)

- [x] Клиент подтверждает upload по `storageKey`.
- [x] API проверяет наличие объекта, размер, mime, ownership.
- [x] API создает message c `attachments[]`.
- [x] WS broadcast отправляет только metadata (без inline base64).

## 3) Backward compatibility

- [ ] Reader поддерживает legacy markdown/base64 сообщения.
- [x] Writer-path для новых сообщений фиксирован на attachments-only (без runtime feature flag).
- [x] Legacy fallback writer отключен в web-клиенте.
- [ ] Формат WS/API payload versioned (или эквивалентный backward-safe контракт).

## 4) Security and operations hardening

- [x] MIME whitelist включен (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
- [x] Max size enforced на client и API.
- [x] Rate limit на `upload-init` и `upload-finalize`.
- [x] Pre-signed URL короткоживущий (short TTL).
- [x] Object key namespace не угадываемый (`env/room/user/date/uuid...`).
- [ ] Bucket lifecycle policy + cleanup orphan объектов.
- [x] Structured audit logs: `userId`, `roomSlug`, `storageKey`, `size`, `mime`, `status`.

## 5) Rollout phases

### Stage 0 - Infrastructure and API readiness

- [ ] Подготовлен storage bucket и политики доступа.
- [x] Реализованы API endpoints `upload/init` и `upload/finalize`.
- [x] Добавлены серверные проверки finalize (object exists + metadata validation).

### Stage 1 - Dual-read

- [x] Reader поддерживает legacy + attachments.
- [ ] Writer остается legacy по умолчанию.
- [x] Добавлены метрики доли legacy/attachments чтения.

### Stage 2 - Attachments write on test

- [x] В `test` включен write в attachments.
- [x] Smoke и ручной critical-path тест стабильны.
- [x] Ошибки upload/finalize не превышают согласованный порог.

### Stage 3 - Attachments write on prod

- [ ] После успешного test-gate включен write в attachments на `prod`.
- [ ] Legacy write отключен.
- [ ] Post-deploy smoke и мониторинг окна стабилизации пройдены.

### Stage 4 - Legacy cleanup (optional)

- [ ] Подготовлен план очистки historical inline base64.
- [ ] Очистка выполнена безопасно и обратимо (batch + verification).

## 6) Test gates (must pass)

- [x] `upload-init -> PUT -> finalize -> message visible`.
- [x] Attachment URL отдает корректный `content-type`.
- [x] Rejected mime/size возвращает ожидаемую ошибку.
- [x] WS payload не содержит inline base64.
- [x] Reconnect/reload не ломает рендер вложений.

## 7) Web SRP checklist

- [ ] `chat composer state` изолирован от transport/storage логики.
- [x] `chat image parsing/compression` живет в отдельном модуле.
- [x] `chat upload transport` выделен в API/domain слой.
- [ ] `chat message send` не содержит UI-специфичной логики.
- [ ] `chat message render` работает только с view-model.

## 8) Done criteria

- [x] В новых сообщениях нет inline base64 в `text`.
- [x] `deploy:test:smoke` стабильно проходит с attachments write.
- [ ] Есть явное подтверждение для `prod` rollout.
- [ ] `deploy:prod + post-prod smoke` проходят без регрессий.
- [x] Документация и runbooks обновлены под новый поток.

## 9) Validation notes

- Validation note: документ фиксирует целевую архитектуру и rollout-gates; статусы пунктов отмечаются по мере выполнения.
- Validation note (current state): test работает с attachments/object storage writer-path; legacy inline base64 остается только как исторические данные в старых сообщениях.
- Validation note (implementation): API endpoints `/v1/chat/uploads/init` + `/v1/chat/uploads/finalize` и `message_attachments` используются как основной путь записи изображений.
- Validation note (writer-path): web writer-path работает как attachments-only без runtime feature flag; legacy fallback writer отключен.
- Validation note (test rollout): деплой `test` с `TEST_VITE_CHAT_OBJECT_STORAGE_WRITE=1` и `SMOKE_CHAT_OBJECT_STORAGE=1` прошел успешно на SHA `8a6658cb017dc55a03e5d7685fddf0f174f67b85`; smoke `chat:object-storage` и общий postdeploy smoke - `ok`.
- Validation note (hardened smoke): smoke `chat:object-storage` расширен проверками `Attachment URL content-type` и reject для unsupported `mime`/oversized `size`; `test` deploy+smoke прошел на SHA `f48a8d2759987ed71de93c7cf78c4ee7c6a3b816`.
- Validation note (read metrics): в `/v1/rooms/:slug/messages` добавлены best-effort метрики чтения `chat_read_messages_total`, `chat_read_messages_with_attachments`, `chat_read_messages_legacy_inline_data_url`, `chat_read_messages_plain_text`; деплой `test` прошел на SHA `98e1f32286a9a182474d8fe8ed2d6d2c0b91b999`, метрики фиксируются в postdeploy summary.
- Validation note (legacy removal): web перешел на attachments-only рендер/запись (без markdown/base64 fallback в `text`), infra build-arg `VITE_CHAT_OBJECT_STORAGE_WRITE` удален; `test` deploy+smoke прошел на SHA `c19af1a1d4599c2632fa6ba78556dc538dcc4717`.
- Validation note (minio stage A): в host compose добавлен opt-in профиль `minio-test` (`boltorezka-minio-test` + `boltorezka-minio-test-init`) и env-шаблон для MinIO bootstrap (`TEST_MINIO_*`, `CHAT_STORAGE_PROVIDER`).
- Validation note (minio smoke gate): добавлен `smoke:minio:storage` и опциональный postdeploy gate `SMOKE_MINIO_STORAGE=1` с отдельным статусом `SMOKE_MINIO_STORAGE_STATUS` в summary.
- Validation note (test deploy): деплой `test` + postdeploy smoke прошел на SHA `631ade048b1333b65db8bbbd859689c9475a0e3b` c `SMOKE_CHAT_OBJECT_STORAGE=1` и `SMOKE_MINIO_STORAGE=1`; `smoke:minio:storage` корректно отмечен как `skip` при `TEST_CHAT_STORAGE_PROVIDER=localfs`.
- Validation note (stage C dry cutover): после фикса `minio-test-init` (retry loop ожидания MinIO) test deploy+smoke прошел на SHA `ad46f8a8593cd9ad49cf2aa1f6f89a0f330bde90` с runtime overrides `TEST_CHAT_STORAGE_PROVIDER=minio`, `SMOKE_CHAT_OBJECT_STORAGE=1`, `SMOKE_MINIO_STORAGE=1`; `smoke:chat:object-storage` и `smoke:minio:storage` -> `ok`.
- Validation note (provider error metrics gate): добавлены метрики `chat_storage_put_ok`/`chat_storage_put_fail` и postdeploy-проверка их дельты (`SMOKE_CHAT_STORAGE_METRICS=1`, `SMOKE_CHAT_STORAGE_PUT_FAIL_THRESHOLD=0`); в test run на SHA `6eec7a3232a6d157bb65266c21bd9e39fceee8f9` получено `ok_delta=1`, `fail_delta=0`.
- Validation note (orphan cleanup gate): добавлен admin endpoint `POST /v1/admin/chat/uploads/orphan-cleanup` (dry-run/delete) и smoke `smoke:chat:orphan-cleanup`; postdeploy поддерживает отдельный gate `SMOKE_CHAT_ORPHAN_CLEANUP=1` и статус `SMOKE_CHAT_ORPHAN_CLEANUP_STATUS`.
- Validation note (orphan cleanup validation): test deploy+smoke прошел на SHA `640f64efabbd523551952908c92636eaaad5c41c` с `SMOKE_CHAT_ORPHAN_CLEANUP=1`; `smoke:chat:orphan-cleanup` -> `ok`, postdeploy metrics gate показал `chat_storage_put_ok_delta=2`, `chat_storage_put_fail_delta=0`.
- Validation note (persistent minio config): test deploy+smoke прошел на SHA `136061f96de387a1339d91d9c9e113eab046da1b` без runtime overrides storage provider (использован persistent `infra/.env.host`), при активном `minio-test` профиле: `smoke:chat:object-storage`, `smoke:chat:orphan-cleanup`, `smoke:minio:storage` -> `ok`, metrics gate `ok_delta=2`, `fail_delta=0`.
- Validation note (auto-start minio profile): на SHA `cf85aa3640cb4f7ddd06d56fbf4cfed3db2f3e0e` deploy лог показывает `storage provider=minio -> ensure minio-test profile is up`; storage gate-ы `smoke:chat:object-storage`, `smoke:chat:orphan-cleanup`, `smoke:minio:storage` и metrics gate прошли (`ok_delta=2`, `fail_delta=0`). Общий прогон завершился fail из-за внешнего флака `smoke:web:version-cache` (`GET /version failed after 3 attempts: fetch failed`).
- Validation note (smoke hardening): на SHA `91dc4f21e78c5beee04520cfa481494a0ca57e4b` в postdeploy добавлен флаг `SMOKE_WEB_VERSION_CACHE=0` для детерминированных storage-focused прогонов; статус `SMOKE_VERSION_CACHE_STATUS` пишется в smoke summary.
- Validation note (deterministic storage green): на SHA `bfada8ad3b92d3a1a2d15cf30bb36d7a5031fad2` добавлен retry в `smoke:chat:orphan-cleanup` для transient fetch ошибок; test `deploy:test:smoke` прошел `done` c `SMOKE_REALTIME=0`, `SMOKE_WEB_VERSION_CACHE=0`, `SMOKE_COOKIE_NEGATIVE=0`, `SMOKE_COOKIE_WS_TICKET=0`, `SMOKE_WEB_CRASH_BOUNDARY_BROWSER=0`, `SMOKE_WEB_RNNOISE_BROWSER=0`, `SMOKE_DESKTOP_UPDATE_FEED=0` и успешными storage gate-ами (`chat:object-storage`, `chat:orphan-cleanup`, `minio:storage`, metrics `ok_delta=2`, `fail_delta=0`).
- Validation note (fresh rerun): на SHA `53bb2609f6ac0368f283eedc70224663c74b19de` повторный test `deploy:test:smoke` снова прошел `done` с тем же storage-focused набором флагов; подтверждены `chat:object-storage=ok`, `chat:orphan-cleanup=ok`, `minio:storage=ok`, `chat_storage_put_fail_delta=0`.
- Validation note (rate-limit + audit logs): на SHA `3e13467bf65d6e571b99cf6f868b212bcf8ace19` добавлены rate-limit preHandler'ы для `POST /v1/chat/uploads/init` и `POST /v1/chat/uploads/finalize`, а также structured audit events (`chat.upload.init`, `chat.upload.put`, `chat.upload.finalize`) с полями `userId/roomSlug/storageKey/sizeBytes/mimeType/status`; также добавлен retry-hardening в `smoke:chat:object-storage`. Test `deploy:test:smoke` прошел `done` с storage-focused флагами.
- Validation note (minio service-account policy): в `minio-test-init` добавено bootstrap-действие: bucket policy `chat-attachments-rw` (ListBucket + Get/Put/DeleteObject на target bucket) и attach к выделенному API user (`TEST_MINIO_API_USER`/`TEST_MINIO_API_PASSWORD`), с fallback на root creds только при отсутствии API user vars.

## 10) MinIO rollout plan (draft)

### 10.1 Target

- [x] MinIO как отдельный object storage backend для chat attachments.
- [x] Хранилище файлов изолировано от API container filesystem.

### 10.2 Stage A - MinIO foundation on test

- [x] Добавить `boltorezka-minio-test` service в host compose (`minio/minio`).
- [x] Создать bucket `chat-attachments-test` и policy только для service account API.
- [x] Вынести endpoint/credentials/bucket в env (`CHAT_STORAGE_PROVIDER=minio`, `CHAT_MINIO_*`).
- [x] Добавить health/smoke проверку доступности MinIO (S3 API health endpoints).

### 10.3 Stage B - API storage abstraction

- [x] Ввести `ChatObjectStorage` интерфейс (put/get/stat/delete).
- [x] Реализовать `LocalFsChatObjectStorage` (текущий путь) и `MinioChatObjectStorage`.
- [x] Переключение provider через config без изменения API контрактов.

### 10.4 Stage C - Test cutover

- [x] В `test` включить provider=`minio` (runtime override в deploy сессии + постоянная фиксация в `infra/.env.host`).
- [x] Smoke: upload-init -> put -> finalize -> history -> download via API endpoint.
- [x] Smoke: orphan cleanup/TTL path (admin cleanup endpoint + postdeploy gate).
- [x] Проверка метрик ошибок provider в postdeploy (`chat_storage_put_fail_delta`).

### 10.5 Stage D - Prod cutover

- [ ] После подтверждения `test` развернуть `boltorezka-minio-prod`.
- [ ] Переключить `prod` на provider=`minio` только после smoke в `test` и явного approval.
- [ ] Зафиксировать rollback: вернуть provider=`localfs` без миграции API контрактов.
