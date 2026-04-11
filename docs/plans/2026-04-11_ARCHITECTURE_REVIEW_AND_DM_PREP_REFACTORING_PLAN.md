# План: Архитектурное ревью и рефакторинг перед реализацией DM/контактов
Date: 2026-04-11
Scope: глобальный аудит проекта boltorezka + план рефакторинга + подготовка к реализации личных сообщений и контакт-листа.

## 0) Контекст

- Проект растет: chat realtime, topics, unread, mentions, звонки, desktop.
- Впереди крупная фича — личные сообщения (DM) и контакт-лист (план: `2026-03-20_DIRECT_MESSAGES_PLAN.md`).
- Текущая архитектура хороша на 80%, но есть god-файлы, глубокий проброс props, дублирование и пробелы в тестах.
- Цель этого плана: зафиксировать все находки и последовательно устранить блокеры перед стартом DM.

---

## 1) Находки архитектурного ревью

### 1.1 Backend (`apps/api/src/`)

#### God-файлы (CRITICAL)

| Файл | Строк | Проблема |
|------|-------|----------|
| `routes/realtime-chat.ts` | ~1226 | Вся бизнес-логика чата в одном route-файле: room resolution, permission checks, DB queries, broadcast, idempotency cache. |
| `services/room-topic-messages-service.ts` | ~1248 | CRUD + access control + read pointer + permission checks. |

#### Дублирование кода (IMPORTANT)

| Паттерн | Где повторяется | Решение |
|---------|----------------|---------|
| Нормализация roomSlug/userId (trim+slice) | realtime-chat.ts, chat-uploads.ts, invites.ts (3+) | Вынести в `validators.ts` |
| Проверка роли `admin/super_admin` | room-topic-messages-service, auth middleware, permissions (3+) | Enum `ROLES` в config |
| Room access checks (hidden/public/membership) | realtime-chat.ts, room-topic-messages-service (2+) | Выделить `room-access-service.ts` |
| Error mapping (domain error → WS nack) | realtime-chat.ts (2 switch-блока) | Error mapper registry |
| Тип `SocketState` | realtime-message-handler.ts, realtime-chat-events.ts, realtime.ts (3+) | Перенести в `ws-protocol.types.ts` |

#### Нарушение слоёв (IMPORTANT)

- `realtime-chat.ts` содержит прямые DB-запросы, Redis-кеш и broadcast в route handler.
- **Нужно:** выделить `RoomChatService` с методами `sendMessage()`, `editMessage()` и т.д.

#### Безопасность (IMPORTANT)

- Нет лимита macconn на WS (DoS risk) → добавить `maxConnectionsPerUser`.
- Нет query timeout для WebSocket handlers → добавить 5s timeout.
- Нет audit trail для auth событий → добавить логирование login/logout/role change.

#### Пробелы в тестах (CRITICAL)

| Зона | Покрытие | Действие |
|------|---------|----------|
| `realtime-chat.ts` (1226 строк) | ❌ Нет | Написать `realtime-chat.test.ts` |
| Permission matrix (room access) | ❌ Нет | Написать `permission-matrix.test.ts` |
| Error-recovery (Redis down, DB timeout) | ❌ Нет | Добавить error-scenario тесты |

#### Что хорошо ✅

- Отличное разделение realtime-файлов (protocol, io, lifecycle, broadcast, auth, events — по 1 файлу на concern).
- Dependency injection в handlers (testable).
- Типы контрактов (`api-contract.types.ts`, `ws-protocol.types.ts`) — единый источник.
- Миграции 27шт, последовательные, чистые.
- Idempotency на Redis 120s TTL.
- Config-driven feature flags.

---

### 1.2 Frontend (`apps/web/src/`)

#### God-компоненты (CRITICAL)

| Компонент | Строк | Проблема |
|-----------|-------|----------|
| `RoomRow.tsx` | ~975 | Context menu, member list, audio indicator, drag-and-drop, ~40 useState+useCallback. |
| `ServerProfileModal.tsx` | ~500+ | 8 вкладок в одном файле (Users, Roles, Server, Telemetry, Desktop...). |
| `ChatPanel.tsx` | ~800+ | Topics, search, unread mention nav, timeline, composer, typing — всё в одном. |

