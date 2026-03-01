# Boltorezka Feature Log

Этот документ хранит зафиксированные изменения, выполненные шаги и операционные evidence.
План и open items находятся в `docs/status/ROADMAP.md`.

## 2026-03-02 — Tailwind migration (feature branch increment)

### Branch

- Work branch: `feature/tailwind-user-dock` (GitOps workflow compliant).

### Delivered

- В `apps/web` подключён Tailwind foundation (`tailwind.config.cjs`, `postcss.config.cjs`, `src/tailwind.css`).
- Layout migration на utility-классы (incremental, без big-bang):
  - `AppHeader`,
  - `App` workspace shell,
  - `RoomsPanel` / `ChatPanel`,
  - `UserDock`,
  - overlay shell (`PopupPortal`, `TooltipPortal`, `ToastStack`, `ServerProfileModal`).
- Выполнена чистка дублей SCSS layout-правил, уже покрытых utility-классами:
  - `_responsive.scss`,
  - `_user-dock-voice.scss`,
  - `_overlays.scss`,
  - `_toasts.scss`,
  - `_layout.scss`,
  - `_rooms-chat.scss`.

### Validation

- Повторные `apps/web -> npm run build` в каждом инкременте — PASS.
- Test deploy from feature branch выполнен: `TEST_REF=origin/feature/tailwind-user-dock npm run deploy:test:smoke` — PASS.
  - Deploy target SHA: `135b8c078cc7aeec0966c89271d250dfa12d16cd`.
  - Postdeploy smoke: `smoke:sso`, `smoke:api`, `smoke:realtime` — PASS.
- Набор коммитов в `feature/tailwind-user-dock`:
  - `92448da` — `web: migrate user dock layout to tailwind utilities`
  - `f96d917` — `web: migrate overlay and modal shells to tailwind utilities`
  - `dd0316a` — `web: add tailwind responsive utilities for user dock`
  - `d5da724` — `web: remove responsive scss rules replaced by tailwind`
  - `e066e78` — `web: remove duplicated user-dock scss layout rules`
  - `04e257d` — `web: remove duplicated overlay and toast scss layout rules`
  - `b47c5a1` — `web: remove duplicated layout scss rules covered by tailwind`
  - `b2e14d9` — `web: tailwind-migrate rooms internal rows and confirm overlay`
  - `1ec3dd3` — `web: tailwind-migrate chat message layout and popup positioning`
  - `2218a5f` — `web: clean empty legacy style blocks and update feature log`
  - `0fb987e` — `web: remove remaining rooms-chat layout duplicates`
  - `f622325` — `web: finalize style dedup for dock, overlays, and chat`
  - `3046a67` — `web: remove remaining mobile room layout style duplicates`
  - `e0a8422` — `web: remove unused legacy style selectors`
  - `f0bb19f` — `web: remove final unused static style selectors`
  - `2d2a78a` — `web: migrate auth provider layout utilities in header`
  - `e861a9e` — `web: migrate user dock menu rows and sliders to utilities`
  - `d6db83b` — `web: migrate user dock device list layout to utilities`
  - `22fb4d8` — `web: migrate user dock control group layout to utilities`
  - `868f0c9` — `web: migrate settings modal shell layout to utilities`
  - `23c317b` — `web: complete user-settings utility migration pass`
  - `52715e6` — `web: remove remaining legacy row class dependencies`
  - `5d218d5` — `web: remove redundant stack class usages in settings views`
  - `9f13dbb` — `web: migrate room popup form stacks to utilities`
  - `a573099` — `web: remove global row and stack style utilities`

### Next step

- PR из `feature/tailwind-user-dock` -> `main`, затем `deploy:test:smoke` от `origin/main` после merge.

## 2026-03-01 — Prod rollout from main + voice baseline canonicalized

### Delivered

- Выполнен production rollout из `main` (policy-compliant):
  - merged `feature/mobile-earpiece-default` -> `main`,
  - deploy target SHA: `36dd4e129b92e7bb0300ff936a8359f6f9be3658`.
- В production подтверждены:
  - mobile MVP UX-поправки (channels/chat/settings mobile layout),
  - admin user actions: `promote`, `demote`, `ban`, `unban`,
  - backend enforcement для banned users (`/v1/auth/ws-ticket`, guarded routes).
- Зафиксирована каноническая документация по рабочему голосовому baseline:
  - `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`.

### Validation (prod)

- `docker compose ps`:
  - `boltorezka-api-prod` — `Up`,
  - `boltorezka-db-prod` — `Up (healthy)`,
  - `boltorezka-redis-prod` — `Up (healthy)`.
