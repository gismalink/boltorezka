# План: Telegram-like Chat Execution
Date: 2026-04-09
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

- [ ] Ввести strict monotonic read pointer (max message position) и защиту от устаревших read-команд.
- [ ] Закрепить server-first counter update через deltas/snapshots без локальной переоценки.
- [ ] Добавить сценарные тесты на race send/read/reconnect.

### 2.3 Mentions как отдельный поток (P1)

- [ ] Отделить mentions navigation/read от обычного unread.
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

- [ ] При искусственном пропуске realtime-событий клиент детектирует gap и восстанавливает счетчики/историю без ручного refresh.
- [ ] После reconnect на втором устройстве unread/mentions совпадают с сервером (нулевой drift в smoke-сценариях).
- [x] Divider открывается около server-provided anchor в сценариях unread>0 и не ломается при backfill.
- [ ] @-счетчик изменяется только по mention-read событиям/операциям.
- [x] Все проверки проходят в test: api typecheck, web build, профильные тесты, smoke.
- Прогресс 2026-04-10: `deploy:test:smoke` для `feature/ws-version-sync-datute` (SHA `639d3945b42e27b065326a03915d2cf4a3c8eb99`) завершён успешно; `smoke:chat:anchor-jump`, `smoke:realtime`, `smoke:web:version-cache`, auth/api/browser smoke — зелёные.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