#### Props drilling (IMPORTANT)

- **ChatPanel:** 50+ props.
- **ServerProfileModal:** 80+ props.
- Глубина проброса: 5–7 уровней (App → Shell → Panel → Section → Message → Button).
- **Нет React Context** — всё идёт через props.

#### State management (IMPORTANT)

- `useAppShellRuntime` → каскад 30+ хуков → любое изменение наверху перерендеривает всё.
- Нет context boundaries для feature-scoped state.
- `useAppCoreState` смешивает auth + desktop handoff.

#### Дублирование (MINOR)

| Паттерн | Повторения | Решение |
|---------|-----------|---------|
| Context menu positioning (refs + state) | 8+ мест | Вынести `useContextMenuPosition` |
| Confirmation dialogs (useState + confirm) | 5+ мест | Вынести `useConfirmDialog` |
| Cursor-based list loading | 4+ мест | Общий `usePaginatedList` |

#### CSS (MINOR)

- `styles.css` ~1700 строк, единый файл.
- Tailwind установлен, но используется на ~30%.
- Pixel-art стили и анимации require custom CSS (не мигрируются).

#### Bundle (MINOR)

- LiveKit (~300KB) загружается для всех, даже если голосовые звонки не нужны.
- Нет code-splitting / lazy routes.

#### Что хорошо ✅

- Feature-based структура компонентов (chatPanel/, roomsPanel/, uicomponents/).
- Хуки хорошо разделены по доменам (realtime/, voice/, rtc/, media/).
- Типы централизованы в `domain/index.ts`.
- 19 тестовых файлов на фронте, покрытие key-path.

---

### 1.3 Инфраструктура и проект

#### Что отлично ✅

- **Docs:** превосходная гигиена, 19 active + 18 completed планов, ADR, runbooks, contracts.
- **Scripts:** 79 скриптов, все с safety patterns (`set -euo pipefail`), нет мертвых.
- **Smoke tests:** 50+ интеграционных тестов, покрытие от auth до realtime.
- **Docker:** чистый multi-stage Dockerfile, compose для dev.
- **Migrations:** 27 SQL миграций, sequential, чистые.
- **Desktop:** Electron shell, auto-updater, code signing.

#### Замечания (MINOR)

| Находка | Severity |
|---------|----------|
| CI workflows только manual dispatch (не на push/PR) | Minor |
| `socket.io` + `socket.io-client` в devDeps API — spike code | Minor |
| `spikes/socketio-poc/` — можно почистить | Cosmetic |
| Root `.env.example` минимальный (5 vars) | Minor |

---

## 2) Готовность к DM/контактам

### 2.1 Что можно переиспользовать (~60%)

| Примитив | Файл(ы) | Степень |
|----------|---------|---------|
| Message timeline + rendering | `ChatMessageTimeline`, `chatMessageViewModel` | 90% reuse |
| Composer (text, attachments, reply, edit) | `ChatComposerSection`, хуки composer | 85% reuse |
| Typing indicators | `useChatTypingController`, `useChatPanelTypingBanner` | 90% reuse |
| Unread/read state | `useChatPanelReadState` | 80% reuse (адаптировать scope) |
| Notification inbox | `useChatPanelInboxNotifications` | 70% reuse |
| Message context menu | `useMessageContextMenu` | 95% reuse |
| Reactions, pinning | Хуки + API calls | 90% reuse |
| WebSocket infrastructure | `WsMessageController`, protocol | 80% reuse (добавить dm.* events) |
| Image attachments | `useChatPanelAttachmentImages` | 95% reuse |
| Search | `useChatPanelSearch` | 70% reuse (scope → thread) |

### 2.2 Что нужно создать заново (~20%)

