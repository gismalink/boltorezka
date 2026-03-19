# Chat Media Object Storage Migration Plan (2026-03-19)

Цель: уйти от inline `data:image/...;base64` в тексте chat-message к хранению медиа в object storage, сохранив backward compatibility.

## 1) Почему меняем

Текущий формат (base64 в message text) прост, но дает технический долг:
- растут payload в WS/API и размер записи в БД;
- сложнее кэширование и CDN раздача;
- нет отдельного жизненного цикла вложений (TTL/GC/аудит);
- сложнее антивирус/модерация/лимиты по типам файлов.

## 2) Целевая модель

Message хранит attachment metadata, а не бинарь:
- `id`
- `type` (`image`)
- `storageKey`
- `publicUrl` или `downloadUrl`
- `mimeType`
- `sizeBytes`
- `width` / `height` (опционально)
- `checksum` (опционально)

Текст и вложения разделены:
- `text` — только текст сообщения;
- `attachments[]` — список медиа.

## 3) Архитектура upload flow

### 3.1 Client -> API (init upload)
- Клиент отправляет metadata (mime, size, room, user).
- API валидирует лимиты и права.
- API выдает pre-signed URL + `storageKey`.

### 3.2 Client -> Object Storage
- Прямая загрузка файла по pre-signed URL.
- Клиент получает успех/ошибку upload.

### 3.3 Client -> API (finalize)
- Клиент подтверждает upload (`storageKey`).
- API создает message с `attachments[]`.
- WS broadcast рассылает message с attachment metadata.

## 4) Backward compatibility

Переход без массовой миграции старых сообщений:
- reader-путь поддерживает legacy markdown/base64;
- writer-путь для новых сообщений использует только object storage;
- fallback включен до завершения миграции клиентов.

## 5) Rollout этапы

1. `Stage 0` — подготовка API + storage bucket + signed URL.
2. `Stage 1` — dual-read (legacy + attachments), write остается legacy.
3. `Stage 2` — write в attachments для test, метрики и smoke.
4. `Stage 3` — write в attachments для prod, legacy write off.
5. `Stage 4` — опциональный cleanup legacy base64 в исторических сообщениях.

## 6) Безопасность и эксплуатация

Обязательно:
- whitelist mime (`image/png`, `image/jpeg`, `image/webp`, `image/gif`);
- max size на API и на client;
- rate limit upload-init/finalize;
- short TTL у pre-signed URL;
- lifecycle policy bucket + GC orphan-объектов;
- structured audit logs (userId, roomSlug, storageKey, size, mime).

## 7) Тестирование (gate)

Новые smoke для test:
- upload-init -> PUT -> finalize -> message visible;
- attachment URL доступен и отдает корректный content-type;
- rejected mime/size дает ожидаемую ошибку;
- WS payload не содержит inline base64.

## 8) SRP в web-client

Разделение ответственности:
- `chat composer state` (UI state);
- `chat image parsing/compression` (pure utils/module);
- `chat upload transport` (API layer);
- `chat message send` (domain action);
- `chat message render` (view only).

Это снижает связность App.tsx и уменьшает риск регрессий paste/send.
