# План: Telegram-like Chat Execution
Date: 2026-04-09
Status: Closed
Closed At: 2026-04-11
Scope: Эволюция realtime-чата до Telegram-like консистентности (sequence/gap-recovery, strict read pointers, mentions flow, around-anchor history, delivery reliability) в рамках apps/api и apps/web без rollout в prod до полной приемки в test.

## 0) Контекст

- Уже исправлены базовые проблемы: server source of truth для last-seen, realtime mentions в HTTP-ветках, read deltas, начальная around-unread загрузка в topic.
- Следующий шаг для Telegram-like UX: устранить рассинхрон при потере/перестановке realtime-событий и формализовать поведение read/mentions/history.
- Ограничение по процессу: сначала feature -> test, smoke обязателен, prod только после acceptance в test.

## 1) Цели

- Достичь детерминированной обработки realtime событий на клиенте: пропуск/рассинхрон детектируется и автоматически приводит к reconciliation.
- Обеспечить устойчивое совпадение unread/mentions между клиентом и сервером после reconnect и при multi-device сценариях.
- Формализовать загрузку истории вокруг anchor и поведение divider без клиентских догадок.

## 2) Workstreams

### 2.1 Realtime sequence и gap-recovery (P0)

- [x] Добавить технический каркас sequence в server->client realtime envelope и клиентский gap detector (logging).
- [x] Добавить server-side monotonic sequence source с областью действия (room/topic) и стабильно выдавать sequence для chat-событий.
- [x] Реализовать baseline клиентский recovery при gap: reconcile активного topics/messages с throttling.
- [x] Добавить telemetry: gap count, recovery success rate, mean recovery latency.

### 2.2 Read pointers и counter consistency (P0)

- [x] Ввести strict monotonic read pointer (max message position) и защиту от устаревших read-команд.
- Прогресс 2026-04-10: в `markTopicRead` добавлен monotonic stale-guard по позиции сообщения (`created_at` + tie-break по `message_id`) с no-op для устаревших read-команд.
- [x] Закрепить server-first counter update через deltas/snapshots без локальной переоценки.
- Прогресс 2026-04-10: в `useChatPanelReadState` удалены локальные unread override/recalc ветки; UI опирается на server counters и server-driven reconciliation.
- [x] Добавить сценарные тесты на race send/read/reconnect.
- Прогресс 2026-04-10: `smoke:realtime` дополнен сценарным race-check: out-of-order `POST /topics/:id/read` (newest -> stale) перед reconnect с обязательной проверкой, что `lastReadMessageId` не откатывается и stale-команда возвращает `unreadDelta=0`, `mentionDelta=0`.
- Прогресс 2026-04-10: финальная проверка в `test` на SHA `8fb3176c6a42cb7bb1ab4fca038118712907644f`: `deploy:test:smoke` = pass; отдельно прогнан `smoke:realtime` с fresh bootstrap двух пользователей (`SMOKE_AUTH_TOTAL_USERS=2`) — `reconnectReadRaceChecked=true`, `reconnectReadRaceOk=true`, `reconnectDriftChecked=true`, `reconnectDriftOk=true`.

### 2.3 Mentions как отдельный поток (P1)

- [x] Отделить mentions navigation/read от обычного unread.
- Прогресс 2026-04-10: разорвана связка mentions с `topic read` (API+web): `mention_unread_count` больше не фильтруется через `room_reads.last_read_at`; realtime `chat.topic.read` на клиенте больше не обнуляет mention counters; smoke `smoke:chat:anchor-jump` дополнен проверками, что `mentionUnreadCount` не очищается после `POST /topics/:id/read` и становится `0` только после `POST /topics/:id/unread-mentions/read-all`.
- [x] Добавить API для unread mentions list и mark mentions read (topic-aware).
- [x] Обновить UI/клиентский стейт: @-индикатор и пошаговая навигация по mention history.

### 2.4 Around-anchor history и jump semantics (P1)

- [x] Формализовать API around anchor (anchorMessageId + before/after window) и использовать его в search/mentions jump.
- Прогресс 2026-04-10: добавлены `anchorMessageId`, `aroundWindowBefore`, `aroundWindowAfter` в `GET /v1/topics/:topicId/messages`; web jump-flow (поиск + mentions) использует server-driven around-anchor загрузку с параметризуемым окном.
- [x] Убрать остаточные локальные fallback-эвристики divider позиционирования.
- [x] Добавить acceptance-тесты для сценариев unread=0, unread>0, jump-to-message.
- Прогресс 2026-04-10: добавлены unit-тесты around-anchor jump-path в `apps/web/src/services/chatController.test.ts` (форвардинг окна + обработка ошибок/пустого ввода).
- Прогресс 2026-04-10: добавлен smoke `smoke:chat:anchor-jump` и включен в postdeploy (`SMOKE_CHAT_ANCHOR_JUMP`, default=1):
	- проверяет unread=0 + anchor jump в single-actor режиме,
	- при наличии второго токена (`SMOKE_TEST_BEARER_TOKEN_SECOND`) дополнительно проверяет unread>0 с `aroundUnreadWindow` и переходом по `anchorMessageId`.