| Абстракция | Описание |
|-----------|----------|
| `ContactsList.tsx` + `useContactsListState` | Панель контактов с поиском, unread badges |
| `DmThreadPanel.tsx` | Обёртка для 1:1 чата (header с профилем, call button) |
| `UserAvatar.tsx` + `UserProfilePopover.tsx` | Аватар и мини-профиль |
| `useDmThreadState` | State management для DM thread (messages, read, typing) |
| `DmCallOverlay.tsx` | UI звонка (ringing → connected → ended) |
| API layer `dm.*` в `api.ts` | Endpoints для contacts, threads, messages, calls, block |
| WS events `dm.*` | Парсинг/dispatch в `WsMessageController` |
| DB миграции | `dm_threads`, `dm_messages`, `dm_contacts`, `dm_user_settings`, `dm_block_list` |

### 2.3 Что нужно рефакторить перед DM (~20%)

Без этих рефакторингов DM-фича ляжет поверх уже раздутых файлов и усугубит проблемы.

---

## 3) Workstreams рефакторинга

### 3.1 WS1: Backend — выделение сервисов из realtime-chat.ts (P0) ✅

**Цель:** убрать бизнес-логику из route handler `realtime-chat.ts`.

**Статус: ВЫПОЛНЕНО** (SHA `bc1b7e5`, deploy test smoke ok 2026-04-11)

- [x] Создать `services/chat-error-mapper.ts`:
  - Единый `mapChatDomainErrorToWsNack()` (объединил 2 дублирующихся маппера).
- [x] Создать `services/room-access-service.ts`:
  - `resolveRoomById()` — получить комнату по ID (без проверки прав).
  - `resolveRoomBySlugWithAccessCheck()` — полная проверка (NSFW/hidden/private).
  - `canBypassRoomSendPolicy()` — обход send-политик для admin/owner.
  - `resolveRoomRealtimeAudienceUserIds()` — определение аудитории для broadcast.
- [x] Создать `services/room-messages-service.ts`:
  - `insertRoomMessage()`, `editRoomMessage()`, `deleteRoomMessage()`.
  - Доменные ошибки через throw (ловятся через единый error mapper).
- [x] Мигрировать handlers в `realtime-chat.ts` на вызовы service.
- [x] Уменьшить `realtime-chat.ts` с 1518 до 1146 строк (−25%, thin handlers).
- [ ] TODO на следующие итерации: `validators.ts` (нормализация строк), дальнейшее уменьшение до ~400 строк.

### 3.2 WS2: Backend — тесты критического пути (P0) ✅

- [x] `realtime-chat.test.ts` — unit-тесты для handleChatSend, handleChatEdit, handleChatDelete (12 тестов, были + 2 обновлены)
- [x] `chat-error-mapper.test.ts` — все ветки маппера (20 тестов)
- [x] `room-access-service.test.ts` — resolve, bypass, audience (16 тестов)
- [x] `room-messages-service.test.ts` — CRUD + ownership + window (9 тестов)
- [x] Lazy import fix (age-verification, server-mute) для тестов без DATABASE_URL
- [x] Deploy test → smoke ✅ (2885e9f)
- [ ] TODO: `permission-matrix.test.ts` — room visibility × membership × role комбинации
- [ ] TODO: Error-scenario tests: Redis down, DB timeout, concurrent edits

### 3.3 WS3: Frontend — разбиение god-компонентов (P0) ✅

**Статус: ВЫПОЛНЕНО** (SHA `b57123a`, deploy test smoke ok 2026-04-11)

**ChatPanel.tsx (1077 → 880, −18%):**
- [x] Выделить `useChatPanelMentionNavigation` hook — mention queue, pagination, reconciliation, jump (~155 строк)
- [x] Выделить `useChatPanelUnreadWindowExpand` hook — расширение окна непрочитанных по scroll (~115 строк)
- [x] Выделить `useChatPanelScrollToBottom` hook — кнопка scroll-to-bottom + action (~60 строк)
- [x] Убрать неиспользуемый `api` import, тип `TopicUnreadMentionNavItem`, константы `UNREAD_WINDOW_EXPAND_*`

**RoomRow.tsx (975 → 751, −23%):**
- [x] Выделить `RoomChannelSettingsPopup.tsx` — popup form настроек канала (~290 строк)
- [ ] TODO: дальнейшее разбиение (header, context menu, member tooltip, audio indicator)

