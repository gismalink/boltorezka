# ADR: Room chat topics v1 (rooms -> topics -> messages)

Date: 2026-04-03
Status: Accepted (feature branch)
Related plan: [docs/plans/2026-04-02_ROOM_CHAT_TOPICS_PLAN.md](../plans/2026-04-02_ROOM_CHAT_TOPICS_PLAN.md)

## Контекст

Нужен единый чат внутри комнат с темами, где сохраняются:

- серверная модель прав (role/permission matrix),
- удобство переписки в стиле Telegram (reply, mentions, pins, drafts, быстрый поиск),
- консистентный realtime контракт для web/desktop.

Ограничения v1:

- без DM,
- без voice-message UX,
- без пересылки видео-файлов,
- rollout сначала только в test, затем в prod по явному подтверждению.

## Decision

В v1 принимаем модель `Server -> Room -> Topic -> Message` и следующий технический базис:

1. Темы существуют внутри комнаты и имеют собственные unread/read указатели.
2. Сообщения живут только в рамках темы (`topic_id` обязателен).
3. Права вычисляются от server-role c room/topic override.
4. Realtime события атомарны и идемпотентны по `idempotencyKey` для send/edit/reaction.
5. Поиск реализуется единым endpoint со scope: `server|room|topic`.

## Permission matrix v1

Базовые permissions (server-level, c room/topic override):

- `topic.read`
- `topic.write`
- `topic.manage`
- `message.write`
- `message.edit.own`
- `message.delete.own`
- `message.delete.any`
- `message.pin`
- `message.react`
- `message.mention.everyone`
- `moderation.report`
- `moderation.mute`
- `moderation.kick`
- `moderation.ban`

Базовые роли:

- `owner`: полный доступ
- `admin`: полный доступ кроме transfer ownership
- `member`: read/write по room policy

## API baseline v1

- `GET /v1/rooms/:roomId/topics`
- `POST /v1/rooms/:roomId/topics`
- `PATCH /v1/topics/:topicId`
- `POST /v1/topics/:topicId/archive`
- `POST /v1/topics/:topicId/unarchive`
- `GET /v1/topics/:topicId/messages?cursor=&limit=`
- `POST /v1/topics/:topicId/messages`
- `PATCH /v1/messages/:messageId`
- `DELETE /v1/messages/:messageId`
- `POST /v1/messages/:messageId/reply`
- `POST /v1/messages/:messageId/pin`
- `DELETE /v1/messages/:messageId/pin`
- `POST /v1/messages/:messageId/reactions`
- `DELETE /v1/messages/:messageId/reactions/:emoji`
- `GET /v1/search/messages?q=&scope=`
- `PATCH /v1/notification-settings`
- `POST /v1/topics/:topicId/read`

## Realtime contract baseline v1

- `chat.message.created`
- `chat.message.updated`
- `chat.message.deleted`
- `chat.message.pinned`
- `chat.message.unpinned`
- `chat.message.reaction.changed`
- `chat.topic.created`
- `chat.topic.updated`
- `chat.topic.archived`
- `chat.topic.unarchived`
- `chat.topic.read`
- `chat.notification.settings.updated`

## Data model baseline v1

- `room_topics`
- `room_messages`
- `room_message_replies`
- `room_message_pins`
- `room_message_reactions`
- `room_reads` (per-user per-topic)
- `room_notification_settings` (per-user scope)
- `moderation_audit_log`

## Rollout

1. Stage 0 (текущий): ADR + matrix + контракты.
2. Stage 1: backend foundation (migrations + services + permission checks).
3. Stage 2: API CRUD + search + notification settings.
4. Stage 3: frontend (topics sidebar, message feed, composer/reply/mentions/pins/reactions).
5. Stage 4: test deploy + smoke gates.
6. Stage 5: prod deploy после green test gate.

## Open points (до Stage 1 freeze)

1. Нужно ли ограничение количества активных тем на комнату.
2. Нужно ли отдельное permission `topic.create` вместо `topic.manage`.
3. Какой retention policy для archived topics по умолчанию.
