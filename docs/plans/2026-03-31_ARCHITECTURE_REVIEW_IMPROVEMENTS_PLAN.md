# План: архитектурные улучшения по итогам ревью
Date: 2026-03-31
Scope: стабилизация архитектурных границ web/api/realtime, усиление security-позиций и усиление quality gates перед релизами.

## 0) Контекст

- Ревью выявило концентрацию ответственности в крупных orchestration-файлах и асимметрию тестовых gate между платформами.
- В проекте уже есть сильная операционная база (GitOps, smoke, runbooks), поэтому план фокусируется на адресных улучшениях без массового рефакторинга.

Подтвержденные findings (из ревью):

- Web auth по умолчанию все еще допускает localStorage bearer путь; это оставляет XSS-sensitive поверхность.
- Крупные orchestration/route модули (web app shell, auth route, realtime route) увеличивают риск регрессий и стоимость изменений.
- Mandatory verify gate не делает web/desktop smoke обязательными для всех релевантных сценариев.
- В docs index есть рассинхрон со списком реально существующих планов.
- В auth proxy к внешнему SSO нет явно зафиксированной timeout/abort политики.

## 1) Цели

- Снизить архитектурный риск от god-file паттерна в web и API.
- Закрыть security-хвост по web auth storage (cookie-first, без расширения attack surface).
- Повысить предсказуемость релизов через обязательные проверки web/desktop сценариев.
- Синхронизировать документацию с реальным состоянием планов и runbooks.

## 2) Workstreams

### 2.1 Web composition boundaries

- [ ] Разделить текущий orchestration слой на feature facades: `auth`, `rooms`, `chat`, `voice`, `admin`.
- [ ] Свести `App` к wiring-композиции (state ownership внутри доменных hooks/contexts).
- [ ] Зафиксировать целевой лимит сложности на модуль: до 300-400 строк на feature orchestrator.

Progress note:

