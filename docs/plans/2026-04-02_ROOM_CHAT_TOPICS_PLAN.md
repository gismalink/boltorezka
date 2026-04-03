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
- 2026-04-03: Stage 3 стартовал: web chat переведен на topic-aware поток (topic selector, загрузка истории темы, отправка/edit/delete в выбранной теме).
- 2026-04-03: Stage 3 расширен: добавлено создание темы из web chat UI и локализованные тексты для topics.
- 2026-04-03: Stage 3 расширен: добавлен базовый Reply UI в web chat (кнопка ответа на сообщение + автоподстановка цитаты в composer).
- 2026-04-03: Stage 3 расширен: reply переведен в явный composer-mode с отменой и отправкой через `POST /v1/messages/:messageId/reply` для topic-чата.
- 2026-04-03: Stage 3 расширен: добавлены reply metadata в topic messages/realtime и inline preview "ответ на" в web chat ленте.
- 2026-04-03: Stage 3 расширен: добавлен базовый Pin/Reaction UI в web chat (toggle pin, toggle 👍 reaction, topic-only guard).
- 2026-04-03: Stage 3 расширен: добавлена realtime синхронизация pin/reaction UI (`chat.message.pinned|unpinned|reaction.changed`) для активной topic-комнаты.
- 2026-04-03: Stage 3 расширен: добавлен базовый Mentions UI в web chat (кнопка @mention в message actions + подсветка @упоминаний в ленте).
- 2026-04-03: Stage 3 расширен: добавлен Search UI + filters в web chat (scope topic/room/all, фильтры mentions/attachments, вывод результатов).
- 2026-04-03: Stage 3 расширен: Search UI дополнен фильтрами author/date и client-side фильтром "есть ссылка" (backend `hasLink` filter пока не реализован отдельно).
- 2026-04-03: Stage 2/3 расширен: поиск дополнен backend-фильтрами `hasLink` и `attachmentType=image`; web UI переведен на server-side фильтрацию ссылок и типа вложения.
- 2026-04-03: Stage 3 расширен: Search UI дополнен scope `server` и переходом к найденному сообщению с подтягиванием контекста (автонавигация в room/topic + дозагрузка history до target message).
- 2026-04-03: Stage 3 расширен: добавлены Notification/mute controls в web chat (mode all/mentions/none + mute 1h/8h/24h/forever).
- 2026-04-03: Stage 3 расширен: Notification scope в web chat доведен до `server|room|topic` (единый UI + payload для server-level settings).
- 2026-04-03: Stage 2/3 расширен: в notification settings добавлен флаг `allowCriticalMentions` (исключения из mute для критичных упоминаний) + UI toggle в web chat.
- 2026-04-03: Stage 2/3 расширен: добавлен inbox foundation (`notification_inbox`, API list/read/read-all) и генерация inbox-событий для reply/mention/pin c учетом mute/settings.
- 2026-04-03: Stage 3 расширен: добавлена in-app Inbox панель в web chat (обновление, mark read/all read, переход к сообщению по room/topic/message context).
- 2026-04-03: Stage 3 расширен: добавлен базовый Link preview UI в web chat (client-side preview первого URL в сообщении).
- 2026-04-03: Stage 3 расширен: добавлены unread/read controls в web chat (unread счетчики тем в селекторе + mark topic/room as read).
- 2026-04-03: Stage 3 расширен: добавлена realtime обработка `chat.topic.read` в web runtime для синхронизации unread state текущего пользователя.
- 2026-04-03: Stage 3 расширен: добавлен `mark unread from message` в web chat actions (через `lastReadMessageId` при topic read update).
- 2026-04-03: Stage 3 расширен: добавлены базовые unread counters в навигации (badge комнаты + server unread summary на основе загруженных topic counters).
- 2026-04-03: Stage 3 расширен: unread counters для room/server переведены на prefetch topics по всем комнатам активного сервера (+ sync активной комнаты в realtime flow).
- 2026-04-03: Stage 3 расширен: добавлен realtime increment unread counters для неактивных room/topic при входящих `chat.message` (без ожидания следующего prefetch).
- 2026-04-03: Stage 3 расширен: `chat.topic.read` realtime decrement unread теперь применяется к целевой комнате по `roomId` (через roomId->roomSlug map), а не только к активной.
- 2026-04-03: Stage 3 расширен: добавлен периодический background refresh unread только для активной комнаты и комнат с ненулевым unread (без полного обхода всех комнат на каждом цикле).
- 2026-04-03: Stage 3 расширен: для background refresh unread добавлены jitter + exponential backoff при ошибках сети/API.
- 2026-04-03: Stage 3 расширен: для unread prefetch/refresh добавлен limit concurrency (батчи запросов `roomTopics`, чтобы снизить API burst на больших серверах).
- 2026-04-03: Stage 3 расширен: добавлен in-memory TTL cache (`roomId -> unreadCount`) в unread prefetch/refresh, чтобы уменьшить повторные API-запросы в коротком окне.
- 2026-04-03: Stage 3 расширен: добавлены lightweight unread observability metrics в runtime-логи (cache hit/miss, размер выборки rooms, duration prefetch/refresh, failures/backoff).
- 2026-04-03: Stage 3 расширен: добавлена периодическая summary-сводка unread метрик (rolling aggregation по циклам prefetch/refresh) для упрощения мониторинга эффективности.
- 2026-04-03: Stage 3 расширен: unread tuning-параметры (refresh/cache/concurrency/metrics summary interval) вынесены в `appConfig` с поддержкой `VITE_*` overrides.
- 2026-04-03: Stage 3 расширен: добавлены пустые состояния (no topics / no messages) с визуальными подсказками в web chat.
- 2026-04-03: Stage 3 расширен: добавлен topic edit/archive UI (переименование, архивация/разархивация темы) + API wrappers `updateTopic`, `archiveTopic`, `unarchiveTopic`.
- 2026-04-03: Stage 3 расширен: добавлено контекстное меню сообщения в web chat (reply/mention/unread-from-here/pin-reaction/edit-delete) с keyboard/outside-click close.
- 2026-04-03: Stage 3 расширен: улучшена mobile-адаптация списков тем и чата (responsive layout для topic/search/notification/composer, touch-first message actions menu, компактная mobile-типографика и отступы).
- 2026-04-03: Stage 3 расширен: добавлен quick topic switcher через командную палитру в chat panel (поиск тем по названию + быстрый переход Enter/кликом).
- 2026-04-03: Stage 3 расширен: добавлена базовая доступность chat/topic UI (aria-label/live regions, menu/listbox semantics, aria-expanded/aria-controls, keyboard-friendly palette navigation).
- 2026-04-03: Stage 3 расширен: закрепленные темы стабильно поднимаются вверх в topic selector и topic palette (pinned-first ordering + визуальная pin-маркировка).
- 2026-04-03: Stage 3 расширен: добавлены desktop hotkeys в chat panel (T/Cmd+K переключение тем, R reply, E edit latest own, M mark room read) с защитой от конфликтов во время ввода.
- 2026-04-03: Stage 3 расширен: добавлен topic filter selector в chat panel (all/unread/pinned/archived) для быстрого сужения списка тем и навигации.
- 2026-04-03: Stage 3 расширен: добавлен фильтр `active` (неархивные темы); для `my/mentions` в текущем API topics пока нет достаточных полей (нужен отдельный backend-инкремент).
- 2026-04-03: Stage 2/3 расширен: в topics payload добавлены `createdBy` и `mentionUnreadCount`; включены фильтры тем `my` и `mentions` в web chat.
- 2026-04-03: Stage 3 расширен: добавлено inline-форматирование сообщений в web chat (`**bold**`, `*italic*`, `` `code` ``, `||spoiler||`).
- 2026-04-03: Stage 3 расширен: добавлены черновики composer по скоупу user/server/room/topic с автосохранением и восстановлением при переключении комнаты/темы.
- 2026-04-03: Stage 3 расширен: добавлено цитирование сообщения в composer из message actions/context menu.
- 2026-04-03: Stage 2/3 расширен: добавлен inbox claim endpoint (`POST /v1/notifications/inbox/:eventId/claim`) и runtime system notifications для web+desktop с cross-client dedupe через Redis NX claim.
- 2026-04-03: Stage 2/3 расширен: добавлен Web Push foundation (subscriptions API + `sw.js` + browser subscription registration) и backend push delivery при создании inbox-события.
- 2026-04-03: Stage 2/3 расширен: добавлены moderation inbox events (`room.kick`, `room.move`, `server/service ban apply/revoke`) как critical события с push/inbox доставкой.
- 2026-04-03: Stage 2/3 расширен: добавлены realtime events `chat.topic.created|updated|archived|unarchived` и `chat.notification.settings.updated` с обработкой в web runtime.
- 2026-04-03: Stage 2/3 расширен: websocket naming для сообщений выровнен до `chat.message.created|updated|deleted` (web runtime оставлен backward-compatible со старыми именами).
- 2026-04-03: Stage 2/3 верифицирован: chat idempotency включена на WS (`idempotencyKey` + Redis dedupe), client имеет in-memory offline queue/retry на reconnect, history/search используют tuple cursor `(created_at,id)` для стабильной пагинации.
- 2026-04-03: Stage 2/3 расширен: offline queue/retry для `chat.send` переведена на persisted localStorage queue (hydration after reload + TTL pruning + replay on reconnect).
- 2026-04-03: Stage 2/3 расширен: добавлен `GET /v1/servers/:serverId/audit` (owner/admin) для moderation/server audit log с actor/target/meta полями.
- 2026-04-03: Stage 2/3 усилен: ограничения отправки readonly/slowmode унифицированы по транспорту (WS/topic/upload), upload flow теперь проверяет room send policy и использует общий slowmode key.
- 2026-04-03: Stage 2/3 усилен: добавлена единая role/permission matrix (`GET /v1/servers/:serverId/permissions/me`) и web runtime переведен на server-resolved effective permissions с fallback.
- 2026-04-03: Stage 2/3 расширен: добавлены жалобы на сообщения (`POST /v1/messages/:messageId/report`) с записью в `room_message_reports` и `moderation_audit_log`, в web chat добавлена action-кнопка Report.
- 2026-04-03: Stage 2/3 уточнен: server custom roles оставлены как badge-only (без влияния на permissions); матрица прав опирается только на глобальные и базовые server roles.
- 2026-04-03: Stage 2/3 расширен: политики вложений усилены (тип+размер на upload init/finalize), `message_attachments.type` расширен до `image|document|audio`, web chat отображает document/audio вложения как downloadable элементы.
- 2026-04-03: Stage 3 расширен: в composer добавлен file picker для вложений (image/document/audio) с policy-aware ошибками по размеру/типу, inline удалением выбранного файла и поддержкой upload в topic-режиме.
- 2026-04-03: Stage 2/3 расширен: добавлен server-level mute/timeout (`POST/DELETE /v1/servers/:serverId/mutes*`) с enforcement в send transport (WS/topic/upload), audit/inbox событиями и единым `ServerMemberMuted` отказом.
- 2026-04-03: Stage 4 проверка запущена в test через GitOps (`deploy-test-and-smoke`), деплой успешен, но postdeploy gate упал на внешнем TURN TLS check (`TURN_CERT_DOMAIN:5349` из server env), rollout помечен fail до стабилизации gate/переопределения smoke-профиля.
- 2026-04-03: В test раскатан `origin/feature/room-chat-topics-v1` на SHA `77b3822`; последние локальные изменения ветки еще не зафиксированы в git ref и не проверены в test.
- 2026-04-03: В test повторно раскатана актуальная ветка на SHA `d6ba606`; фиксирован web runtime crash (`activeTopicId is not defined`) и обновлен realtime smoke на поддержку `chat.message.created`.
- 2026-04-03: Postdeploy smoke в non-strict режиме (`SMOKE_TURN_TLS_STRICT=0`) прошел до конца (`SMOKE_STATUS=pass`), но строгий gate `deploy-test-and-smoke` все еще падает на внешнем TURN TLS check (`TURN_CERT_DOMAIN:5349`).
- 2026-04-03: Stage 4 повторно проверен в test на SHA `bd6439c`; `deploy-test-and-smoke` завершен успешно (`[deploy-test-smoke] done`), strict TURN TLS gate пройден, RNNoise gate скипнут по новой default-policy (`SMOKE_WEB_RNNOISE_BROWSER=0`).

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

