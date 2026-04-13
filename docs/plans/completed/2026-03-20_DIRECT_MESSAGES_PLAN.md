# План: личная переписка (Direct Messages)
Date: 2026-03-20
Scope: реализовать список контактов, чат 1:1 и звонки 1:1 между пользователями.

## 0) Что хотим получить

- У пользователя есть список контактов.
- Можно открыть чат с конкретным пользователем.
- История личной переписки сохраняется и подгружается по пагинации.
- Новые сообщения в DM приходят в realtime.
- В интерфейсе DM не смешивается с серверными комнатами.
- Контакты можно формировать двумя способами: вручную и автоматически после DM.
- В v1 личные диалоги остаются строго 1:1 (без групповых DM).

> Звонки 1:1 (audio/video) → см. `2026-04-11_DM_CALLS_PLAN.md`.

## 1) Модель данных (DB)

### 1.1 Новые таблицы

1. `dm_threads`
   - `id` (uuid, pk)
   - `user_low_id` (uuid, fk -> users.id)
   - `user_high_id` (uuid, fk -> users.id)
   - `created_at`, `updated_at`
   - уникальный индекс (`user_low_id`, `user_high_id`) для гарантии одного thread на пару пользователей.

2. `dm_messages`
   - `id` (uuid, pk)
   - `thread_id` (uuid, fk -> dm_threads.id)
   - `sender_user_id` (uuid, fk -> users.id)
   - `body` (text)
   - `attachments_json` (jsonb, nullable; совместимо с текущим форматом attachments)
   - `created_at`, `edited_at` (nullable), `deleted_at` (nullable)

3. `dm_contacts` (v1 упрощенный контакт-лист)
   - `owner_user_id` (uuid, fk -> users.id)
   - `contact_user_id` (uuid, fk -> users.id)
   - `source` (enum: `manual`, `dm_auto`)
   - `created_at`
   - уникальный индекс (`owner_user_id`, `contact_user_id`)

4. `dm_user_settings`
   - `user_id` (uuid, pk, fk -> users.id)
   - `allow_dm_from` (enum: `contacts_only`, `mutual_servers`, `everyone`)
   - `updated_at`

5. `dm_block_list`
   - `owner_user_id` (uuid, fk -> users.id)
   - `blocked_user_id` (uuid, fk -> users.id)
   - `created_at`
   - уникальный индекс (`owner_user_id`, `blocked_user_id`)

### 1.2 Инварианты

- В `dm_threads` участники всегда хранятся в нормализованном порядке (`min(user_id)`, `max(user_id)`).
- Пользователь не может создать DM с самим собой.
- Сообщение в DM может отправить только участник thread.

## 2) Права и приватность

- Доступ к thread имеют только два участника.
- При `service_ban` DM полностью недоступен.
- При server ban (на уровне конкретного сервера) DM остается доступным, если нет отдельного ограничения в политике.
- Политика входящих DM берется из `dm_user_settings.allow_dm_from`.
- Если пользователь в block list собеседника, создать thread/отправить сообщение/позвонить нельзя.

## 3) API контракт (v1)

1. `GET /v1/dm/contacts`
   - список контактов текущего пользователя
   - выход: `[{ userId, displayName, avatarUrl, lastMessageAt, unreadCount }]`

2. `POST /v1/dm/threads`
   - вход: `{ peerUserId }`
   - создает/возвращает существующий thread
   - выход: `{ threadId, peerUser }`

3. `GET /v1/dm/threads/:threadId/messages?cursor=...&limit=...`
   - история сообщений 1:1

4. `POST /v1/dm/threads/:threadId/messages`
   - вход: `{ body, attachments? }`
   - создает сообщение в DM

5. `PATCH /v1/dm/messages/:messageId`
   - редактирование своего сообщения

6. `DELETE /v1/dm/messages/:messageId`
   - мягкое удаление своего сообщения

7. `PATCH /v1/dm/settings`
   - вход: `{ allowDmFrom }`

8. `POST /v1/dm/contacts`
   - вход: `{ contactUserId }`
   - ручное добавление контакта

9. `DELETE /v1/dm/contacts/:contactUserId`
   - удалить контакт из списка

10. `POST /v1/dm/block-list/:userId`
   - добавить пользователя в личный block list

15. `DELETE /v1/dm/block-list/:userId`
> Эндпоинты звонков (10–13 по исходному контракту) → см. `2026-04-11_DM_CALLS_PLAN.md` раздел 3.   - убрать пользователя из block list

### 3.1 Общие требования к API

- Идемпотентность отправки сообщения через idempotency key.
- Единый формат ошибок: `dm_forbidden`, `dm_thread_not_member`, `dm_policy_restricted`.
- Аудит для: create thread, send/edit/delete message, change dm settings.

> Идемпотентность call reject/end, формат call-ошибок и call-аудит → см. `2026-04-11_DM_CALLS_PLAN.md`.

## 4) UI/UX план

### 4.1 Навигация

- Отдельная зона `Личные сообщения` в sidebar.
- Внутри:
  - список контактов/диалогов,
  - поле поиска по контактам,
  - кнопка `Новый диалог`.

### 4.2 Список контактов

- Показать: имя, аватар, последний текст, время, бейдж непрочитанных.
- Сортировка по `lastMessageAt desc`.

### 4.3 Чат с пользователем

- Заголовок с профилем собеседника.
- Лента сообщений + composer.
- Поддержка вложений в том же формате, что и server chat (единый UX).
- Кнопка звонка из header чата.

### 4.4 Звонок 1:1