- Вынесены admin server handlers (`block/unblock`, `delete`) из `App.tsx` в `hooks/rooms/useAdminServerActions.ts`.
- Вынесены deleted-account actions (`restore/delete`) в `hooks/auth/useDeletedAccountActions.ts`.
- Вынесены RNNoise runtime handlers в `hooks/media/useRnnoiseRuntimeHandlers.ts`.
- Вынесена сборка `auth/room/chat` controllers + telemetry loader в `hooks/app/state/useAppControllers.ts`.
- Вынесен room/category editor state cluster в `hooks/rooms/useRoomEditorState.ts`.
- Двадцать девятый инкремент декомпозиции `web` выполнен: voice participants derived cluster (`currentRoomVoiceTargets`, `memberVolumeByUserId`, `remoteVideoLabelsByUserId`, `videoPolicyAudienceKey`) вынесен в `hooks/voice/useVoiceParticipantsDerived.ts`.
- Тридцатый инкремент декомпозиции `web` выполнен: voice UI maps cluster (`speakingVideoWindowIds`, `effectiveVoiceCameraEnabledByUserIdInCurrentRoom`, `voiceMediaStatusSummaryByUserIdInCurrentRoom`) вынесен в `hooks/voice/useVoiceMediaUiMaps.ts`.
- Тридцать первый инкремент декомпозиции `web` выполнен: inline realtime lifecycle callbacks (`onSessionMoved`, `onChatCleared`, `onChatTyping`) вынесены в `hooks/realtime/useRealtimeLifecycleCallbacks.ts`.
- Тридцать второй инкремент декомпозиции `web` выполнен: props assembly для `ServerProfileModalContainer` (`permissions/state/data/actions/meta`) вынесен в `hooks/app/state/useServerProfileModalProps.ts`.
- Тридцать третий инкремент декомпозиции `web` выполнен: ранние gate-return ветки (`DesktopBrowserCompletion`, `DeletedAccount`, `AccessState`) вынесены в `hooks/app/state/useAppEntryGates.tsx`.
- Тридцать четвертый инкремент декомпозиции `web` выполнен: блок глобальных оверлеев/футера/cookie вынесен из `App.tsx` в `components/AppShellOverlays.tsx`.
- Тридцать пятый инкремент декомпозиции `web` выполнен: верхний app chrome (header/tooltip/status banners) вынесен из `App.tsx` в `components/AppTopChrome.tsx`.
- Static smoke `smoke:web:denied-media` синхронизирован с новым app-shell placement (`App.tsx`/`AppTopChrome.tsx`) без ослабления проверки denied-banner guard.
- Тридцать шестой инкремент декомпозиции `web` выполнен: центральный main-section блок (`workspace/onboarding/guest`, invite индикатор, `ServerProfileModalContainer`) вынесен из `App.tsx` в `components/AppMainSection.tsx`.
- Тридцать седьмой инкремент декомпозиции `web` выполнен: shell wiring сведён к composable units (`components/AppShellLayout.tsx` + `hooks/app/state/useAppShellLayoutProps.ts` + props hooks для top/main/overlays).
- Тридцать восьмой инкремент декомпозиции `web` выполнен: room voice lifecycle effects (video reset + per-room voice maps reset) вынесены из `App.tsx` в `hooks/voice/useVoiceRoomLifecycleEffects.ts`.
- Тридцать девятый инкремент декомпозиции `web` выполнен: state/setter пары в крупных destructuring-блоках (`useRoomEditorState`, `useAppUiState`) приведены к compact pair-format (`value, setValue`) для снижения шума и сохранения читаемости.
- Сороковой инкремент декомпозиции `web` выполнен: user/media/server AV state cluster вынесен из `App.tsx` в `hooks/app/state/useAppUserMediaState.ts`.
- Сорок первый инкремент декомпозиции `web` выполнен: core app/realtime/server/admin state cluster вынесен из `App.tsx` в `hooks/app/state/useAppCoreState.ts`.
- Сорок второй инкремент декомпозиции `web` выполнен: permissions/locale/pending-requests notifications cluster (`can*`, `serviceToken`, `locale`, `t`, toast+Notification effect) вынесен из `App.tsx` в `hooks/app/state/useAppPermissionsAndLocale.ts`.
- Сорок третий инкремент декомпозиции `web` выполнен: props assembly для realtime lifecycle (`useRealtimeChatLifecycle` + merge callback `onRoomMediaTopology`) вынесен из `App.tsx` в `hooks/app/state/useRealtimeChatLifecycleProps.ts`.
- Сорок четвертый инкремент декомпозиции `web` выполнен: derived state cluster (`currentServer`, `activeChatRoom`) + chat room slug sync effect вынесен из `App.tsx` в `hooks/app/state/useAppRoomsAndServerDerived.ts`.
- Сорок пятый инкремент декомпозиции `web` выполнен: app-level rooms panel props adapter (`set*/create*/open*/save*` -> `onSet*/onCreate*/onOpen*/onSave*`) вынесен из `App.tsx` в `hooks/app/state/useAppRoomsPanelProps.ts`.
- Сорок шестой инкремент декомпозиции `web` выполнен: app-level chat/video props adapter (`serviceToken/user/activeChatRoom/handleSetChatText` -> workspace chat/video contract) вынесен из `App.tsx` в `hooks/app/state/useAppChatVideoProps.ts`.
- Сорок седьмой инкремент декомпозиции `web` выполнен: app-level user dock shared props adapter (derived `currentRoomTitle/screenShareActive/serverSoundSettings` + action aliases) вынесен из `App.tsx` в `hooks/app/state/useAppUserDockSharedProps.ts`.
- Сорок восьмой инкремент декомпозиции `web` выполнен: app-level server profile modal props adapter (derived `currentUserId/currentServerRole/currentServerName/hasCurrentServer`) вынесен из `App.tsx` в `hooks/app/state/useAppServerProfileModalProps.ts`.
- Сорок девятый инкремент декомпозиции `web` выполнен: app-level entry gates state adapter (`servers` -> `serversCount`) вынесен из `App.tsx` в `hooks/app/state/useAppEntryGatesState.tsx`.
- Пятидесятый инкремент декомпозиции `web` выполнен: app-level top chrome section adapter (`currentServer/openProfileSettings/setCurrentServerId` mapping) вынесен из `App.tsx` в `hooks/app/state/useAppTopChromeSectionInput.ts`.
- Пятьдесят первый инкремент декомпозиции `web` выполнен: app-level main section input adapter (`handleCreateServer/setMobileTab` -> shell main section contract) вынесен из `App.tsx` в `hooks/app/state/useAppMainSectionInput.ts`.
- Пятьдесят второй инкремент декомпозиции `web` выполнен: app-level overlays section input adapter (`App` overlays wiring -> shell overlays contract) вынесен из `App.tsx` в `hooks/app/state/useAppOverlaysSectionInput.ts`.
- Пятьдесят третий инкремент декомпозиции `web` выполнен: shell composition wrapper (`useAppShellCompositionProps`) вынесен из `App.tsx` в `hooks/app/state/useAppShellCompositionProps.ts`.
- Пятьдесят четвертый инкремент стабилизации `web` выполнен: после проверки VS Code Problems выровнены тип-контракты adapters/realtime callbacks (`useAppRoomsPanelProps`, `useRealtimeLifecycleCallbacks`, `useChatTypingController`) без изменения runtime-поведения.
- Cumulative: `App.tsx` сокращен с 2101 до 1621 строк; web build + denied-media smoke проходят после каждого инкремента.

