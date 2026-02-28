# Discord-like Channel Tree Plan (Boltorezka)

Цель: получить UX и операционные возможности, близкие к Discord sidebar:
- категории,
- текстовые каналы,
- голосовые комнаты,
- управление структурой через UI и API.

## 1) Scope и принципы

- Реализация идёт поэтапно, без «big bang».
- Сначала `test`, затем merge, только потом возможный `prod` rollout.
- Минимальные совместимые изменения: существующие `rooms` не ломаем, мигрируем постепенно.

## 2) Target UX (MVP parity)

- Левый sidebar со сгруппированными блоками (как на примере):
  - category header,
  - список text channels,
  - список voice channels.
- Активный канал визуально выделен.
- Кнопка `+` у категории для создания канала.
- Кнопка `+` у корня для создания категории.
- Для voice-канала:
  - join/leave по клику,
  - отображение участников.
- Для text-канала:
  - open channel,
  - история + отправка сообщений.

## 3) Data model (phase-safe)

## 3.1 Новые сущности

- `channel_categories`
  - `id uuid pk`
  - `slug text unique`
  - `title text`
  - `position int`
  - `is_collapsed_default boolean`
  - `created_by uuid`
  - `created_at timestamptz`

- `channels`
  - `id uuid pk`
  - `category_id uuid null references channel_categories(id)`
  - `slug text unique`
  - `title text`
  - `kind text check(kind in ('text','voice'))`
  - `position int`
  - `is_public boolean`
  - `is_archived boolean`
  - `created_by uuid`
  - `created_at timestamptz`

## 3.2 Совместимость с текущим кодом

- На переходный период endpoint `/v1/rooms` возвращает только `text` channels (или адаптерный flat-list).
- Existing realtime room logic переходит с `roomSlug` на `channelSlug` без изменения wire-contract на первом шаге.

## 4) API contract additions

- `GET /v1/channels/tree`
  - Возвращает категории и каналы в порядке `position`.
- `POST /v1/categories`
- `PATCH /v1/categories/:id`
- `POST /v1/channels`
- `PATCH /v1/channels/:id`
- `POST /v1/channels/reorder`

Права:
- read: authenticated users,
- write/reorder: `admin`/`super_admin`.

## 5) Realtime changes

- Presence привязывается к `voice` channel.
- `room.join` / `room.leave` остаются, но semantic alias:
  - text channel join = subscription,
  - voice channel join = media + signaling presence.
- Добавить server event для sidebar актуализации:
  - `channel.updated`, `category.updated` (MVP можно polling + manual refresh).

## 6) Web implementation plan

1. Sidebar tree component
   - `ChannelTreeSidebar.tsx`
   - `CategorySection.tsx`
   - `ChannelRow.tsx`
2. State/controller
   - `channelTreeController.ts` для load/create/move/rename/archive.
3. Create menus
   - `CreateCategoryModal` (или inline row для MVP)
   - `CreateChannelModal` (тип text/voice)
4. Integrate with existing chat/call panels
   - выбор text канала -> chat panel
   - выбор voice канала -> call panel + presence

## 7) Smoke & acceptance

Минимальный smoke после деплоя в `test`:
1. Создать категорию.
2. Создать в ней text и voice канал.
3. Убедиться, что tree порядок стабилен после reload.
4. Зайти в text канал и отправить сообщение.
5. Зайти в voice канал и проверить presence/leave.

## 8) Rollout strategy

- Phase A: backend schema + read-only tree endpoint.
- Phase B: web read-only sidebar tree.
- Phase C: admin create/edit/reorder.
- Phase D: voice/text behavioral parity + smoke automation.
- После успешного `test` smoke — только then decision на `prod`.