- `curl -I https://boltorezka.gismalink.art/health` -> `HTTP/2 200`.
- `curl https://boltorezka.gismalink.art/health` -> `{"status":"ok","checks":{"api":"ok","db":"ok","redis":"ok"},...}`.
- `curl https://boltorezka.gismalink.art/v1/auth/mode` -> `{"mode":"sso","ssoBaseUrl":"https://auth.gismalink.art"}`.

### Voice baseline notes

- Рабочий media path закреплён на `relay + TURN TLS/TCP` для устойчивости в мобильных/жёстких сетях.
- Важный технический фактор: отправка offer/answer после ICE gathering (или timeout guard), чтобы не терять релевантные кандидаты.
- Операционные признаки “всё ок”:
  - API `call.offer/call.answer/call.ice/call.mic_state` идут стабильно,
  - TURN показывает `ALLOCATE -> CREATE_PERMISSION -> CHANNEL_BIND` + ненулевой `peer usage`.

## 2026-03-01 — Voice test baseline fixed (relay + TURN TLS/TCP)

### Delivered

- Зафиксирован рабочий baseline для voice в `test`:
  - `TEST_VITE_RTC_ICE_TRANSPORT_POLICY=relay`
  - `TEST_VITE_RTC_ICE_SERVERS_JSON=[{"urls":["turns:gismalink.art:5349?transport=tcp"],"username":"<turn-username>","credential":"<turn-password>"}]`
- Подтверждён рабочий путь медиа через TURN в live-сессии:
  - API: стабильные `call.offer`/`call.answer`/`call.ice` + `call.mic_state`.
  - TURN: `ALLOCATE` -> `CREATE_PERMISSION` -> `CHANNEL_BIND`.
  - TURN `peer usage` ненулевой (идёт реальный медиатрафик).

### Operational evidence (test)

- В окне 120s получены счётчики API: `offer=12`, `answer=12`, `ice=18`, `mic_state=228`.
- В том же окне TURN показывал ненулевые `peer usage` (`rb/sb`) для пользователя `<turn-username>`.
- Конфигурация принята как baseline для дальнейших voice-smoke в `test`.

## 2026-02-28 — Rooms: category collapse + channel archive flow

### Delivered

- Добавлено soft-archive поведение для каналов:
  - `DELETE /v1/rooms/:roomId` теперь архивирует канал (`is_archived=true`) вместо физического удаления,
  - защита `last room` и `general` сохранена,
  - архивные каналы исключены из `GET /v1/rooms`, `GET /v1/rooms/tree`, join-check в realtime и `GET /v1/rooms/:slug/messages`.
- Добавлена DB-схема для архивирования:
  - `rooms.is_archived BOOLEAN NOT NULL DEFAULT FALSE`,
  - индекс `idx_rooms_archived`.
- В web sidebar добавлено сворачивание/разворачивание категорий:
  - toggle на заголовке категории,
  - persist состояния в `localStorage` (`boltorezka_collapsed_category_ids`).
- UI формулировка удаления канала заменена на архивирование (`Archive channel`) в channel settings и confirm popup.

### Validation

- `npm run check:api-types` — PASS.
- `npm run web:build` — PASS.

### Operational evidence (test)

- Готово к деплою в `test` через стандартный `TEST_REF=origin/<feature> npm run deploy:test:smoke`.

## 2026-02-28 — Smoke API: hierarchy create/navigation scenario

### Delivered

- Расширен `scripts/smoke-api.mjs` проверкой иерархии каналов:
  - create category (`POST /v1/room-categories`),
  - create channel в созданной категории (`POST /v1/rooms`),
  - verify через `GET /v1/rooms/tree`,
  - обязательный cleanup (`DELETE /v1/rooms/:roomId` и `DELETE /v1/room-categories/:categoryId`).
- Добавлен env-toggle `SMOKE_ROOM_HIERARCHY` (по умолчанию включён, отключается через `SMOKE_ROOM_HIERARCHY=0`).
- Синхронизированы docs:
  - `docs/status/ROADMAP.md` (checkbox hierarchy smoke/e2e отмечен выполненным),
  - `docs/operations/SMOKE_CI_MATRIX.md` (contract coverage дополнен hierarchy smoke блоком).

### Validation

- `node --check scripts/smoke-api.mjs` — PASS.

### Operational evidence (test)

- Выполняется в standard API smoke path (`SMOKE_API=1 npm run check`) при наличии `SMOKE_BEARER_TOKEN`.