### 2.2 API route decomposition

- [ ] Разделить крупные маршруты auth/realtime на bounded modules (`session`, `sso`, `desktop-handoff`, `presence`, `call-signaling`, `chat-realtime`).
- [ ] Вынести cross-cutting concerns в middleware/services: rate-limit, envelope/ack helpers, audit events.
- [ ] Добавить контрактные тесты на public handler boundaries после декомпозиции.

Progress note:

- Первый инкремент декомпозиции `auth` выполнен: cross-cutting helpers вынесены из `routes/auth.ts` в `routes/auth.helpers.ts` (cookie utils, audit context, account-deleted helpers, auth rate-limit middleware factory).
- Второй инкремент декомпозиции `realtime` выполнен: ws-metrics helper вынесен из `routes/realtime.ts` в `routes/realtime-metrics.ts`.
- Третий инкремент декомпозиции `auth` выполнен: session token lifecycle helper вынесен в `routes/auth-session.ts` (`issueAuthSessionToken`, `deleteAuthSession`).
- Четвертый инкремент декомпозиции `auth` выполнен: SSO utility helpers вынесены в `routes/auth-sso.ts` (`resolveSafeReturnUrl`, `proxyAuthGetJson`).
- Пятый инкремент декомпозиции `auth` выполнен: профильный upsert helper вынесен в `routes/auth-user-upsert.ts` (`upsertSsoUser`).
- Шестой инкремент декомпозиции `auth` выполнен: livekit URL resolver вынесен в `routes/auth-livekit.ts`.
- Седьмой инкремент декомпозиции `auth` выполнен: desktop handoff state/code store вынесен в `routes/auth-desktop-handoff-store.ts`.
- Восьмой инкремент декомпозиции `auth` выполнен: ws-ticket issue helper вынесен в `routes/auth-ws-ticket.ts`.
- Девятый инкремент декомпозиции `realtime` выполнен: room join policy вынесена в `routes/realtime-room-join.ts` (`canJoinRoom`).
- Десятый инкремент декомпозиции `realtime` выполнен: NACK/error senders вынесены в `routes/realtime-nacks.ts`.
- Одиннадцатый инкремент декомпозиции `auth` выполнен: access policy checks (banned/deleted/service access) вынесены в `routes/auth-access.ts`.
- Двенадцатый инкремент декомпозиции `realtime` выполнен: screen-share state helpers вынесены в `routes/realtime-screen-share-state.ts`.
- Тринадцатый инкремент декомпозиции `realtime` выполнен: permission helpers (moderator check, forbidden/join-denied nack) вынесены в `routes/realtime-permissions.ts`.
- Четырнадцатый инкремент декомпозиции `realtime` выполнен: call ack/idempotency/trace helpers вынесены в `routes/realtime-call-helpers.ts`.
- Пятнадцатый инкремент декомпозиции `realtime` выполнен: room join/leave handlers вынесены в `routes/realtime-room-events.ts`.
- Шестнадцатый инкремент декомпозиции `realtime` выполнен: call signaling (`call.offer`/`call.answer`/`call.ice`) вынесен в `routes/realtime-call-signaling.ts`.
- Семнадцатый инкремент декомпозиции `realtime` выполнен: ws ticket auth + connection initialization вынесены в `routes/realtime-ws-auth.ts`.
- Восемнадцатый инкремент декомпозиции `realtime` выполнен: media/screen dispatch (`screen.share.*`, `call.mic_state`, `call.video_state`) вынесен в `routes/realtime-call-media-events.ts`.
- Девятнадцатый инкремент декомпозиции `realtime` выполнен: chat dispatch (`chat.send`/`chat.edit`/`chat.delete`/`chat.typing`) вынесен в `routes/realtime-chat-events.ts`.
- Двадцатый инкремент декомпозиции `realtime` выполнен: room moderation dispatch (`room.kick`/`room.move_member`) вынесен в `routes/realtime-room-moderation-events.ts`.
- Двадцать первый инкремент декомпозиции `realtime` выполнен: message dispatcher (`parse -> known event switch -> per-event handlers`) вынесен в `routes/realtime-message-handler.ts`.
- Двадцать второй инкремент декомпозиции `realtime` выполнен: non-text channel eviction helper вынесен в `routes/realtime-room-eviction.ts`.
- Двадцать третий инкремент декомпозиции `auth` выполнен: desktop handoff route cluster вынесен в `routes/auth-desktop-handoff-routes.ts`.
- Двадцать четвертый инкремент декомпозиции `auth` выполнен: profile route cluster (`/v1/auth/me` GET/PATCH/DELETE) вынесен в `routes/auth-profile-routes.ts`.
- Двадцать пятый инкремент декомпозиции `auth` выполнен: livekit-token route cluster вынесен в `routes/auth-livekit-routes.ts`.
- Двадцать шестой инкремент декомпозиции `auth` выполнен: session/ws-ticket route cluster (`/v1/auth/refresh`, `/v1/auth/logout`, `/v1/auth/ws-ticket`) вынесен в `routes/auth-session-routes.ts`.
- Двадцать седьмой инкремент декомпозиции `auth` выполнен: SSO route cluster (`/v1/auth/sso/start`, `/v1/auth/sso/logout`, `/v1/auth/sso/session`, `/v1/auth/sso/restore`) вынесен в `routes/auth-sso-routes.ts`.
- Двадцать восьмой инкремент декомпозиции `auth` выполнен: базовые core routes (`/v1/auth/mode`, `register`, `login`) и фабрика rate-limiters вынесены в `routes/auth-core-routes.ts` и `routes/auth-rate-limiters.ts`.
- Текущий результат по размеру: `routes/auth.ts` ~50 строк, `routes/realtime.ts` ~354 строки.
- `npm -s run check:api-types`, `npm -s run web:build` и `npm -s run smoke:web:denied-media` проходят после выноса.

