# Chat Media Object Storage Checklist
Date: 2026-03-19
Scope: переход chat media c inline `data:image/...;base64` на object storage с backward compatibility.

## 0) Scope and constraints

- [x] Rollout только через `test` до отдельного подтверждения `prod`.
- [x] Feature branch обязателен, `prod` только после merge в `main`.
- [x] Переход выполняется без массовой миграции исторических сообщений на старте.
- [ ] Для каждого этапа есть rollback path и smoke-подтверждение.

## 1) Target data model

- [ ] Сообщение хранит медиа как `attachments[]`, а не бинарь в `text`.
- [ ] Attachment schema зафиксирована и используется единообразно:
	- [ ] `id`
	- [ ] `type` (`image`)
	- [ ] `storageKey`
	- [ ] `publicUrl` или `downloadUrl`
	- [ ] `mimeType`
	- [ ] `sizeBytes`
	- [ ] `width` / `height` (optional)
	- [ ] `checksum` (optional)
- [ ] `text` содержит только текстовую часть сообщения.

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

- [ ] MIME whitelist включен (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
- [ ] Max size enforced на client и API.
- [ ] Rate limit на `upload-init` и `upload-finalize`.
- [ ] Pre-signed URL короткоживущий (short TTL).
- [ ] Object key namespace не угадываемый (`env/room/user/date/uuid...`).
- [ ] Bucket lifecycle policy + cleanup orphan объектов.
- [ ] Structured audit logs: `userId`, `roomSlug`, `storageKey`, `size`, `mime`, `status`.

## 5) Rollout phases

### Stage 0 - Infrastructure and API readiness

- [ ] Подготовлен storage bucket и политики доступа.
- [x] Реализованы API endpoints `upload/init` и `upload/finalize`.
- [x] Добавлены серверные проверки finalize (object exists + metadata validation).

### Stage 1 - Dual-read

- [x] Reader поддерживает legacy + attachments.
- [x] Writer остается legacy по умолчанию.
- [x] Добавлены метрики доли legacy/attachments чтения.

### Stage 2 - Attachments write on test

- [x] В `test` включен write в attachments.
- [x] Smoke и ручной critical-path тест стабильны.
- [ ] Ошибки upload/finalize не превышают согласованный порог.

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

- [ ] В новых сообщениях нет inline base64 в `text`.
- [x] `deploy:test:smoke` стабильно проходит с attachments write.
- [ ] Есть явное подтверждение для `prod` rollout.
- [ ] `deploy:prod + post-prod smoke` проходят без регрессий.
- [ ] Документация и runbooks обновлены под новый поток.

## 9) Validation notes

- Validation note: документ фиксирует целевую архитектуру и rollout-gates; статусы пунктов отмечаются по мере выполнения.
- Validation note (current state): test по умолчанию работает в legacy режиме (inline base64); object storage flow внедрен в коде и включается feature flag'ом.
- Validation note (implementation): в API добавлен Stage 0 каркас (`/v1/chat/uploads/init`, `/v1/chat/uploads/finalize`) и `message_attachments`; web writer-path пока не переключен.
- Validation note (writer-path): web writer-path добавлен под feature flag `VITE_CHAT_OBJECT_STORAGE_WRITE=1`; по умолчанию legacy путь сохранен.
- Validation note (test rollout): деплой `test` с `TEST_VITE_CHAT_OBJECT_STORAGE_WRITE=1` и `SMOKE_CHAT_OBJECT_STORAGE=1` прошел успешно на SHA `8a6658cb017dc55a03e5d7685fddf0f174f67b85`; smoke `chat:object-storage` и общий postdeploy smoke - `ok`.
- Validation note (hardened smoke): smoke `chat:object-storage` расширен проверками `Attachment URL content-type` и reject для unsupported `mime`/oversized `size`; `test` deploy+smoke прошел на SHA `f48a8d2759987ed71de93c7cf78c4ee7c6a3b816`.
- Validation note (read metrics): в `/v1/rooms/:slug/messages` добавлены best-effort метрики чтения `chat_read_messages_total`, `chat_read_messages_with_attachments`, `chat_read_messages_legacy_inline_data_url`, `chat_read_messages_plain_text`; деплой `test` прошел на SHA `98e1f32286a9a182474d8fe8ed2d6d2c0b91b999`, метрики фиксируются в postdeploy summary.
- Validation note (legacy removal): web перешел на attachments-only рендер/запись (без markdown/base64 fallback в `text`), infra build-arg `VITE_CHAT_OBJECT_STORAGE_WRITE` удален; `test` deploy+smoke прошел на SHA `c19af1a1d4599c2632fa6ba78556dc538dcc4717`.
- Validation note (minio stage A): в host compose добавлен opt-in профиль `minio-test` (`boltorezka-minio-test` + `boltorezka-minio-test-init`) и env-шаблон для MinIO bootstrap (`TEST_MINIO_*`, `CHAT_STORAGE_PROVIDER`).

## 10) MinIO rollout plan (draft)

### 10.1 Target

- [ ] MinIO как отдельный object storage backend для chat attachments.
- [ ] Хранилище файлов изолировано от API container filesystem.

### 10.2 Stage A - MinIO foundation on test

- [x] Добавить `boltorezka-minio-test` service в host compose (`minio/minio`).
- [ ] Создать bucket `chat-attachments-test` и policy только для service account API.
- [ ] Вынести endpoint/credentials/bucket в env (`CHAT_STORAGE_PROVIDER=minio`, `CHAT_MINIO_*`).
- [ ] Добавить health/smoke проверку доступности MinIO (S3 API + write/read object).

### 10.3 Stage B - API storage abstraction

- [ ] Ввести `ChatObjectStorage` интерфейс (put/get/stat/delete).
- [ ] Реализовать `LocalFsChatObjectStorage` (текущий путь) и `MinioChatObjectStorage`.
- [ ] Переключение provider через config без изменения API контрактов.

### 10.4 Stage C - Test cutover

- [ ] В `test` включить provider=`minio`.
- [ ] Smoke: upload-init -> put -> finalize -> history -> download via API endpoint.
- [ ] Smoke: orphan cleanup/TTL job и проверка метрик ошибок provider.

### 10.5 Stage D - Prod cutover

- [ ] После подтверждения `test` развернуть `boltorezka-minio-prod`.
- [ ] Переключить `prod` на provider=`minio` только после smoke в `test` и явного approval.
- [ ] Зафиксировать rollback: вернуть provider=`localfs` без миграции API контрактов.