**ServerProfileModal.tsx (2275 → 2075, −9%):**
- [x] Выделить `ServerVideoSettingsTab.tsx` — видео preview, эффекты, resolution, FPS, слайдеры (~280 строк)
- [x] Перенести `previewVideoRef` + useEffect(serverVideoPreviewStream) в компонент
- [x] Убрать неиспользуемый `RangeSlider` import из parent
- [ ] TODO: дальнейшее разбиение (roles, desktop, observability tabs)

### 3.4 WS4: Frontend — Context layers для props (P1) ✅

**Статус: ВЫПОЛНЕНО** (SHA `d5af5a3`, deploy test smoke ok 2026-04-11)

**Цель:** уменьшить props drilling и подготовить reusable контексты для DM.

- [x] Создать `ChatPanelContext` (React.createContext):
  - `t`, `locale`, `formatMessageTime`, `resolveAttachmentImageUrl`, `formatAttachmentSize`, `setPreviewImageUrl`
- [x] Создать `ChatMessageActionsContext`:
  - `onEditMessage`, `onDeleteMessage`, `onReplyMessage`, `onReportMessage`, `onTogglePinMessage`, `onToggleMessageReaction`
  - `insertMentionToComposer`, `insertQuoteToComposer`, `markTopicUnreadFromMessage`, `markReadSaving`
- [x] Обернуть `ChatPanel` children в providers
- [x] Убрать ~22 prop slots через 5 дочерних компонентов:
  - ChatMessageTimeline: 32→16 props (−50%)
  - ChatComposerSection: −2 (t, setPreviewImageUrl)
  - ChatPanelOverlays: −3 (t, setPreviewImageUrl, resolveAttachmentImageUrl)
  - TopicTabsHeader: −1 (t)
  - SearchPanel: −2 (t, formatMessageTime)
- [ ] TODO: `RoomsContext` (roomUnreadBySlug, roomMentionUnreadBySlug, roomMutePresetByRoomId)

### 3.5 WS5: Frontend — извлечение переиспользуемых абстракций для DM (P1) ✅

**Статус: ВЫПОЛНЕНО** (SHA `548e07a`, deploy test smoke ok)

**Цель:** подготовить building blocks, которые будут work для и rooms, и DM.

- [x] Выделить `useContextMenuPosition` hook — generic (pointerdown close, Escape, skipSelector)
  - Мигрированы 3 потребителя: useMessageContextMenu, useChatPanelTopicActions, ServerProfileModal
  - ServerProfileModal получил Escape key support (не было раньше)
- [x] Выделить `renderMessageText` + `extractFirstLinkPreview` в `utils/messageTextRenderer.ts`
  - Чистые функции: URL-линкификация, @-mention парсинг, форматирование (bold/italic/code/spoiler)
  - ChatMessageTimeline теперь импортирует из утилиты
- [ ] DEFERRED на DM-фазу: `MessageComposer` standalone (85% reuse, нужен DM context)
- [ ] DEFERRED на DM-фазу: `useThreadState` hook (70% reuse, нужны DM pagination patterns)
- [ ] DEFERRED на DM-фазу: `useUserPresence` hook (60% reuse, нужен WS refactor)

### 3.6 WS6: Backend — безопасность (P1) ✅

**Статус: ВЫПОЛНЕНО** (SHA `28c28fe`, deploy test smoke ok)

- [x] `maxConnectionsPerUser(5)` в `realtime-ws-route.ts` — закрытие с кодом 4429
- [x] `statement_timeout = 5000ms` на уровне Pool в `db.ts` — все запросы ≤ 5s
- [x] `protocolVersion: 1` в `server.ready` payload (backward-compatible)
- [x] Audit log для admin actions: promote/demote/ban/unban через `buildAuthAuditContext`

### 3.7 WS7: Cleanup (P2)