### 2.3 Auth storage hardening (cookie-first)

- [x] Перевести web контур на primary cookie mode (`HttpOnly`, `Secure`, `SameSite`) как дефолтный runtime путь.
- [x] Ограничить localStorage bearer режим как временный fallback только для controlled окружений.
- [x] Удалить legacy bearer-only ветки после прохождения test smoke и ручного login/logout regression.

Progress note:

- Web client переведен на memory-first bearer storage; localStorage persistence доступен только через явный `VITE_AUTH_BEARER_STORAGE=localstorage`.
- Test infra defaults обновлены на cookie-primary (`TEST_AUTH_COOKIE_MODE=1` в `infra/.env.host.example` и compose fallback для test).
- Required gate дополнен conditional cookie-mode smoke (`smoke:auth:cookie-mode`) при активном cookie режиме.
- Host compose build args расширены: `TEST_VITE_AUTH_BEARER_STORAGE` / `PROD_VITE_AUTH_BEARER_STORAGE` (default `memory`).
- Runtime ветка `if (!AUTH_COOKIE_MODE) ...` в session lifecycle удалена; bootstrap auth теперь server-session first.
- Test deploy на `origin/feature/cookie-primary-hardening` (SHA `43d88bf1f9fce2e9c9846a3fdc4204d4a19b46d5`) прошел: `npm run deploy:test:smoke` -> PASS.
- Server web e2e smoke с явным base URL прошел: `SMOKE_API_URL=https://test.datowave.com SMOKE_WEB_BASE_URL=https://test.datowave.com npm run smoke:web:e2e` -> PASS, включая `smoke:web:denied-media` после синхронизации маркеров.
- Ручной regression (test UI): login/logout в одной вкладке для трех аккаунтов выполнен без проблем; явных регрессий cookie-first auth flow не выявлено.

