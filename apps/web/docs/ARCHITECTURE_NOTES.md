# Web Architecture Notes (internal)

Короткая карта текущей структуры `apps/web` для быстрой навигации и изменений.

## Core composition

- `src/App.tsx` — orchestration-only слой:
  - хранит state,
  - связывает hooks и UI-компоненты,
  - минимизирует локальную бизнес-логику.

## UI components

- `src/components/AppHeader.tsx` — header + auth/profile popup UI.
- `src/components/RoomsPanel.tsx` — sidebar с категориями/каналами и admin actions UI.
- `src/components/ChatPanel.tsx` — чат-лента, load older, compose.
- `src/components/ServerProfileModal.tsx` — server menu (users/events/telemetry/call).
- `src/components/UserDock.tsx` — user dock + voice/settings UI.
- `src/components/ToastStack.tsx` — toast rendering.

## Hooks (domain split)

- `src/hooks/useAuthProfileFlow.ts` — auth mode, auto-SSO, logout, profile save/open settings.
- `src/hooks/useRealtimeChatLifecycle.ts` — WS lifecycle, recent/older messages, chat autoscroll.
- `src/hooks/useRoomAdminActions.ts` — category/room CRUD/move/archive action handlers.
- `src/hooks/useCollapsedCategories.ts` — collapsed categories persistence.
- `src/hooks/useMediaDevicePreferences.ts` — audio devices loading + persisted prefs.
- `src/hooks/useRoomsDerived.ts` — derived rooms (`allRooms`, `uncategorizedRooms`, `currentRoom`).
- `src/hooks/useServerMenuAccessGuard.ts` — tab access guard for server menu.
- `src/hooks/usePopupOutsideClose.ts` — generic outside-click popup close behavior.

## Services

- `src/services/authController.ts` — SSO start/complete/logout orchestration.
- `src/services/chatController.ts` — REST history + optimistic send.
- `src/services/roomAdminController.ts` — room/category admin API workflows.
- `src/services/wsMessageController.ts` — incoming ws envelope handling.
- `src/services/realtimeClient.ts` — websocket transport + request retry/ack infra.

## API layer

- `src/api.ts`:
  - `fetchJson<T>` low-level client,
  - typed `ApiError` для richer catch-handling,
  - centralized endpoint constants/helpers (`withId`, `withSuffix`, `withJsonBody`).

## Practical conventions

- Новую UI-фичу сначала выносить в `components/*`, затем привязывать через hook в `App`.
- Побочные эффекты и async workflow — только в hooks/services, не в JSX-слое.
- Для новых API-методов использовать endpoint helpers в `api.ts`, без инлайн-строк путей.

## Import conventions (2026-02-28)

- Barrel imports:
  - `src/components/index.ts`
  - `src/hooks/index.ts`
  - `src/services/index.ts`
- Domain types entrypoint:
  - `src/domain/index.ts` (re-export из `src/types.ts`)
- Предпочитать импорты в формате `from "./components"|"./hooks"|"./services"|"./domain"`.
- Прямые импорты файлов допустимы только для локальных типов компонента (`./types`) и внутренней связности внутри одного модуля.