- Состояния UI: `ringing`, `connecting`, `in_call`, `ended`, `missed`.
- Входящий звонок: системный баннер/модалка `Принять` / `Отклонить`.
- Во время звонка: минимальные controls `mute`, `end`, индикатор качества/переподключения.

### 4.5 Пустые состояния

- Нет контактов: CTA `Начать диалог`.
- Нет сообщений в thread: `Напишите первое сообщение`.

## 5) Realtime, unread и звонки

- Отдельные realtime события для DM:
  - `dm.message.created`
  - `dm.message.updated`
  - `dm.message.deleted`
  - `dm.thread.read`

> WS-события звонков (`dm.call.*`) → см. `2026-04-11_DM_CALLS_PLAN.md` раздел 4.

- Unread счетчик хранить per-thread/per-user.
- При открытии thread отправлять read-ack и обнулять unread только для этого thread.

> State machine звонка → см. `2026-04-11_DM_CALLS_PLAN.md` раздел 1.

## 6) Этапы реализации

### Stage 0 - Design

- [x] Зафиксировать SQL-схему `dm_threads`, `dm_messages`, `dm_contacts`, `dm_user_settings`.
- [x] Зафиксировать SQL-схему `dm_block_list`.
- [x] Зафиксировать политику входящих DM (`allow_dm_from`) для v1.
- [x] Зафиксировать контракт realtime событий DM.
- [x] Зафиксировать call state machine и call error-коды → перенесены в `2026-04-11_DM_CALLS_PLAN.md`.

Stage 0 note (2026-03-21): design-пакет закрыт в этом документе: DB schema, privacy/policy rules, realtime события и call state/error contract зафиксированы.

### Stage 1 - Backend foundation

- [x] Миграции БД (0028: dm_threads, dm_messages, dm_read_cursors, dm_contacts, dm_user_settings, dm_block_list).
- [x] `DmThreadService`, `DmMessageService`, `DmContactService`.
- [x] `DmBlockListService`.
- [x] Policy checks: thread membership + dm settings + block list.
- `DmCallService` (start/accept/reject/end + timeout cleanup) → перенесен в `2026-04-11_DM_CALLS_PLAN.md`.

### Stage 2 - API

- [x] Эндпоинты `contacts`, `threads`, `messages`, `settings`.
- [x] Эндпоинты `manual contacts` и `block list`.
- Эндпоинты `calls` (start/accept/reject/end) → перенесены в `2026-04-11_DM_CALLS_PLAN.md`.
- [x] Cursor pagination в истории сообщений.
- [x] Идемпотентность send path.
- Идемпотентность call reject/end path → перенесена в `2026-04-11_DM_CALLS_PLAN.md`.
- [x] DM upload init/finalize (image attachments).

### Stage 3 - Frontend

- Sidebar блок `Личные сообщения` (список контактов/диалогов).
- [x] Экран/панель thread 1:1 (reuse ChatPanel via headerSlot, DmContext).
- [x] Интеграция unread и realtime обновлений (dm.message.created/updated/deleted, DM unread badges на строках участников).
- [x] DM image paste support (upload init/finalize + frontend paste handler).
- [x] DM открывается как переход между чатами (авто-закрытие при смене комнаты).
- [x] DM edit/delete messages (REST + frontend wiring + editing state).
- [x] DM reply support (migration 0029 + backend + frontend wiring).
- [x] DM reactions (dm_message_reactions + endpoints + WS broadcast + frontend).
- [x] DM unread divider (первое непрочитанное сообщение при открытии thread).
- [x] UI: одновременно активен только один чат (DM или room chat, взаимоисключение).
- Входящий/исходящий звонок UI и call controls → перенесен в `2026-04-11_DM_CALLS_PLAN.md`.

### Stage 4 - Test rollout

- [x] Deploy в `test` (feature/dm-v1, commit 155341f → 28f41ff).
- [x] Smoke: create thread -> send -> receive realtime -> reload history -> mark read.
- [x] Smoke: доступ к thread только у 2 участников.
- Smoke: call start -> accept -> connected -> end → перенесен в `2026-04-11_DM_CALLS_PLAN.md`.
- Smoke: call reject и call timeout → перенесены в `2026-04-11_DM_CALLS_PLAN.md`.

### Stage 5 - Prod rollout

- [ ] После green test-gate и явного подтверждения: deploy в `prod`.

## 7) Что еще может понадобиться

1. Request-based DM (принимать/отклонять входящий диалог от незнакомого).
2. Message requests inbox (как отдельная вкладка).
3. Антиспам для DM (лимиты новых диалогов в сутки).
4. E2E шифрование (если нужен высокий privacy tier в будущем).

## 8) Критерии готовности v1

- Есть список контактов.
- Можно открыть чат с конкретным пользователем.
- Сообщения доставляются и сохраняются корректно.
- Unread/read статус работает корректно.
- История DM недоступна посторонним пользователям.
- Работает ручной контакт-лист и авто-добавление контактов после первого DM.
- Работает персональный block list (send блокируется корректно).

> Критерии готовности звонков → см. `2026-04-11_DM_CALLS_PLAN.md` раздел 9.
- Test smoke для DM стабильно проходит.

## 9) Зафиксированные решения

1. Контакты в v1 поддерживаются и вручную, и автоматически после первого DM.
2. Групповые DM в v1 не делаем (для групповой коммуникации остаются каналы).
3. Звонки 1:1 (audio/video) → см. `2026-04-11_DM_CALLS_PLAN.md`.
4. Отдельный пользовательский block list включаем уже в v1.