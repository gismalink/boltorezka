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
- [x] Этап 8: декомпозиция `UserDock` на подкомпоненты
- [x] Этап 9: декомпозиция `RoomsPanel` на подкомпоненты
- [x] Этап 10: Tailwind migration (mostly), кроме зафиксированных CSS-исключений

## Дополнительно после этапов 1-7

- [x] Этап 8 (progress): вынесен `UserDockSettingsOverlay` из `UserDock`.
- [x] Этап 8 (progress): вынесен `UserDockControls` (RTC/actions/popup controls) из `UserDock`.
- [x] Этап 9 (progress): вынесен `RoomRow` (настройки канала + presence статусы участников) из `RoomsPanel`.
- [x] Этап 9 (progress): вынесен `RoomsConfirmOverlay` из `RoomsPanel`.
- [x] Этап 9 (progress): вынесен `RoomsPanelHeader` (create category/channel popups) из `RoomsPanel`.
- [x] Этап 9 (progress): вынесен `RoomsCategoryBlock` (category collapse/settings/channels list) из `RoomsPanel`.
- [x] Этап 9 (progress): вынесена утилита `mapRoomMembersForSlug` и блок `RoomsUncategorizedBlock`.
- [x] Этап 10 (progress): перенесены safe layout-стили `RoomsPanel`/`UserDock` из `styles.css` в Tailwind utility-классы в JSX.
- [x] Этап 10 (progress): удалены дублирующие CSS-правила (`category-block`, `category-title`, `category-collapse-btn`, `channel-members-list`, `user-dock-inline-hidden`, `voice-menu-row`, `voice-level-bars`, `voice-footer-row`).

## CSS-исключения для Stage 10 (осознанно оставлены)

- Сложные pixel-art визуальные эффекты, `color-mix`, и многоступенчатые `box-shadow`.
- Realtime state-стили участников канала (`channel-member-*-status*`, pulse-анимации).
- Popup/overlay геометрия, завязанная на custom offsets и desktop/mobile поведении.
- Video window rendering/resize слои и эффекты изображения.

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

- [x] Уточнить целевой путь интеграции RNNoise:
  - client-side preprocessing в браузере,
  - или server-side/LiveKit noise suppression profile.
- [x] Подготовить техдизайн (1 страница): ограничения CPU, latency budget, fallback policy.
  - `docs/architecture/2026-03-12_RNNOISE_CLIENT_TECH_DESIGN.md`
- [x] Добавить флаг в UI/настройки (`noise_reduction` как отдельный режим с явным статусом).
- [x] Добавить выбор уровня шумоподавления (`soft` / `medium` / `strong`) с сохранением в localStorage.
- [x] Добавить telemetry метрики:
  - включение/выключение RNNoise (`rnnoise_toggle_on` / `rnnoise_toggle_off`),
  - ошибки инициализации (`rnnoise_init_error`) + fallback unavailable (`rnnoise_fallback_unavailable`),
  - средняя стоимость применения процессора (`rnnoise_process_cost_us_sum` / `rnnoise_process_cost_samples`, отображается как `rnnoise_process_avg_ms`).
- [x] Реализовать canary rollout только в `test` и smoke-check сценарий «voice with RNNoise on/off».
  - Добавлен browser smoke `smoke:web:rnnoise:browser` и включён в `postdeploy-smoke-test.sh` как `web_rnnoise` (test gate).
- [x] После canary обновить runbook и критерии включения по умолчанию.
  - Обновлён `docs/runbooks/VOICE_BASELINE_RUNBOOK.md` (раздел RNNoise canary/default-enable policy).
  - Обновлена smoke-matrix каноника: `docs/operations/SMOKE_CI_MATRIX.md`.

## UI Themes (добавлено 2026-03-12)

- [x] Создана feature-ветка для UI-итераций (`feature/slider-thumb-fill-value`).
- [x] Добавить поле `users.ui_theme` в БД + CHECK constraint (`8-neon-bit` | `material-classic`).
- [x] Прокинуть `ui_theme` через API контракты пользователя (`/v1/auth/me`, `PATCH /v1/auth/me`, SSO session).
- [x] Добавить в профиль пользователя выбор темы интерфейса (default: `8-Neon-Bit`).
- [x] Реализовать вторую тему (`material-classic`) в frontend-стилях.
- [x] Сохранение выбора темы на бэке через обновление профиля.
- [x] Применение темы при логине/refresh + fallback из localStorage до загрузки профиля.
- [x] Smoke-check в `test`: смена темы, перезаход, тема сохраняется.
- [x] Дополнительный UI-pass: убраны оставшиеся hardcoded стили в кнопках/панелях/чате/camera-controls, вынесены в theme tokens.
- [x] Дополнительный UI-pass: точечный аудит Tailwind usage (гибридный режим сохранён как целевой).

## Правила выполнения

- Все изменения только через feature branch + GitOps.
- Перед любым `prod`: merge в `main` -> deploy `main` в `test` -> smoke -> отдельное подтверждение.
- Для каждого батча: `npm run web:build` + `deploy:test:smoke`.
- Не включать `FULL_RECREATE=1` без явной необходимости.