## 2026-02-28 — Postdeploy smoke: include API smoke stage

### Delivered

- В `scripts/examples/postdeploy-smoke-test.sh` добавлен запуск `npm run smoke:api` сразу после `smoke:sso`.
- Новая последовательность для `deploy:test:smoke`: `smoke:sso` -> `smoke:api` -> `smoke:realtime`.
- Добавлен toggle `SMOKE_API=0` для явного пропуска API stage (по умолчанию stage включён).

### Validation

- `bash -n scripts/examples/postdeploy-smoke-test.sh` — PASS.

### Operational evidence (test)

- Входит в стандартный `deploy:test:smoke` postdeploy pipeline.

## 2026-02-28 — Postdeploy smoke: auto-bearer for protected API checks

### Delivered

- В `scripts/examples/postdeploy-smoke-test.sh` добавлена server-side генерация `SMOKE_BEARER_TOKEN` (HS256 JWT) на базе `JWT_SECRET` + smoke user из test DB.
- Благодаря этому `smoke:api` в postdeploy больше не зависит от ручной передачи bearer и может выполнять protected API блоки (включая hierarchy smoke).
- Логика auto-ticket для realtime сохранена; user meta переиспользуется для ticket payload.
- Исправлен порядок шагов: bearer формируется до запуска `smoke:api`.
- Добавлены fallback-источники секрета: `TEST_JWT_SECRET` и `JWT_SECRET` из env api-контейнера.

### Validation

- `bash -n scripts/examples/postdeploy-smoke-test.sh` — PASS.

### Operational evidence (test)

- Верифицируется через стандартный `TEST_REF=origin/<branch> npm run deploy:test:smoke`.

## 2026-02-28 — Realtime presence + channel UX/chat style stabilization

### Delivered

- Переведён источник участников каналов на realtime presence snapshot по всем комнатам:
  - backend broadcast `rooms.presence` (map `roomSlug -> users[]`),
  - web sidebar рендерит участников каналов из live presence map.
- Убрана проблема дубликатов/устаревших участников в channel member list.
- Введена политика single-active channel для non-text join flow (last join wins без logout):
  - при новом join в non-text канал предыдущие non-text channel-сессии пользователя освобождаются,
  - text chat доступ сохраняется.
- Добавлен стек тостов в web (по паттерну `projo`, но с локальными стилями):
  - уведомления об ошибках ws,
  - уведомление о принудительном переносе channel session.
- Доработан sidebar channels UX:
  - более компактная подложка channel-row,
  - подсветка текущего пользователя в member-list,
  - удалён правый блок `People in room` как избыточный.
- Typography/chat polish:
  - body text переведён на `Noto Sans Mono` (heading-шрифт сохранён прежним),
  - chat message layout перестроен в более структурный формат (avatar/meta/text),
  - финальная версия — нейтральная подложка сообщения в фирменном стиле (без Telegram bubble).

### Validation

- `npm run -s web:build` — PASS.
- `npm run check:api-types` — PASS.

### Operational evidence (test)

- Deploy target: `test`, branch `feature/web-header-profile-menu`, SHA `c52890d`.
- Command: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'`.
- Smoke result:
  - `smoke:sso` — PASS,
  - `smoke:realtime` — PASS,
  - `reconnectOk=true`, `reconnectSkipped=false`.

## 2026-02-28 — Remove non-admin create-rooms hint text

_Для серии инкрементов `feature/web-header-profile-menu` используется один и тот же базовый gate: `check:api-types` + `apps/web build` + `deploy:test:smoke` (`smoke:sso`, `smoke:realtime`) — PASS, если не указано иное._

### Delivered

- Removed the non-admin helper text under Rooms header (`Only admin/super_admin can create rooms.`).
- Kept admin-only compact hint unchanged.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.

## 2026-02-28 — Channel members in all channels + delete flow fix

### Delivered

- В `rooms/tree` и `rooms` добавлены `member_names` для каждого канала, чтобы UI мог показывать людей в других каналах даже без join.
- Sidebar now показывает список людей под каждым каналом (для активного канала — объединение `member_names` + live presence).
- Исправлена регрессия удаления каналов/групп: confirm overlay помечен как `popup-layer-content`, поэтому глобальный outside-click больше не закрывает settings popup до подтверждения `Yes`.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.

## 2026-02-28 — Realtime smoke stabilization: protect default `general` room

### Delivered

