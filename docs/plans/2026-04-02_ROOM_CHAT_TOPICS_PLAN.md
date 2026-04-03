# План: комнаты с темами (Discord + Telegram)
Date: 2026-04-02
Scope: единая модель комнатного чата с темами, Telegram-подобными сообщениями и Discord-подобными правами/структурой. В этом плане нет личных DM, нет голосовых сообщений и нет пересылки видео-файлов.

## Статус выполнения

- 2026-04-03: Stage 0 стартовал в ветке `feature/room-chat-topics-v1`.
- 2026-04-03: Зафиксирован ADR v1: `docs/architecture/2026-04-03_ADR_ROOM_CHAT_TOPICS_V1.md`.
- 2026-04-03: Stage 1 стартовал: добавлена migration foundation `apps/api/migrations/0018_room_chat_topics_foundation.sql`.
- 2026-04-03: Stage 1 стартовал: добавлен backend service baseline `apps/api/src/services/room-topics-service.ts`.
- 2026-04-03: Stage 2 стартовал: реализованы API endpoints тем (`GET/POST /v1/rooms/:roomId/topics`, `PATCH /v1/topics/:topicId`, `POST /v1/topics/:topicId/archive`, `POST /v1/topics/:topicId/unarchive`).
- 2026-04-03: Stage 2 расширен: реализованы topic-aware message endpoints (`GET/POST /v1/topics/:topicId/messages`) и прокинут `topicId/topicSlug` в realtime `chat.message` payload.
- 2026-04-03: Stage 2 расширен: добавлены endpoints `PATCH/DELETE /v1/messages/:messageId`, `POST /v1/messages/:messageId/reply`, `POST/DELETE /v1/messages/:messageId/pin`, `POST/DELETE /v1/messages/:messageId/reactions/*`.
- 2026-04-03: Stage 2 расширен: реализован `GET /v1/search/messages` со scope `all|server|room|topic` и фильтрами author/date/attachments/mentions.
- 2026-04-03: Stage 2 расширен: реализован `PATCH /v1/notification-settings` и `POST /v1/topics/:topicId/read`.

## 0) Контекст

- Нужен единый UX: внутри каждой комнаты есть чат, который можно структурировать темами.
- Требуется совместить сильные стороны Discord (сервер/комната/роль/права) и Telegram (удобство переписки, ответы, закрепы, поиск, уведомления).
- Важно заранее зафиксировать полный feature-list и поэтапный rollout.

## 1) Границы и решения

### 1.1 Что входит

- Комнаты и темы внутри комнат.
- Полный lifecycle сообщений в комнатах/темах.
- Уведомления, mьюты, unread/read, поиск и модерация.
- Realtime и надежность доставки.
- API, DB, UI и smoke-проверки для rollout.

### 1.2 Что не входит (фиксируем сейчас)

- Голосовые сообщения.
- Пересылка видео-файлов.
- Групповые и персональные DM (это отдельный план).

### 1.3 Подтверждено как отдельная фича v1+

- Превью ссылок (link preview) включаем в backlog.

## 2) Целевая модель

- Сервер -> Комната -> Тема -> Сообщения.
- Комната хранит общую ленту и список тем.
- Тема может быть создана отдельно или из конкретного сообщения.
- Права задаются на уровне сервера и переопределяются на уровне комнаты/темы.
- Unread считается отдельно по комнате и по теме.

## 3) Полный список функционала

### 3.1 Структура и навигация

- [ ] Список серверов и комнат.
- [ ] Список тем в комнате.
- [ ] Создание/редактирование/архивирование темы.
- [ ] Закрепление важных тем сверху списка.
- [ ] Пустые состояния: нет тем, нет сообщений.
- [ ] Фильтры тем: активные, непрочитанные, мои, с упоминаниями.

### 3.2 Сообщения

- [ ] Отправка текста.
- [ ] Вложения (изображения/документы/аудио-файлы как вложения, без voice message UX).
- [ ] Редактирование своего сообщения.
- [ ] Мягкое удаление своего сообщения.
- [ ] Ответ на сообщение (reply).
- [ ] Цитирование сообщения.
- [ ] Закрепление сообщений.
- [ ] Реакции emoji.
- [ ] Упоминания пользователей/ролей/всех в комнате.
- [ ] Предпросмотр ссылок.
- [ ] Форматирование: жирный, курсив, код, спойлер.
- [ ] Черновики по комнате и теме.

### 3.3 Поиск

- [ ] Поиск по серверу.
- [ ] Поиск по комнате.
- [ ] Поиск по теме.
- [ ] Фильтры: автор, дата, тип вложения, есть ссылка, есть упоминание.
- [ ] Переход к найденному сообщению с контекстом.

### 3.4 Уведомления и mьют

- [ ] Настройки уведомлений: сервер/комната/тема.
- [ ] Режимы: все, только упоминания, ничего.
- [ ] Mьют на время: 1ч, 8ч, 24ч, навсегда.
- [ ] Исключения из mьюта (критичные упоминания).
- [ ] Push + in-app уведомления.
- [ ] Inbox событий: ответы мне, упоминания меня, закрепы, модерация.

### 3.5 Unread/read

- [ ] Непрочитанные счетчики: сервер/комната/тема.
- [ ] Mark as read для темы и комнаты.
- [ ] Mark as unread от выбранного сообщения.
- [ ] Read-ack в realtime.

### 3.6 Права и модерация

