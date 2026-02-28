# Discord-like Channel Tree Plan (Boltorezka) — актуальная версия

Цель: поддерживать Discord-like sidebar и админ-управление структурой каналов в рамках текущей архитектуры `rooms + room_categories`, без несовместимых переименований.

## 1) Правила доставки (обязательно)

- Только `test` first: любое изменение сначала в `test` через GitOps.
- `prod` только после merge в `main`, smoke в `test` и explicit approval.
- Без ручных правок на сервере (GitOps-only).
- Минимальные инкременты, без «big bang» миграций.

## 2) Текущее состояние (fact-based)

### 2.1 Уже реализовано

- Data model и API работают через:
  - `room_categories`
  - `rooms` (c `kind`, `category_id`, `position`)
- Channel tree endpoint:
  - `GET /v1/rooms/tree`
- CRUD/ordering (admin/super_admin):
  - `POST /v1/room-categories`
  - `PATCH /v1/room-categories/:categoryId`
  - `POST /v1/room-categories/:categoryId/move`
  - `DELETE /v1/room-categories/:categoryId` (с защитой `CategoryNotEmpty`)
  - `POST /v1/rooms`
  - `PATCH /v1/rooms/:roomId`
  - `POST /v1/rooms/:roomId/move`
  - `DELETE /v1/rooms/:roomId` (с защитами `LastRoomProtected`, `DefaultRoomProtected`)
- Sidebar UX:
  - grouped sections/categories,
  - active highlight,
  - quick create `+`,
  - settings popups для category/channel,
  - join voice / open text flow.
- Smoke coverage:
  - postdeploy включает `smoke:api` + hierarchy create/verify/cleanup,
  - realtime smoke стабилен (`reconnect/idempotency`),
  - web e2e smoke базового сценария выполнен.

### 2.2 Принятое текущее именование

- Канонично: `rooms` / `room_categories`.
- Плановые термины `channels` / `channel_categories` считаем устаревшими (не использовать в новых API задачах до отдельного ADR).

## 3) Текущий MVP gap (что осталось)

1. `Category layer` как продуктовая фича:
   - collapse/expand state,
   - default visibility behavior,
   - persistence policy (client/server) — зафиксировать явно.
2. Channel reorder UX:
   - сейчас есть explicit move API, но UX reorder ограничен;
   - нужен стабильный пользовательский сценарий reorder в UI (MVP-уровень).
3. Archive lifecycle:
   - API/UX для архивирования и фильтрации архивных каналов (если оставляем в MVP).
4. Hierarchy e2e:
   - отдельный web e2e smoke на создание/навигацию/проверку порядка после reload.

## 4) Realtime/behavior policy (фиксируем)

- `room.join` / `room.leave` остаются каноничным wire-contract.
- Для non-text каналов действует single-active behavior (last join wins, без logout аккаунта).
- Sidebar members должны опираться на live presence (`rooms.presence`).
- Любые новые realtime события структуры (`category.updated`/`channel.updated`) добавлять только при явной потребности; текущий MVP закрыт refresh/tree reload flow.

## 5) Acceptance criteria для закрытия блока channel tree

Считаем блок готовым к MVP, когда одновременно выполнено:

1. Category/channel create/edit/move/delete работают стабильно в `test`.
2. Reorder UX закрыт на уровне MVP (не только API).
3. Есть e2e/smoke сценарий «create category + create channels + reload + order preserved».
4. Voice/text contextual actions не регрессируют (`join voice`, `open text`, presence).
5. Postdeploy smoke остаётся зелёным (SSO/API/Realtime).

## 6) Исполнительный план (следующие шаги)

1. Зафиксировать ADR по category collapse/persistence + archive policy.
2. Доделать reorder UX в web (MVP-safe, без drag-and-drop если не требуется).
3. Добавить/докрутить web e2e hierarchy smoke.
4. Обновить contract docs (`API_CONTRACT_V1.md`) под фактический tree/CRUD scope.
5. Подтвердить статус в `ROADMAP.md` и `FEATURE_LOG.md` после каждого инкремента.

## 7) Связанные каноничные документы

- `docs/ROADMAP.md`
- `docs/FEATURE_LOG.md`
- `docs/API_CONTRACT_V1.md`
- `docs/SMOKE_CI_MATRIX.md`
- `docs/PREPROD_DECISION_PACKAGE.md`