- Найдена причина падения `smoke:realtime`: `room.join` получал `RoomNotFound` для `general`.
- Добавлена backend-защита: `DELETE /v1/rooms/:roomId` теперь блокирует удаление default-комнаты `general` (`409 DefaultRoomProtected`).
- В `test` БД восстановлена отсутствующая комната `general`.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS; после восстановления `general` выполнен повторный `postdeploy` smoke.

## 2026-02-28 — Overlay confirm UX polish + channel members in sidebar list

### Delivered

- Confirm popup для `Delete/Clear` теперь закрывается:
  - по `Esc`,
  - по клику на затемнённый фон (backdrop).
- В списке каналов начато отображение участников активного канала (под строкой канала, как в Discord-style примере):
  - аватар-инициал,
  - имя,
  - иконки voice-статуса.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.

## 2026-02-28 — Confirm actions moved to separate overlay popup

### Delivered

- Подтверждения `Delete`/`Clear chat` вынесены из inline-блока внутри popup настроек канала/группы в отдельный popup-оверлей поверх интерфейса.
- Кнопки подтверждения теперь `Yes/No` в отдельном компактном диалоге, чтобы UI не выходил за границы родительского popup.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.

## 2026-02-28 — Admin action: clear chat messages in any room

### Delivered

- Добавлено админ-право очистки содержимого любого чата:
  - `DELETE /v1/rooms/:roomId/messages` (только `admin` / `super_admin`).
- В popup настроек канала добавлена кнопка `Clear chat` с inline-подтверждением (в том же popup).
- Для текущего открытого чата после успешной очистки UI сразу очищает список сообщений и сбрасывает пагинацию.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.

## 2026-02-28 — Category delete safeguard + room people list + sidebar hover polish

### Delivered

- Добавлена защита удаления группы (категории):
  - `DELETE /v1/room-categories/:categoryId` теперь возвращает `409 CategoryNotEmpty`, если в группе есть каналы.
- Добавлен список людей в текущей комнате в правой колонке (`People in room`) на основе `room.presence`.
- Для строки группы (`category-title-row`) кнопки `+` и шестерёнка переведены в hover/focus режим (как у каналов).
- Повторный клик по уже активному каналу отключён (кнопка текущего канала disabled), чтобы чат не очищался повторно.

### Validation

- `npm run check:api-types` — PASS.
- `npm --prefix apps/web run build` — PASS.

### Operational evidence (test)

- Deploy target: `test`, branch `feature/web-header-profile-menu`.
- Smoke: `smoke:sso` / `smoke:realtime` — PASS (после деплоя изменений).

## 2026-02-28 — Delete safety: protect last room

### Delivered

- В backend удаление канала теперь защищено от удаления последней оставшейся комнаты.
- `DELETE /v1/rooms/:roomId` возвращает `409 LastRoomProtected`, если в системе осталась только одна комната.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.

## 2026-02-28 — Delete channel/category from gear popup with inline confirm

### Delivered

- Добавлены backend endpoint’ы удаления для админов:
  - `DELETE /v1/rooms/:roomId`
  - `DELETE /v1/room-categories/:categoryId`
- В `web` добавлены API/controller методы удаления категории и канала с синхронизацией `rooms/tree` после операции.
- В popups шестерёнки (категория/канал) добавлена кнопка удаления и маленький inline popup подтверждения (`Cancel` / `Delete`) прямо внутри этого же popup.
- Для удаления активного канала добавлен fallback-переход в другой канал (`general` при наличии).

### Validation

- `npm run check:api-types` — PASS.
- `npm --prefix apps/web run build` — PASS.

### Operational evidence (test)

- Deploy target: `test`, branch `feature/web-header-profile-menu`, SHA `0432c37`.
- Command: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'`.
- Smoke result:
  - `smoke:sso` — PASS,
  - `smoke:realtime` — PASS,
  - `reconnectOk=true`, `reconnectSkipped=false`.

## 2026-02-28 — Test DB seed: screenshot-like chat structure

### Delivered

- Добавлен идемпотентный SQL-сид для структуры категорий/чатов: `scripts/examples/seed-chatset.sql`.
- Сид применён в `test` БД на сервере (`boltorezka-db-test`) через `docker compose exec ... psql`.
- Созданы категории и каналы по присланному макету (текстовый канал + блоки `СТАТУС`, `КОМНАТЫ`, `ЗАПОВЕДНИК`, `Kontrollräume`).

### Validation

- Проверочная выборка в test БД вернула ожидаемые категории/каналы в заданном порядке (`22 rows`, включая уже существующие старые категории).