- [ ] Роли и permission matrix.
- [ ] Ограничения на отправку (slowmode, readonly).
- [ ] Политики вложений (размер/тип).
- [ ] Жалобы на сообщения.
- [ ] Мут/кик/бан на уровне сервера.
- [ ] Аудит модерации.

### 3.7 Realtime и надежность

- [ ] События realtime для create/update/delete message.
- [ ] События для topic create/update/archive.
- [ ] События read/unread и notification preference changes.
- [ ] Идемпотентность отправки сообщений.
- [ ] Оффлайн-очередь отправки и повтор.
- [ ] Стабильная пагинация истории.

### 3.8 Клиентский UX

- [ ] Контекстное меню сообщения.
- [ ] Горячие клавиши для desktop.
- [ ] Mobile-адаптация списков тем и чата.
- [ ] Быстрое переключение тем через командную палитру.
- [ ] Базовая доступность (клавиатура, фокус, screen reader labels).

## 4) Приоритеты (релизные волны)

1. P0 (MVP):
- комнаты + темы,
- отправка/редактирование/удаление,
- reply,
- закрепы,
- упоминания,
- unread/read,
- базовый поиск по теме,
- базовые уведомления и mьют,
- превью ссылок,
- базовые права.

2. P1:
- расширенный поиск с фильтрами,
- inbox событий,
- архив/пин тем,
- moderation audit,
- offline queue + retry,
- улучшенные mobile flows.

3. P2:
- продвинутая автомодерация,
- webhooks/боты,
- аналитика активности и retention,
- экспорт/импорт истории.

## 5) API v1 (комнаты/темы)

- [ ] GET /v1/rooms/:roomId/topics
- [ ] POST /v1/rooms/:roomId/topics
- [ ] PATCH /v1/topics/:topicId
- [ ] POST /v1/topics/:topicId/archive
- [ ] POST /v1/topics/:topicId/unarchive

- [ ] GET /v1/topics/:topicId/messages?cursor=&limit=
- [ ] POST /v1/topics/:topicId/messages
- [ ] PATCH /v1/messages/:messageId
- [ ] DELETE /v1/messages/:messageId

- [ ] POST /v1/messages/:messageId/reply
- [ ] POST /v1/messages/:messageId/pin
- [ ] DELETE /v1/messages/:messageId/pin
- [ ] POST /v1/messages/:messageId/reactions
- [ ] DELETE /v1/messages/:messageId/reactions/:emoji

- [ ] GET /v1/search/messages?q=&scope=
- [ ] PATCH /v1/notification-settings
- [ ] POST /v1/topics/:topicId/read

## 6) Realtime contract v1

- [ ] chat.message.created
- [ ] chat.message.updated
- [ ] chat.message.deleted
- [ ] chat.message.pinned
- [ ] chat.message.unpinned
- [ ] chat.message.reaction.changed
- [ ] chat.topic.created
- [ ] chat.topic.updated
- [ ] chat.topic.archived
- [ ] chat.topic.unarchived
- [ ] chat.topic.read
- [ ] chat.notification.settings.updated

## 7) Data model v1 (черновик)

- [ ] rooms (уже есть или расширяется)
- [ ] room_topics
- [ ] room_messages
- [ ] room_message_replies
- [ ] room_message_pins
- [ ] room_message_reactions
- [ ] room_reads (per user/per topic)
- [ ] room_notification_settings (per user + scope)
- [ ] moderation_audit_log

## 8) Stage plan

### Stage 0 - Design

- [x] Зафиксировать schema и API в ADR.
- [x] Зафиксировать permission matrix.
- [x] Зафиксировать realtime события.

### Stage 1 - Backend foundation

- [x] Миграции под topics/messages/reactions/pins/reads/settings.
- [ ] Services: TopicService, MessageService, SearchService, NotificationSettingsService.
- [ ] Permission checks и audit.

### Stage 2 - API

- [x] CRUD тем.
- [x] CRUD сообщений + reply/pin/reaction.
- [x] Search API.
- [x] Notification settings API.

### Stage 3 - Frontend

- [ ] Sidebar комнаты + список тем.
- [ ] Лента темы + composer.
- [ ] Reply/mentions/pins/reactions UI.
- [ ] Search UI + filters.
- [ ] Notification/mute controls.
- [ ] Link preview UI.

### Stage 4 - Test rollout

- [ ] Deploy в test.
- [ ] Smoke: create topic -> send -> reply -> mention -> pin.
- [ ] Smoke: search по теме и комнате.
- [ ] Smoke: mute работает, критичные упоминания приходят по policy.
- [ ] Smoke: unread/read корректны после reconnect.

### Stage 5 - Prod rollout

- [ ] После green test gate и явного подтверждения: deploy в prod.

## 9) Acceptance criteria

- [ ] В каждой комнате можно работать с темами как с отдельными ветками обсуждения.
- [ ] Базовый Telegram-like UX сообщений работает стабильно (reply, mentions, pins, edit/delete).
- [ ] Превью ссылок корректно отображается и не ломает composer.
- [ ] Поиск находит сообщения по тексту и фильтрам в заданном scope.
- [ ] Настройки уведомлений и mьюты предсказуемо работают на всех уровнях scope.
- [ ] Unread/read консистентны между клиентами и после reconnect.
- [ ] Права и модерация не допускают обхода ограничений.

## 10) Ограничения выполнения

- Все rollout изменения сначала только в test.
- До выполнения acceptance в test изменения не переходят в prod.
- Минимальные и точные изменения без лишнего рефакторинга вне scope.