- [x] Список серверов и комнат.
- [x] Список тем в комнате.
- [x] Создание/редактирование/архивирование темы.
- [x] Закрепление важных тем сверху списка.
- [x] Пустые состояния: нет тем, нет сообщений.
- [x] Фильтры тем: активные, непрочитанные, мои, с упоминаниями.

### 3.2 Сообщения

- [x] Отправка текста.
- [x] Вложения (изображения/документы/аудио-файлы как вложения, без voice message UX).
- [x] Редактирование своего сообщения.
- [x] Мягкое удаление своего сообщения.
- [x] Ответ на сообщение (reply).
- [x] Цитирование сообщения.
- [x] Закрепление сообщений.
- [x] Реакции emoji.
- [x] Упоминания пользователей/ролей/всех в комнате.
- [x] Предпросмотр ссылок.
- [x] Форматирование: жирный, курсив, код, спойлер.
- [x] Черновики по комнате и теме.

### 3.3 Поиск

- [x] Поиск по серверу.
- [x] Поиск по комнате.
- [x] Поиск по теме.
- [x] Фильтры: автор, дата, тип вложения, есть ссылка, есть упоминание.
- [x] Переход к найденному сообщению с контекстом.

### 3.4 Уведомления и mьют

- [x] Настройки уведомлений: сервер/комната/тема.
- [x] Режимы: все, только упоминания, ничего.
- [x] Mьют на время: 1ч, 8ч, 24ч, навсегда.
- [x] Исключения из mьюта (критичные упоминания).
- [x] Push + in-app уведомления.
- [x] Inbox событий: ответы мне, упоминания меня, закрепы, модерация.