### Operational evidence (test)

- Seed file: `scripts/examples/seed-chatset.sql`.
- Command pattern: `cat /tmp/boltorezka_seed_chatset.sql | docker compose ... exec -T boltorezka-db-test psql ...`.
- Result: `INSERT 0 5` (categories), `INSERT 0 20` (rooms), `COMMIT`.

## 2026-02-28 — Headings font update: Jersey 25

_Для визуальных/UX инкрементов ниже используется единый test-flow: `web:build` + `check:api-types` (где применимо) + `deploy:test:smoke` на `feature/web-header-profile-menu`; smoke (`smoke:sso`, `smoke:realtime`) — PASS, если не указано иное._

### Delivered

- Для заголовков (`h1`, `h2`, `h3`) подключен и применён Google Font `Jersey 25`.
- Базовые fallback-шрифты сохранены.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `c308504`.

## 2026-02-28 — Layout fixes: user dock ellipsis + viewport clamp + right-column scroll

### Delivered

- Исправлено обрезание имени пользователя в нижнем dock: длинные имена теперь корректно режутся с `...`.
- Ограничена высота приложения экраном (`viewport`), чтобы контент не расталкивал страницу по высоте.
- Правая колонка получила собственный вертикальный скролл.
- В форме чата кнопка `Send` выровнена в один ряд с input.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `76a2501`.

## 2026-02-28 — Voice submenu smart side placement (portal)

### Delivered

- Extended popup layer placement modes with side anchors:
  - `right-start` / `right-end`
  - `left-start` / `left-end`
- Added automatic horizontal flip for side popups when viewport space is insufficient.
- Migrated user dock nested voice submenus (`Устройство ввода` / `Профиль ввода`) to portal side-placement.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `9dc067c`.

## 2026-02-28 — Popup layer system (portal-based)

### Delivered

- Added reusable popup portal layer component:
  - `apps/web/src/components/PopupPortal.tsx`.
- Migrated main UI popups to dedicated layer rendered under `document.body`:
  - auth/profile menu popups,
  - rooms create/category/channel settings popups,
  - user dock voice/input/output popups.
- Added viewport-aware popup positioning with auto flip (vertical/horizontal).
- Updated outside-click handling so popup-layer content is treated as "inside" interaction.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `c653a87`.

## 2026-02-28 — Chat layout stabilization + media device persistence/fallback

### Delivered

- Stabilized chat panel layout:
  - fixed-height middle chat card,
  - internal chat scroll only,
  - auto-scroll to latest message on room change/new message.
- Moved debug signaling block (`Call signaling (MVP)`) under `Event Log` in right column.
- Added persistence for selected audio devices:
  - `boltorezka_selected_input_id`,
  - `boltorezka_selected_output_id` (restore on reload).
- Added media-device fallback states in user voice UI:
  - `unsupported`, `denied`, `error` with clear warning text,
  - disabled device selectors when devices are unavailable.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `6ddd66f`.

## 2026-02-28 — User panel voice UX: output device dropdown + voice settings popup

### Delivered

- В user dock добавлен popup выбора output device (headset control).
- Добавлен voice settings popup:
  - input/output device selectors,
  - input sensitivity slider,
  - output volume slider,
  - persisted local values для volume/sensitivity.
- Добавлено закрытие popup-элементов по click-outside для более предсказуемого UX.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `a8f4ce4`.

## 2026-02-28 — User panel revisit: bottom user dock + RTC connection card

### Delivered

- Добавлен нижний user dock в левой колонке:
  - avatar badge,
  - user name + presence line,
  - quick controls (mic/audio/settings) на Bootstrap Icons.
- Для каналов с RTC-capability добавлен компактный блок `Подключение к RTC` над user dock.
- В channel row сохранён только icon-сигнал типа (без текстового дубля).

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `6fa7ba1`.

## 2026-02-28 — Category settings popup + channel row cleanup

### Delivered

- Добавлен popup настроек категории:
  - rename category title,
  - move category up/down.
- Backend endpoints для category settings:
  - `PATCH /v1/room-categories/:categoryId`
  - `POST /v1/room-categories/:categoryId/move`
- В channel row убран текстовый дубль типа канала — теперь тип считывается только из иконки.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `a4551df`.

## 2026-02-28 — Channel row UX update: Bootstrap Icons + settings popup + stronger active state

### Delivered

- Emoji в action controls заменены на Bootstrap Icons (free icon set).
- Добавлен popup настроек канала (admin/super_admin):
  - rename title,
  - mode switch (`text` / `text_voice` / `text_voice_video`),
  - category reassignment,
  - move up/down в пределах текущей категории.