- Прогресс 2026-04-10: в `useChatPanelReadState` удалён локальный backfill/позиционный fallback для divider; отображение divider переведено в server-driven режим через `unread_divider_anchor`.

### 2.5 Delivery reliability и idempotency (P2)

- [x] Довести единый idempotency+ack/nack policy для send/edit/delete/reply/reaction/pin.
- Прогресс 2026-04-10: операции send/edit/delete/reply/reaction/pin/report переведены на единый `executeChatOperation`/`executeChatOperationWithError` policy-контур (WS ack/nack + HTTP fallback по retryable ошибкам).
- [x] Реализовать retry policy только для retryable кодов и защиту от дубликатов при reconnect.
- Прогресс 2026-04-10: в `chatOperationExecutor` ужесточена классификация transient WS-ошибок — fallback разрешён только для явных retryable кодов/состояний (`ack_timeout`, `ws_not_connected`, `ws_disposed`, `TooManyRequests`, `ServiceUnavailable`, `GatewayTimeout`) + добавлены unit-тесты на retryable/non-retryable ветки.
- Прогресс 2026-04-10: в `useWsEventAcks` на локальном `ack_timeout` добавлен `clearPendingRequest(requestId)` перед reject, чтобы исключить поздний resend того же WS-запроса после reconnect параллельно с HTTP fallback.
- [x] Добавить интеграционные тесты на flaky network.
- Прогресс 2026-04-10: добавлены flaky-network сценарии в `chatTransportCommands.test.ts`:
	- transient `ws_not_connected` -> HTTP fallback, затем успешный WS recovery без повторного HTTP fallback,
	- смешанный кейс retryable (`GatewayTimeout`) + non-retryable (`Forbidden`) с проверкой, что fallback выполняется только для retryable ошибки.

## 3) Приоритеты

1. P0: Realtime sequence/gap-recovery + strict read consistency.
2. P1: Mentions flow + around-anchor semantics.
3. P2: Delivery reliability hardening.

## 4) Acceptance criteria

- [x] При искусственном пропуске realtime-событий клиент детектирует gap и восстанавливает счетчики/историю без ручного refresh.
- [x] После reconnect на втором устройстве unread/mentions совпадают с сервером (нулевой drift в smoke-сценариях).
- [x] Divider открывается около server-provided anchor в сценариях unread>0 и не ломается при backfill.
- [x] @-счетчик изменяется только по mention-read событиям/операциям.
- [x] Все проверки проходят в test: api typecheck, web build, профильные тесты, smoke.
- Прогресс 2026-04-10: `deploy:test:smoke` для `feature/ws-version-sync-datute` (SHA `639d3945b42e27b065326a03915d2cf4a3c8eb99`) завершён успешно; `smoke:chat:anchor-jump`, `smoke:realtime`, `smoke:web:version-cache`, auth/api/browser smoke — зелёные.
- Прогресс 2026-04-10: `smoke:chat:anchor-jump` расширен проверкой mention-flow (SHA `5d824c7c9fe03880ab7691c60683f0d38c32b0f6`): mention остаётся в `unread-mentions` после `POST /topics/:id/read` и очищается только через `POST /topics/:id/unread-mentions/read-all` (`mentionReadFlowChecked=true`).
- Прогресс 2026-04-10: `smoke:realtime` расширен drift-gate после reconnect (SHA `c6b1a2396ab14bb80327f4dfdce42763e1c0d5cb`): `reconnectDriftChecked=true`, `reconnectDriftOk=true`, снимки до/после reconnect совпадают (`unreadCount=2`, `mentionUnreadCount=1`, `unreadMentionsItems=1`).
- Прогресс 2026-04-10: `deploy:test:smoke` для `feature/ws-version-sync-datute` (SHA `eb25bfa72ec0587766367135a7db9a8ef2d1dd2d`) завершён успешно вместе с новым browser gate: `smoke:web:gap-recovery:browser` = ok, telemetry `ws.realtime.gap.detected/ws.realtime.gap.recovered`, `recovery room messages requests observed: 1`, `mutated seq: 3 -> 5 (chat.message.created)`.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.

## 6) Закрытие плана

- План закрыт как выполненный: все пункты workstreams и acceptance criteria отмечены `x`.
- Итоговая валидация проведена в `test` через `deploy:test:smoke` и профильные smoke/check сценарии.
- Дальнейшие изменения по чату вести отдельными итерациями и отдельными планами, без переоткрытия текущего документа.
