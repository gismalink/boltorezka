# План: звонки в личке (DM Calls 1:1)
Date: 2026-04-11
Scope: реализация аудио/видео звонков 1:1 поверх существующего DM-стека. Выделен из `2026-03-20_DIRECT_MESSAGES_PLAN.md`.

## 0) Контекст

- DM-мессенджинг реализован и задеплоен (feature/dm-v1).
- Звонки были запланированы в исходном DM-плане, но отложены: зависят от `DmCallService` и нового WebRTC/signaling слоя.
- Существующий голосовой стек (server rooms) использует SFU через LiveKit. Для DM-звонков нужен отдельный P2P или SFU путь — решение принимается в Stage 0.

## 1) Состояния звонка (state machine)

```
created → ringing → accepted → connecting → connected → ended
                      ↓                                   ↑
                   rejected ─────────────────────────────→┘
                      ↓
                   missed (timeout 30s без ответа)
```

### Финальные состояния: `ended`, `rejected`, `missed`.

## 2) Модель данных

### Таблица `dm_calls`
- `id` (uuid, pk)
- `thread_id` (uuid, fk → dm_threads.id)
- `initiator_user_id` (uuid, fk → users.id)
- `receiver_user_id` (uuid, fk → users.id)
- `mode` (enum: `audio` | `video`)
- `state` (enum: `ringing` | `accepted` | `connecting` | `connected` | `ended` | `rejected` | `missed`)
- `created_at`, `answered_at` (nullable), `ended_at` (nullable)

### Инварианты
- У пользователя не может быть более 1 активного call одновременно (`dm_call_busy`).
- Timeout `ringing → missed` через 30 сек (cron-job или in-process timer).

## 3) API контракт

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/v1/dm/threads/:threadId/calls` | Инициировать звонок |
| POST | `/v1/dm/calls/:callId/accept` | Принять входящий звонок |
| POST | `/v1/dm/calls/:callId/reject` | Отклонить входящий звонок |
| POST | `/v1/dm/calls/:callId/end` | Завершить активный звонок |

### Коды ошибок
- `dm_call_not_member` — не участник thread
- `dm_call_invalid_state` — недопустимый переход состояния
- `dm_call_busy` — пользователь уже в звонке

### Идемпотентность
- `reject` и `end` — идемпотентны (повторный вызов в финальном состоянии возвращает 200).

## 4) Realtime события (WS)

```
dm.call.invite    { callId, callerId, callerName, mode }           → получателю
dm.call.accepted  { callId }                                        → инициатору
dm.call.rejected  { callId }                                        → инициатору
dm.call.ended     { callId, reason: 'ended'|'missed'|'rejected' }  → обоим
dm.call.signal    { callId, sdp?, ice? }                           → peer (signaling)
```

## 5) Signaling архитектура (решить в Stage 0)

**Вариант A — WebRTC P2P через сервер-сигналинг:**
- Простой, без дополнительной инфраструктуры.
- Проблемы с NAT traversal (нужен STUN/TURN).
- Уже есть TURN-сервер для room calls.

**Вариант B — LiveKit room per call:**
- Переиспользует существующий LiveKit SFU.
- Каждый DM-звонок = отдельная временная LiveKit room.
- Более надёжно, но сложнее lifecycle.

**Решение принять в Stage 0 перед реализацией.**

## 6) UI/UX

### 6.1 Кнопка звонка
- В заголовке DM-панели: иконка телефона/видеокамеры.
- Неактивна если открытый DM заблокирован.

### 6.2 Состояния интерфейса

| Состояние | Отображение |
|-----------|-------------|
| `ringing` (исходящий) | Модалка «Звоним…» + кнопка «Отменить» |
| `ringing` (входящий) | Системный баннер «Входящий звонок» + «Принять» / «Отклонить» |
| `connecting` | «Соединяемся…» |
| `in_call` | Controls: mute mic, toggle camera, end call |
| `ended`/`missed` | Краткое уведомление в DM-ленте |

### 6.3 Компоненты
- `DmCallOverlay.tsx` — основной overlay для ringing/in-call состояний
- `DmIncomingCallBanner.tsx` — fixed баннер входящего звонка (поверх всего приложения)
- `useDmCallState.ts` — хук состояния звонка (внутри `DmContext` или рядом)

## 7) Этапы реализации

### Stage 0 — Design (решить signaling)
- [ ] Выбрать signaling архитектуру: P2P vs LiveKit room
- [ ] Зафиксировать детали WS event payload для `dm.call.signal`
- [ ] Написать миграцию `dm_calls` таблицы

### Stage 1 — Backend
- [ ] Миграция `dm_calls`
- [ ] `DmCallService`: start/accept/reject/end + state validation
- [ ] Timeout cron/timer (30s ringing → missed)
- [ ] Идемпотентность reject/end
- [ ] WS broadcast: `dm.call.invite`, `dm.call.accepted`, `dm.call.rejected`, `dm.call.ended`
- [ ] WS signaling relay: `dm.call.signal` (forward SDP/ICE между участниками)

### Stage 2 — API
- [ ] `POST /v1/dm/threads/:threadId/calls`
- [ ] `POST /v1/dm/calls/:callId/accept`
- [ ] `POST /v1/dm/calls/:callId/reject`
- [ ] `POST /v1/dm/calls/:callId/end`

### Stage 3 — Frontend
- [ ] `DmCallOverlay.tsx` — ringing/in-call UI
- [ ] `DmIncomingCallBanner.tsx` — входящий звонок баннер
- [ ] `useDmCallState.ts` — стейт-хук звонка
- [ ] Интеграция в `DmContext` (обработка `dm.call.*` WS событий)
- [ ] Кнопка вызова в заголовке DM-чата
- [ ] Запись информации о звонке в DM-ленте (как системное сообщение)

### Stage 4 — Test rollout
- [ ] Deploy в `test`
- [ ] Smoke: start call → accept → connected → end
- [ ] Smoke: call reject
- [ ] Smoke: call timeout (missed, 30s)
- [ ] Smoke: dm_call_busy при попытке второго звонка

## 8) Зависимости

- `feature/dm-v1` смержен в `main` (DM thread + messaging готов)
- TURN сервер работает (уже есть для room calls)
- Если LiveKit: отдельный room для каждого DM call не конфликтует с room calls

## 9) Критерии готовности

- Пользователь может инициировать аудио-звонок из DM.
- Получатель видит входящий баннер и может принять/отклонить.
- Оба участника слышат друг друга при `connected`.
- Завершение звонка корректно переводит в `ended`.
- Пропущенный звонок помечается как `missed` через 30 сек.
- Попытка второго параллельного звонка возвращает `dm_call_busy`.