- Backend endpoints для popup settings:
  - `PATCH /v1/rooms/:roomId`
  - `POST /v1/rooms/:roomId/move`
- В sidebar channel row active-state сделан заметнее:
  - яркий фон,
  - accent-граница,
  - более явный контраст текста.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `00bce89`.

## 2026-02-28 — Channel modes update: text / text+voice / text+voice+video

### Delivered

- Модель `kind` каналов переведена на 3 режима:
  - `text`
  - `text_voice`
  - `text_voice_video`
- Добавлена backward compatibility миграция:
  - существующие `kind='voice'` автоматически нормализуются в `text_voice`.
- Добавлена/обновлена DB constraint проверка допустимых значений `rooms.kind`.
- Web UI updated:
  - popup create-channel использует 3 новых режима,
  - в channel list режим отображается рядом с названием.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `8b9b5e7`.

## 2026-02-28 — Sidebar UX compacting: popups + icons + custom tooltip

### Delivered

- Room/category create controls перенесены из inline-форм в popup panel (sidebar остаётся компактным).
- Добавлены icon-first actions в sidebar и category rows (`➕`, `🗂️`) вместо длинных текстовых control-кнопок.
- Добавлен кастомный tooltip portal (`data-tooltip`) по референсу из `projo`:
  - `apps/web/src/TooltipPortal.tsx`
  - интеграция в `apps/web/src/App.tsx`.
- Web styling migrated to SCSS:
  - `apps/web/src/styles.scss`
  - entrypoint импорт обновлён в `apps/web/src/main.tsx`.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `d55b588`.

## 2026-02-28 — Discord-like channel structure foundation (Phase A/B MVP)

### Delivered

- Backend schema evolution:
  - `room_categories` table,
  - `rooms.kind` (`text`/`voice`),
  - `rooms.category_id`, `rooms.position`.
- New API endpoints:
  - `GET /v1/rooms/tree` (categories + channels + uncategorized),
  - `POST /v1/room-categories` (admin/super_admin).
- `POST /v1/rooms` расширен полями `kind`, `category_id`, `position`.
- Web admin flow:
  - create category,
  - create channel (`text`/`voice`) с привязкой к категории,
  - sidebar tree grouping по категориям с иконками типа канала.

### Validation / Operational evidence (test)

- Стандартный gate для `feature/web-header-profile-menu` — PASS.
- Deploy SHA: `c7bb6c8`.

## 2026-02-28 — Realtime smoke hardening: reconnect + idempotency

### Delivered

- `scripts/smoke-realtime.mjs` расширен reconnect-сценарием (`SMOKE_RECONNECT=1`):
  - reconnect websocket после базового ack/idempotency path,
  - повторный `room.join` после reconnect,
  - `chat.send` + `ack` проверка после reconnect.
- В smoke output добавлен флаг `reconnectOk`.
- `scripts/examples/postdeploy-smoke-test.sh` теперь запускает realtime smoke с `SMOKE_RECONNECT=1`.

### Roadmap impact

- Закрыт пункт Phase 2: стабильный smoke для reconnect/idempotency.

### Operational evidence (test)

- Deploy target: `test`, branch `feature/web-header-profile-menu`, SHA `0e99f24`.
- Deploy command: стандартный `deploy:test:smoke` flow для ветки.
- Realtime smoke output:
  - `ok=true`
  - `reconnectOk=true`
  - `reconnectSkipped=false`
- Причина финального фикс-коммита: postdeploy smoke теперь автогенерирует второй ws-ticket (`SMOKE_WS_TICKET_RECONNECT`) для reconnect path без ручного bearer-token.

## 2026-02-28 — Realtime TS hardening batch

### Scope

- Backend runtime API переведён на TypeScript (`.ts`) и strict-ориентированный workflow.
- Realtime handler приведён к typed known-event dispatch и централизованным helper-путям.
- Документация runbook/checklist синхронизирована под текущий deploy/smoke flow.

### Delivered

- WS incoming envelope typing расширен (known/unknown envelopes).
- Добавлен/усилен typed protocol слой (`ws-protocol.ts`, `ws-protocol.types.ts`).
- `realtime` switch-dispatch по known событиям (`ping`, `room.join`, `chat.send`, `call.*`).
- Удалены дубли relay-веток для `call.offer/answer/ice/reject/hangup`.
- Централизованы helper-пути для `ack`/`nack`/validation/unknown event.
- Закрыт устаревший request-context слой.