### 2.4 Release quality gates

- [x] Расширить mandatory verify gate: добавить обязательный web smoke (минимум auth + room join + message send).
- [x] Добавить desktop smoke в required путь для desktop release веток.
- [x] Зафиксировать matrix "изменение -> обязательный набор smoke" в operations docs.

### 2.5 Docs reliability

- [x] Обновить индекс `docs/README.md` по фактическому содержимому `docs/plans/`.
- [x] Добавить lightweight проверку битых ссылок в docs в CI/local verify.
- [x] Для новых планов использовать единый шаблон Date/Scope/Workstreams/Acceptance.

### 2.6 Realtime transport decision (Socket.IO vs native WebSocket)

Decision (на текущий этап):

- Основной transport оставляем native WebSocket + существующий typed envelope protocol.
- Миграцию на Socket.IO не делать сейчас как default path.

Почему (кратко):

- Уже есть зрелый контракт `ack/nack/idempotency/requestId`, покрытый smoke и unit тестами.
- Переход на Socket.IO добавит migration cost и риск дрейфа протокола без гарантированного product payoff в текущем scope.
- Ключевые текущие проблемы архитектуры лежат в boundaries/decomposition/gates, а не в отсутствии socket framework.

Когда пересматривать решение:

- Нужен fallback на long-polling для нестабильных сетей/прокси как обязательный product requirement.
- Появляется требование горизонтального масштабирования с room adapter экосистемой Socket.IO как faster path.
- Суммарная стоимость поддержки собственного transport-слоя становится выше стоимости миграции.

Action items:

- [x] Зафиксировать ADR по realtime transport выбору (native WS now, Socket.IO reconsider triggers).
- [x] Добавить decision matrix с метриками: reliability, latency, migration effort, test rewrite cost.
- [ ] Подготовить ограниченный spike (не в prod path): Socket.IO POC для `ping`, `room.join`, `chat.send` и сравнить с текущим протоколом.

### 2.7 SSO proxy timeout policy

- [x] Добавить timeout/abort policy для SSO proxy fetch на backend.
- [x] Прокинуть timeout в runtime config и env examples.
- [x] Добавить targeted unit/integration test на timeout path (`SsoUnavailable` response semantics).

## 3) Приоритеты

1. P0: 2.3 Auth storage hardening.
2. P0: 2.4 Mandatory release gates.
3. P1: 2.1 Web composition boundaries.
4. P1: 2.2 API route decomposition.
5. P1: 2.6 Realtime transport decision.
6. P2: 2.5 Docs reliability.

## 4) Acceptance criteria

- [x] Web auth bootstrap работает в cookie-first режиме в `test` без регрессий SSO flow.
- [x] `npm run check:required` включает web gate (и desktop gate для desktop release path).
- [ ] Крупные orchestration файлы разнесены по feature модулям, публичные API модулей зафиксированы.
- [x] Docs index не содержит битых ссылок на планы.
- [x] По realtime transport есть зафиксированное ADR-решение и критерии пересмотра (с измеримыми триггерами).

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- Декомпозиция проводится инкрементально, без массового одномоментного рефакторинга.
