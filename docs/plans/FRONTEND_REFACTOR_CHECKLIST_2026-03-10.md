# Frontend Refactor Checklist (2026-03-10)

Краткий рабочий чеклист по декомпозиции `apps/web/src/App.tsx` и доведению UI до поддерживаемой структуры.

## Статус этапов

- [x] Этап 1: базовые границы (media capabilities, desktop breakpoint alias)
- [x] Этап 2: выделение UI state (`useAppUiState`)
- [x] Этап 3: выделение toast queue (`useToastQueue`)
- [x] Этап 4: выделение build-version sync (`useBuildVersionSync`)
- [x] Этап 5: выделение event logs (`useAppEventLogs`)
- [x] Этап 6: выделение snapshot текущей комнаты (`useCurrentRoomSnapshot`)
- [x] Этап 7: выделение persisted local settings (audio/video/localStorage)
- [ ] Этап 8: декомпозиция `UserDock` на подкомпоненты
- [ ] Этап 9: декомпозиция `RoomsPanel` на подкомпоненты
- [ ] Этап 10: Tailwind migration (mostly), кроме зафиксированных CSS-исключений

## Дополнительно после этапов 1-7

- [x] Этап 8 (progress): вынесен `UserDockSettingsOverlay` из `UserDock`.
- [x] Этап 8 (progress): вынесен `UserDockControls` (RTC/actions/popup controls) из `UserDock`.
- [x] Этап 9 (progress): вынесен `RoomRow` (настройки канала + presence статусы участников) из `RoomsPanel`.

- [x] Вынесены realtime/call обработчики в `useRealtimeIncomingCallState`.
- [x] Вынесена screen-share orchestration логика в `useScreenShareOrchestrator`.
- [x] Вынесена WS ack/nack orchestration логика в `useWsEventAcks`.
- [x] Вынесены session/token lifecycle эффекты в `useSessionStateLifecycle`.
- [x] Вынесены ws disconnect reset эффекты в `useRealtimeConnectionReset`.
- [x] Вынесена telemetry refresh orchestration в `useTelemetryRefresh`.
- [x] Вынесен sync admin users в `useAdminUsersSync`.
- [x] Вынесены room presence actions (`join/leave/kick`) в `useRoomPresenceActions`.
- [x] Вынесены moderation/server-audio actions в `useServerModerationActions`.

## RNNoise (добавлено)

- [ ] Уточнить целевой путь интеграции RNNoise:
  - client-side preprocessing в браузере,
  - или server-side/LiveKit noise suppression profile.
- [ ] Подготовить техдизайн (1 страница): ограничения CPU, latency budget, fallback policy.
- [ ] Добавить флаг в UI/настройки (`noise_reduction` как отдельный режим с явным статусом).
- [ ] Добавить telemetry метрики:
  - включение/выключение RNNoise,
  - ошибки инициализации,
  - средняя стоимость обработки кадра.
- [ ] Реализовать canary rollout только в `test` и smoke-check сценарий «voice with RNNoise on/off».
- [ ] После canary обновить runbook и критерии включения по умолчанию.

## Правила выполнения

- Все изменения только через feature branch + GitOps.
- Перед любым `prod`: merge в `main` -> deploy `main` в `test` -> smoke -> отдельное подтверждение.
- Для каждого батча: `npm run web:build` + `deploy:test:smoke`.
- Не включать `FULL_RECREATE=1` без явной необходимости.