### Operational evidence

- Многократные циклы:
  - local `npm run check:api-types`
  - local `npm run check`
  - test rollout: `TEST_REF=origin/feature/call-hangup-lifecycle npm run deploy:test:smoke`
  - extended realtime relay smoke: `SMOKE_CALL_SIGNAL=1` + 2 ws-ticket
- Последние подтверждённые extended relay результаты:
  - `callSignalRelayed=true`
  - `callRejectRelayed=true`
  - `callHangupRelayed=true`

### Key commits (feature/call-hangup-lifecycle)

- `729dadf` refactor(api): extract room join denied nack helper
- `09bd040` refactor(api): centralize unknown envelope nack handling
- `65dd0d3` refactor(api): centralize ack metric tracking
- `de70449` refactor(api): centralize validation nack responses
- `6db2848` refactor(api): extract shared room/target nack helpers
- `914b47e` refactor(api): tighten ws known-envelope and terminal call handling
- `ae23ba3` refactor(api): deduplicate call relay dispatch logic
- `87c11d2` switch realtime ws handler to known event dispatch

## 2026-02-28 — Documentation sync batch

### Delivered

- Merge/release guardrails добавлены в workflow/preprod checklist.
- Quickstart/runbook обновлены на актуальный Boltorezka test deploy flow.
- ROADMAP отделён от feature history (теперь только plan).
- Зафиксировано правило: `prod` откладывается до MVP-like readiness.
- Добавлены каноничные контрактные документы:
  - `docs/contracts/API_CONTRACT_V1.md`
  - `docs/contracts/WS_CONTRACT_V1.md`
- Добавлен OpenAPI artifact v1: `docs/contracts/OPENAPI_V1.yaml`.
- Добавлена матрица smoke/CI gate: `docs/operations/SMOKE_CI_MATRIX.md`.

## 2026-02-28 — Realtime MVP increment: room.leave

### Delivered

- Добавлена поддержка client event `room.leave` в realtime handler.
- Добавлен server event `room.left` с подтверждением выхода из комнаты.
- Обновлён WS контракт (`docs/contracts/WS_CONTRACT_V1.md`) и roadmap статус Phase 2.

## 2026-02-28 — Realtime MVP increment: message history pagination

### Delivered

- `/v1/rooms/:slug/messages` переведён на cursor pagination (`beforeCreatedAt` + `beforeId`).
- Ответ endpoint дополнен `pagination.hasMore` и `pagination.nextCursor`.
- Обновлены `docs/contracts/API_CONTRACT_V1.md` и `docs/contracts/OPENAPI_V1.yaml`.
- Обновлён `scripts/smoke-api.mjs` с проверкой pagination contract и second-page smoke path.

### Key commits

- `30d49a4` feat(api): add cursor pagination for room message history
- `3fa3817` docs: add merge and release pipeline reminder checklist
- `c68378a` docs: add merge and post-merge guardrails to preprod checklist
- `7ba3a90` docs: synchronize architecture, runbooks, and next-step plan

### Operational evidence

- Local checks: `npm run check:api-types && npm run check` — PASS.
- Test rollout/smoke: `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke` — PASS.
- Extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1` + 2 ws-ticket) — PASS:
  - `callSignalRelayed=true`
  - `callRejectRelayed=true`
  - `callHangupRelayed=true`

## 2026-02-28 — Web UI MVP increment: history pagination control

### Delivered

- React chat UI (`apps/web`) подключён к cursor pagination history endpoint.
- Добавлена кнопка `Load older messages` в chat panel.
- Реализованы клиентские состояния `hasMore/nextCursor/loadingOlder`.
- При подгрузке старых страниц выполняется prepend + dedupe по `message.id`.

### Validation

- Web build: `npm run web:build` — PASS.
- Commit: `abbcfc2` (`main`).
- Test rollout/smoke: `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke` — PASS.
- Extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1` + 2 ws-ticket) — PASS:
  - `callSignalRelayed=true`
  - `callRejectRelayed=true`
  - `callHangupRelayed=true`

## 2026-02-28 — Web UI 8-bit theme baseline

### Delivered

- Глобальная 8-bit стилизация React UI в `apps/web/src/styles.scss`:
  - ретро-палитра и pixel-like typography,
  - квадратные рамки/тени для карточек, контролов, попапов и тултипов,
  - единый стиль для chat/log/pre, RTC cards и voice settings панелей,
  - визуальная консистентность для delivery/active/device состояний.