- [ ] Удалить `spikes/socketio-poc/`
- [ ] Удалить `socket.io` + `socket.io-client` из API devDeps
- [ ] Стандартизировать error codes (PascalCase everywhere)
- [ ] Выделить `SocketState` type в одно место (`ws-protocol.types.ts`)
- [ ] Добавить `ROLES` enum в config
- [ ] Подчистить `styles.css` — выделить design tokens в Tailwind config

---

## 4) Приоритеты

1. **P0 (блокируют DM):** WS1 (RoomChatService), WS2 (тесты), WS3 (god-компоненты)
2. **P1 (сильно упрощают DM):** WS4 (Context layers), WS5 (reusable abstractions), WS6 (безопасность)
3. **P2 (качество жизни):** WS7 (cleanup)

---

## 5) Порядок выполнения

```
Итерация 1 (P0 — рефакторинг backend) ✅ 2026-04-11
├── WS1: extract chat-error-mapper, room-access-service, room-messages-service ✅ (bc1b7e5)
├── realtime-chat.ts 1518→1146 строк ✅
├── WS2: 57 тестов (20+16+9+12), lazy import fix ✅ (2885e9f)
├── Deploy test → smoke ✅
└── Готово к merge в main

Итерация 2 (P0 — рефакторинг frontend) ✅ 2026-04-11
├── WS3: ChatPanel 1077→880, RoomRow 975→751, ServerProfileModal 2275→2075 ✅ (b57123a)
├── 6 новых файлов: 3 hooks + RoomChannelSettingsPopup + ServerVideoSettingsTab
├── Deploy test → smoke ✅
└── Готово к merge в main

Итерация 3 (P1 — context + reusable abstractions) ✅ 2026-04-11
├── WS4: ChatPanelContext + ChatMessageActionsContext ✅ (d5af5a3)
├── ~22 prop slots убрано, ChatMessageTimeline −50% props
├── Deploy test → smoke ✅
├── WS5: useContextMenuPosition + renderMessageText/extractFirstLinkPreview ✅ (548e07a)
├── 3 consumer migrated, 2 new util files
├── Deploy test → smoke ✅
└── Готово к merge в main

Итерация 4 (P1 + P2 — безопасность + cleanup)
├── WS6: maxConn(5), statement_timeout(5s), protocolVersion(1), audit log ✅ (28c28fe)
├── Deploy test → smoke ✅
├── WS7: spike cleanup, error codes, types dedup ← СЛЕДУЮЩИЙ
└── Deploy test → smoke → prod (стабилизация)

Итерация 5 (DM Stage 1-2 — backend)
├── DB миграции DM
├── DmThreadService, DmMessageService, DmContactService, DmBlockListService
├── DM API endpoints
├── DM WS events dispatch
└── Deploy test → smoke

Итерация 6 (DM Stage 3 — frontend)
├── ContactsList + DmThreadPanel
├── DM integration (reuse MessageRenderer, useThreadState, Composer)
├── Call UI (DmCallOverlay)
└── Deploy test → smoke → prod
```

---

## 6) Acceptance criteria

- [ ] `realtime-chat.ts` ≤ 400 строк (thin handlers)
- [ ] `ChatPanel.tsx` ≤ 300 строк
- [ ] `RoomRow.tsx` ≤ 250 строк
- [ ] `ServerProfileModal.tsx` ≤ 150 строк (tab router)
- [ ] ChatContext + RoomsContext устраняют >30 пробросов props per component
- [ ] `realtime-chat.test.ts` покрывает send/edit/delete/pin happy path + error paths
- [ ] `permission-matrix.test.ts` покрывает ≥12 комбинаций (room visibility × role × membership)
- [ ] `MessageRenderer` и `useThreadState` используются и в room chat, и в DM chat
- [ ] WS maxConnectionsPerUser enforced (smoke test)
- [ ] Все smoke тесты проходят после каждой итерации
- [ ] DM smoke (из 2026-03-20 плана Stage 4) проходит стабильно

## 7) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- Каждая итерация — отдельная feature-ветка.
- Рефакторинг не меняет внешнее поведение (behavior-preserving).
- DM фича стартует только после завершения итераций 1–3 (P0 чистый).