### 3.5 Unread/read

- [x] Непрочитанные счетчики: сервер/комната/тема.
- [x] Mark as read для темы и комнаты.
- [x] Mark as unread от выбранного сообщения.
- [x] Read-ack в realtime.

### 3.6 Права и модерация

- [x] Роли и permission matrix.
- [x] Ограничения на отправку (slowmode, readonly).
- [x] Политики вложений (размер/тип).
- [x] Жалобы на сообщения.
- [x] Мут/кик/бан на уровне сервера.
- [x] Аудит модерации.

### 3.7 Realtime и надежность

- [x] События realtime для create/update/delete message.
- [x] События для topic create/update/archive.
- [x] События read/unread и notification preference changes.
- [x] Идемпотентность отправки сообщений.
- [x] Оффлайн-очередь отправки и повтор.
- [x] Стабильная пагинация истории.

### 3.8 Клиентский UX

- [x] Контекстное меню сообщения.
- [x] Горячие клавиши для desktop.
- [x] Mobile-адаптация списков тем и чата.
- [x] Быстрое переключение тем через командную палитру.
- [x] Базовая доступность (клавиатура, фокус, screen reader labels).

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

- [x] GET /v1/rooms/:roomId/topics
- [x] POST /v1/rooms/:roomId/topics
- [x] PATCH /v1/topics/:topicId
- [x] POST /v1/topics/:topicId/archive
- [x] POST /v1/topics/:topicId/unarchive