### Validation

- Local check: `npm run web:build` — PASS.
- Commit: `13d9b64` (`feature/web-header-profile-menu`).
- Test rollout/smoke: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'` — PASS.
- Smoke result:
  - `smoke:sso` — PASS,
  - `smoke:realtime` — PASS,
  - `reconnectOk=true`.
- Refinement pass: `2305326` (`feature/web-header-profile-menu`) + повторный `deploy:test:smoke` — PASS.
- Neon + hard-square shadows pass: `c390fa8` (`feature/web-header-profile-menu`) + повторный `deploy:test:smoke` — PASS (`smoke:sso`, `smoke:realtime`, `reconnectOk=true`).
- Gismalink palette alignment pass: `039e574` (`feature/web-header-profile-menu`) с переносом core-цветов из `GismalinkArt/site/css/styles.css` (`#07060a`, `#2d0f27`, `#38002e`, `#cf4a86`, `#35e6ff`, `#e57f12`) + повторный `deploy:test:smoke` — PASS (`smoke:sso`, `smoke:realtime`, `reconnectOk=true`).
- SCSS modularization pass: `189f8ba` (`feature/web-header-profile-menu`) — `styles.scss` разбит на partial-файлы (`styles/_tokens.scss`, `_base.scss`, `_layout.scss`, `_overlays.scss`, `_rooms-chat.scss`, `_user-dock-voice.scss`, `_responsive.scss`) с сохранением текущего UX/визуала; повторный `deploy:test:smoke` — PASS (`smoke:sso`, `smoke:realtime`, `reconnectOk=true`).
- Scale tokens pass: `1df97bd` (`feature/web-header-profile-menu`) — добавлен `styles/_scale.scss` и вынесены повторяющиеся размеры (spacing/border/icon/offset/font-size) из модулей `base/layout/overlays/rooms-chat/user-dock-voice`; повторный `deploy:test:smoke` — PASS (`smoke:sso`, `smoke:realtime`, `reconnectOk=true`).
- Roadmap big-block (web e2e smoke): добавлен единый оркестратор `scripts/smoke-web-e2e.sh` (`smoke:sso` + `smoke:realtime` с `SMOKE_CALL_SIGNAL=1`, `SMOKE_RECONNECT=1`), подключён `npm run smoke:web:e2e`, добавлена опциональная verify-gate `SMOKE_WEB_E2E=1` в `scripts/verify-all.sh`; чекбокс Phase 4 для e2e smoke сценариев (`login/join/send/voice connect-disconnect`) переведён в `[x]`.
  - Validation: `bash -n scripts/smoke-web-e2e.sh`, `npm run web:build`, `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso` — PASS.
  - Test rollout: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'` (SHA `49abe56`) — PASS (`smoke:sso`, `smoke:realtime`, `reconnectOk=true`).
- Roadmap big-block (pre-prod decision package): добавлен `docs/runbooks/PREPROD_DECISION_PACKAGE.md` (decision summary, evidence snapshot, rollback owner model, command-level rollback plan, approval form), в `docs/runbooks/PREPROD_CHECKLIST.md` добавлена обязательная ссылка на пакет, в `docs/status/ROADMAP.md` пункт execution plan #5 переведён в `[x]`.
- Roadmap block continuation (MVP-like readiness gate): в `docs/runbooks/PREPROD_DECISION_PACKAGE.md` добавлен структурированный gate (`mandatory GO criteria`, `automatic NO-GO`, `pre-prod gate record`), `docs/runbooks/PREPROD_CHECKLIST.md` синхронизирован ссылкой на этот gate, в `docs/status/ROADMAP.md` пункт #6 разделён на `gate formalized [x]` и `explicit GO + prod rollout [ ]`.
- Pre-prod gate draft: в `docs/runbooks/PREPROD_DECISION_PACKAGE.md` добавлен `Current draft gate record (2026-02-28)` с фактическими статусами (`smoke:sso=PASS`, `smoke:realtime=PASS`, `reconnectOk=true`, `smoke:web:e2e=PENDING`, `call relay=PENDING`) и итогом `NO-GO` до закрытия pending-пунктов + owner sign-off.
- Pre-prod gate update: `smoke:web:e2e` успешно выполнен на сервере (`SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:web:e2e`), relay path закрыт (`callSignalRelayed=true`, `callRejectRelayed=true`, `callHangupRelayed=true`); в draft gate-record pending-пункты переведены в `PASS`, итог остаётся `NO-GO` до explicit owner sign-off и prod approval.
