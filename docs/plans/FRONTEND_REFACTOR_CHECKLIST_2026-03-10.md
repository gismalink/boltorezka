# Frontend Refactor Checklist (2026-03-10)

Краткий рабочий чеклист по декомпозиции `apps/web/src/App.tsx` и доведению UI до поддерживаемой структуры.

## Статус этапов

- [x] Этап 1: базовые границы (media capabilities, desktop breakpoint alias)
- [x] Этап 2: выделение UI state (`useAppUiState`)
- [x] Этап 3: выделение toast queue (`useToastQueue`)
- [x] Этап 4: выделение build-version sync (`useBuildVersionSync`)
- [x] Этап 5: выделение event logs (`useAppEventLogs`)
- [x] Этап 6: выделение snapshot текущей комнаты (`useCurrentRoomSnapshot`)
- [ ] Этап 7: выделение persisted local settings (audio/video/localStorage)
- [ ] Этап 8: декомпозиция `UserDock` на подкомпоненты
- [ ] Этап 9: декомпозиция `RoomsPanel` на подкомпоненты
- [ ] Этап 10: Tailwind migration (mostly), кроме зафиксированных CSS-исключений

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