- [x] GET /v1/topics/:topicId/messages?cursor=&limit=
- [x] POST /v1/topics/:topicId/messages
- [x] PATCH /v1/messages/:messageId
- [x] DELETE /v1/messages/:messageId

- [x] POST /v1/messages/:messageId/reply
- [x] POST /v1/messages/:messageId/pin
- [x] DELETE /v1/messages/:messageId/pin
- [x] POST /v1/messages/:messageId/reactions
- [x] DELETE /v1/messages/:messageId/reactions/:emoji

- [x] GET /v1/search/messages?q=&scope=
- [x] PATCH /v1/notification-settings
- [x] POST /v1/topics/:topicId/read

## 6) Realtime contract v1

- [x] chat.message.created
- [x] chat.message.updated
- [x] chat.message.deleted
- [x] chat.message.pinned
- [x] chat.message.unpinned
- [x] chat.message.reaction.changed
- [x] chat.topic.created
- [x] chat.topic.updated
- [x] chat.topic.archived
- [x] chat.topic.unarchived
- [x] chat.topic.read
- [x] chat.notification.settings.updated

## 7) Data model v1 (черновик)

- [x] rooms (расширено под server/topic flow)
- [x] room_topics
- [x] room_messages (фактически `messages` + `topic_id`)
- [x] room_message_replies
- [x] room_message_pins
- [x] room_message_reactions
- [x] room_reads (per user/per topic)
- [x] room_notification_settings (per user + scope)
- [x] moderation_audit_log

## 8) Stage plan

### Stage 0 - Design

- [x] Зафиксировать schema и API в ADR.
- [x] Зафиксировать permission matrix.
- [x] Зафиксировать realtime события.

### Stage 1 - Backend foundation

- [x] Миграции под topics/messages/reactions/pins/reads/settings.
- [x] Services: TopicService, MessageService, SearchService, NotificationSettingsService.
- [x] Permission checks и audit.

### Stage 2 - API

- [x] CRUD тем.
- [x] CRUD сообщений + reply/pin/reaction.
- [x] Search API.
- [x] Notification settings API.

### Stage 3 - Frontend

- [x] Sidebar комнаты + список тем.
- [x] Лента темы + composer.
- [x] Reply/mentions/pins/reactions UI.
- [x] Search UI + filters.
- [x] Notification/mute controls.
- [x] Link preview UI.

### Stage 4 - Test rollout

- [x] Deploy в test.
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
