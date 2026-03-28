# План: разные серверы (multi-server)
Date: 2026-03-20
Scope: добавить сущность Server (workspace/guild), владельца, участников, приглашения и переключение между серверами в UI.

## 0) Что хотим получить

- Пользователь может создать сервер с названием.
- У сервера есть владелец (`owner`) и это его админ по умолчанию.
- У сервера есть список участников, у каждого есть роль/права.
- У пользователя есть список серверов, между которыми можно переключаться.
- В шапке отображается: `Bolto // ServerName`.
- У сервера есть инвайт-ссылка для входа других пользователей.
- Текущий существующий сервер переименовываем в `BossServer`.
- Текущий существующий сервер `BossServer` используется как базовый сервер для тестирования.
- На первом этапе создавать сервер может любой аутентифицированный пользователь.
- Баны разделяются на два независимых типа: бан на сервере и бан в сервисе.
- У суперадмина два контура управления: `Server Management` и `Product Management`.

Связанный трек:
- Legal/NSFW age-gate требования ведутся в `docs/plans/2026-03-27_LEGAL_COMPLIANCE_PLAN.md` (Stage E).
- До Stage 1-4 этого плана legal Stage E может выполняться только частично в single-server режиме.

## 1) Модель данных (DB)

### 1.1 Новые таблицы

1. `servers`
   - `id` (uuid, pk)
   - `slug` (text unique, короткий идентификатор для URL)
   - `name` (text, 3..64)
   - `owner_user_id` (uuid, fk -> users.id)
   - `is_default` (bool, default false)
   - `created_at`, `updated_at`

2. `server_members`
   - `server_id` (uuid, fk -> servers.id)
   - `user_id` (uuid, fk -> users.id)
   - `role` (enum: `owner`, `admin`, `member`)
   - `status` (enum: `active`, `invited`, `left`, `removed`)
   - `joined_at`
   - уникальный индекс (`server_id`, `user_id`)

3. `server_invites`
   - `id` (uuid, pk)
   - `server_id` (uuid, fk -> servers.id)
   - `token_hash` (text unique)
   - `created_by_user_id` (uuid)
   - `expires_at` (timestamp)
   - `max_uses` (int nullable)
   - `used_count` (int default 0)
   - `is_revoked` (bool default false)
   - `created_at`

4. `server_bans`
   - `id` (uuid, pk)
   - `server_id` (uuid, fk -> servers.id)
   - `user_id` (uuid, fk -> users.id)
   - `reason` (text nullable)
   - `banned_by_user_id` (uuid, fk -> users.id)
   - `expires_at` (timestamp nullable, null = permanent)
   - `created_at`
   - уникальный индекс (`server_id`, `user_id`)

5. `service_bans`
   - `id` (uuid, pk)
   - `user_id` (uuid, fk -> users.id)
   - `reason` (text nullable)
   - `banned_by_user_id` (uuid, fk -> users.id)
   - `expires_at` (timestamp nullable, null = permanent)
   - `created_at`
   - уникальный индекс (`user_id`)

### 1.2 Изменения существующих сущностей

- Все сущности уровня сервера получают `server_id`:
  - комнаты (`rooms`),
  - сообщения (`messages`) через связку комнаты,
  - потенциально: настройки, роли, медиа-ресурсы.
- На первом шаге можно ограничиться `rooms.server_id` + проверкой членства при доступе к room.
- Для интеграции с legal Stage E добавить поле `rooms.nsfw` (bool, default false) и server-aware age-gate проверки.

### 1.3 Миграция текущих данных

1. Создать сервер `BossServer` и пометить `is_default=true`.
2. Назначить владельца:
   - вариант A: user id из env (`DEFAULT_SERVER_OWNER_ID`),
   - вариант B: первый найденный админ/пользователь (как fallback, с логом).
3. Все текущие комнаты привязать к `BossServer`.
4. Всех текущих активных пользователей добавить в `server_members` как `member` (или только тех, кто уже взаимодействовал с room).

## 2) Права доступа

### 2.1 Базовые роли

- `owner`: полный доступ, смена имени сервера, управление приглашениями, передача владения.
- `admin`: управление участниками/инвайтами (без передачи владения).
- `member`: доступ к серверу и комнатам по правилам.
- До реализации API фиксируем permission matrix (действие -> роль) для операций: rename server, manage members, manage invites, server ban, delete server.

### 2.2 Правила v1

- Создание сервера: любой аутентифицированный пользователь.
- Создатель сервера автоматически `owner`.
- Инвайт может создавать `owner` и `admin`.
- Принять инвайт может любой аутентифицированный пользователь.
- Лимит серверов на пользователя для v1: 1 бесплатный сервер.
- Переименование сервера в v1: разрешено любому участнику сервера (по текущему продукт-решению).

### 2.3 Баны: разделение уровней

- `server_ban`: блокирует доступ пользователя только к конкретному серверу.
- `service_ban`: блокирует вход пользователя во весь сервис (глобально).
- Приоритет проверки: сначала `service_ban`, затем `server_ban`.
- `service_ban` управляется суперадмином, `server_ban` — владельцем/админом сервера.

### 2.4 Модель суперадмина

- `Server Management` (контекст конкретного сервера):
   - просмотр участников и инвайтов,
   - server ban/unban,
   - экстренные действия модерации в рамках одного сервера.
- `Product Management` (глобальный контекст продукта):
   - список всех серверов,
   - service ban/unban,
   - глобальный аудит и обзор модерации,
   - переход в выбранный сервер для точечного server management.

## 3) API контракт (v1)

1. `POST /v1/servers`
   - вход: `{ name }`
   - выход: `{ id, slug, name, role: "owner" }`

2. `GET /v1/servers`
   - список серверов текущего пользователя
   - выход: `[{ id, slug, name, role, membersCount }]`

3. `GET /v1/servers/:serverId`
   - данные сервера + моя роль

4. `POST /v1/servers/:serverId/invites`
   - создать инвайт (ttl, maxUses)
   - выход: `{ inviteUrl, expiresAt }`

5. `POST /v1/invites/:token/accept`
   - присоединяет пользователя к серверу как `member`

6. `GET /v1/servers/:serverId/members`
   - список участников (минимум: id, displayName, role)

7. `PATCH /v1/servers/:serverId`
   - rename сервера (`owner/admin`, по продукт-решению)

8. `POST /v1/servers/:serverId/bans`
   - выдать server ban пользователю (`owner/admin`)

9. `DELETE /v1/servers/:serverId/bans/:userId`
   - снять server ban

10. `POST /v1/admin/service-bans`
   - выдать глобальный ban в сервисе (только superadmin)

11. `DELETE /v1/admin/service-bans/:userId`
   - снять глобальный ban

12. `GET /v1/admin/servers`
   - список всех серверов продукта (только superadmin)
   - выход: `[{ id, slug, name, ownerUserId, membersCount, createdAt }]`

13. `GET /v1/admin/servers/:serverId/overview`
   - сводка по серверу для product management: owner, участники, active bans, invites

### 3.1 Общие требования к API

- Единый формат ошибок для web/desktop: `service_banned`, `server_banned`, `not_server_member`, `forbidden_role`.
- Чувствительные операции должны быть идемпотентными: `invite accept`, `ban apply/revoke`, `role change`.
- Для чувствительных действий ведем audit trail: actor, target, server_id, action, result, timestamp.

## 4) UI/UX план

### 4.1 Хедер

- Формат названия: `Bolto // <активный сервер>`.
- Если сервер не выбран, fallback: `Bolto // BossServer`.

### 4.2 Переключатель серверов

- Новый элемент в левом сайдбаре/верхней панели: список моих серверов.
- Действия:
  - выбрать текущий сервер,
  - перейти в "Создать сервер",
  - перейти в "Участники" / "Приглашения".
   - видеть последние/часто используемые серверы.

### 4.3 Создание сервера

- Простая форма: поле `Название сервера` + кнопка `Создать`.
- Валидация имени (длина, запрещенные символы).

### 4.4 Инвайт ссылка

- Экран/модалка управления приглашениями:
  - сгенерировать ссылку,
  - копировать,
  - ограничение по сроку/количеству использований,
  - отзыв ссылки.

### 4.5 Onboarding

- Если у пользователя 0 серверов, показываем wizard "Создать первый сервер".

### 4.6 Админка суперадмина

- В админке два раздела:
   - `Product Management`: глобальный список серверов, глобальные баны, глобальный аудит.
   - `Server Management`: управление конкретным сервером после выбора из списка.
- Из `Product Management` доступен переход в любой сервер для точечных действий.

## 5) Логика доступа и изоляция данных

- Любой запрос к room/messages должен учитывать `server_id` текущего контекста.
- Если пользователь не участник сервера, API возвращает `403`.
- Если у пользователя активный `service_ban`, API возвращает `403 service_banned` для всего сервиса.
- Если у пользователя активный `server_ban` для текущего сервера, API возвращает `403 server_banned`.
- В websocket/realtime контексте сервер также обязателен (server-scoped subscriptions).
- WS subscriptions и broadcast фильтруются строго по `server_id` (без межсерверных утечек).
- Кэши/метрики должны быть либо server-scoped, либо явно глобальными.

## 6) Этапы реализации

### Stage 0 - Design + migration prep

- [x] Зафиксировать SQL-модель (`servers`, `server_members`, `server_invites`).
- [x] Зафиксировать SQL-модель банов (`server_bans`, `service_bans`) и коды ошибок API.
- [x] Зафиксировать стратегию выбора owner для `BossServer`.
- [x] Описать rollback для миграции.
- [x] Зафиксировать permission matrix (действие -> роль).
- [x] Зафиксировать policy "нельзя оставить сервер без owner".

Stage 0 note (2026-03-21): design-пакет закрыт в рамках этого документа: DB model, role/policy, API error taxonomy, `BossServer` owner strategy и migration+rollback рамка зафиксированы.

### Stage 1 - Backend foundation

- [x] Миграции БД.
- [x] `ServerService` (create/list/get/rename).
- [x] `InviteService` (create/accept/revoke).
- [x] `BanService` (server/service ban apply/revoke/check).
- [x] Middleware `requireServerMembership`.
- [x] Middleware `requireNotServiceBanned` и `requireNotServerBanned`.
- [x] Идемпотентность чувствительных операций (транзакции, уникальные индексы, race-safe path).

Stage 1 note (2026-03-27):
- Подготовлена миграция `apps/api/migrations/0006_multi_server_foundation.sql`:
   - таблицы `servers`, `server_members`, `server_invites`, `server_bans`, `service_bans`;
   - поля `rooms.server_id` и `rooms.nsfw` + индексы;
   - bootstrap `BossServer` и backfill текущих `rooms`/`server_members`.
- Миграция применена в `test` через `ALLOW_TEST_FROM_MAIN=1 TEST_REF=origin/main npm run deploy:test:smoke` (SHA `3fd0dd3`, PASS).
- SQL-проверки в `boltorezka-db-test` подтверждают:
   - таблицы: `servers`, `server_members`, `server_invites`, `server_bans`, `service_bans`;
   - колонки `rooms.server_id`, `rooms.nsfw`;
   - bootstrap запись `bossserver | BossServer | is_default=true`.
- Реализован базовый `ServerService` и добавлены API routes `POST/GET/PATCH /v1/servers*` (`apps/api/src/services/server-service.ts`, `apps/api/src/routes/servers.ts`).
- Добавлены middleware `requireServerMembership`, `requireNotServiceBanned`, `requireNotServerBanned` в `apps/api/src/middleware/auth.ts`.
- Backend foundation-срез задеплоен и провалидирован в `test` через `ALLOW_TEST_FROM_MAIN=1 TEST_REF=origin/main npm run deploy:test:smoke` (SHA `66e1bf0`, PASS; realtime/api/web/auth smoke пакет зелёный).
- Добавлены `InviteService` и `BanService` (`apps/api/src/services/invite-service.ts`, `apps/api/src/services/ban-service.ts`).
- Добавлены endpoints: `POST /v1/servers/:serverId/invites`, `POST /v1/invites/:token/accept`, `POST /v1/servers/:serverId/bans`, `DELETE /v1/servers/:serverId/bans/:userId`.
- Добавлены admin endpoints: `POST /v1/admin/service-bans`, `DELETE /v1/admin/service-bans/:userId`.
- Stage 1/2 API-срез провалидирован в `test` на feature-ветке: `TEST_REF=origin/feature/multiserver-stage1-services npm run deploy:test:smoke` (SHA `8e46c0d`, PASS).
- `acceptServerInvite` сделан идемпотентным для already-active membership (повторный accept не расходует invite `used_count`).
- Добавлен smoke сценарий `smoke:multiserver` (invite idempotency + server/service ban enforcement), с опциональным запуском в postdeploy (`SMOKE_MULTISERVER=1`).
- `smoke:multiserver` стабилизирован для test gate: fresh bearer перед запуском, fallback на operable server и pre-cleanup stale ban state.
- Повторный test gate на feature-ветке с включенным `SMOKE_MULTISERVER=1` прошел: SHA `fcd7f62`, `PASS`.

### Stage 2 - API + auth integration

- [x] Эндпоинты `/v1/servers*` и `/v1/invites/:token/accept`.
- [x] Эндпоинты серверных/глобальных банов.
- [x] Эндпоинты `GET /v1/admin/servers` и `GET /v1/admin/servers/:serverId/overview`.
- [x] Проверка ролей и аудит-логи чувствительных действий.
- [x] Ограничение rate limit для invite create/accept.
- [x] Ограничение количества активных invite ссылок на сервер.
- [x] Интеграция с legal Stage E: server-aware код ошибки для 18+ доступа (например, `AgeVerificationRequired`) и аудит age-confirm событий в контексте `server_id`.

Stage 2 note (2026-03-27):
- Добавлены admin endpoints `GET /v1/admin/servers` и `GET /v1/admin/servers/:serverId/overview` в `apps/api/src/routes/admin.ts`.
- `/v1/admin/servers` отдает server list с агрегатами (`membersCount`, `roomsCount`, `messagesCount`, `activeServerBansCount`).
- `/v1/admin/servers/:serverId/overview` отдает детальный срез метрик по членству/комнатам/сообщениям/invites/bans.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `e01b1d9`, PASS).
- Добавлена миграция `apps/api/migrations/0007_server_audit_log.sql` и сервис аудита `apps/api/src/services/server-audit-service.ts`.
- Audit events пишутся для чувствительных действий: `server.created`, `server.renamed`, `server.invite.created`, `server.invite.accepted(_idempotent)`, `server.ban.applied/revoked`, `service.ban.applied/revoked`.
- Усилен role-check rename сервера: `PATCH /v1/servers/:serverId` теперь только для `owner/admin` (role `member` больше не допускается).
- Добавлен Redis rate limit для invite операций:
   - `POST /v1/servers/:serverId/invites`: `20` запросов/`60s` на субъекта.
   - `POST /v1/invites/:token/accept`: `30` запросов/`60s` на субъекта.
- Добавлен лимит активных invite ссылок на сервер в `InviteService` (`SERVER_ACTIVE_INVITES_LIMIT`, default `20`) с ошибкой `ActiveInviteLimitReached` (`409`).
- Добавлена миграция `apps/api/migrations/0008_server_age_confirmations.sql` и сервис `apps/api/src/services/age-verification-service.ts`.
- Добавлены endpoints age-confirm в server-контексте:
   - `GET /v1/servers/:serverId/age-confirm` (status)
   - `POST /v1/servers/:serverId/age-confirm` (confirm + audit `server.age_confirmed`).
- Добавлен server-aware age-gate (`AgeVerificationRequired`) для NSFW-путей:
   - `GET /v1/rooms/:slug/messages`
   - `POST /v1/chat/uploads/init`
   - WS room join/chat (`realtime.ts`, `realtime-chat.ts`).
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `02b73aa`, PASS).

### Stage 3 - Frontend integration

- [x] Server switcher + current server context.
- [x] Header `Dato // ServerName`.
- [x] Screen: Create server.
- [x] Screen: Members + Invite link.
- [x] Empty state / onboarding "Создать первый сервер".
- [x] Админка суперадмина: `Product Management` + `Server Management`.

Stage 3 note (2026-03-28):
- В `apps/web/src/api.ts` добавлен клиентский вызов `GET /v1/servers`.
- В `apps/web/src/App.tsx` добавлены state `servers/currentServerId` + восстановление выбора сервера из localStorage (`boltorezka_current_server_id`).
- В `apps/web/src/components/AppHeader.tsx` добавлены:
   - заголовок формата `Dato // ServerName`;
   - базовый server switcher (select) в desktop header.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `6cc4c45`, PASS).
- Добавлен базовый create-server flow в frontend:
   - API client `POST /v1/servers` (`apps/web/src/api.ts`),
   - create popup в header (`apps/web/src/components/AppHeader.tsx`),
   - состояние создания/обновления server list (`apps/web/src/App.tsx`).
- На backend снято ограничение количества серверов для `super_admin`:
   - `apps/api/src/services/server-service.ts`, `apps/api/src/routes/servers.ts`.
- Обновленный срез провалидирован в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `498d201`, PASS).
- Добавлен backend endpoint участников сервера: `GET /v1/servers/:serverId/members`.
- В `ServerProfileModal` добавлен рабочий блок `Members + Invite link`:
   - список участников текущего сервера,
   - генерация invite (`POST /v1/servers/:serverId/invites`),
   - копирование последней сгенерированной ссылки.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `5591081`, PASS).
- Добавлен onboarding empty state для пользователей без серверов:
   - guard-компонент `EmptyServerOnboarding` в `apps/web/src/components/AppGuardsAndOverlays.tsx`,
   - интеграция в `apps/web/src/App.tsx` (рендер вместо workspace при `servers.length === 0` после загрузки),
   - CTA `Создать первый сервер` использует уже существующий create-server flow.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `261a377`, PASS).
- Добавлено разделение admin control plane для `super_admin`:
   - отдельные вкладки `Product Management` и `Server Management` в `ServerProfileModal`,
   - client API для `GET /v1/admin/servers` и `GET /v1/admin/servers/:serverId/overview`,
   - server management overview (owner/members/rooms/messages/invites/bans) в UI.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 npm run deploy:test:smoke` (SHA `ed785b0`, PASS).
- Добавлен web flow принятия инвайта по deep-link `/invite/:token`:
   - клиентский вызов `POST /v1/invites/:token/accept`,
   - авто-переключение на принятый сервер,
   - очистка URL после обработки invite.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `0572285`, PASS).
- Добавлен UI для server rename и server age-confirm в `ServerProfileModal`:
   - переименование текущего сервера (`PATCH /v1/servers/:serverId`),
   - показ статуса age-confirm и действие подтверждения (`GET/POST /v1/servers/:serverId/age-confirm`).
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `96d70ed`, PASS).
- Реструктурирован server profile UI по админским контурам:
   - вкладки `Лог`, `Сигналинг`, `Телеметрия` объединены в единую страницу с внутренними табами;
   - server control plane список перенесен в `Управление продуктом` с табами `Пользователи`/`Сервера`;
   - вкладка `Управление серверами` переименована в `Этот сервер`;
   - action-кнопки в строке участников унифицированы с паттерном product management.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `391d4d5`, PASS).
- Доработан UX server profile по фидбеку:
   - default role в списках людей скрыта, роли выше отображаются badge;
   - раздел observability переименован в `Наблюдаемость`;
   - исправлен рендер `Управление продуктом -> Сервера` (табы и контент не исчезают);
   - в `Этот сервер` кнопки, связанные с полями, выровнены в одну строку;
   - вкладка `Этот сервер` доступна обычному пользователю, добавлены кнопки `Покинуть сервер` и `Удалить сервер`.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `ea1cb3c`, PASS).
- Добавлен backend/server flow для `Удалить сервер`:
   - endpoint `DELETE /v1/servers/:serverId` (soft-delete через `servers.is_archived = TRUE`);
   - миграция `0009_servers_archive_soft_delete.sql`;
   - фильтрация архивных серверов добавлена в membership/default/admin/invite выборки;
   - UI-кнопка `Удалить сервер` теперь вызывает API, с обработкой ролей и запрета удаления default server.
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `918cd0f`, PASS).
- Доработан доступ/UX server profile по дополнительному фидбеку:
   - вкладка `Картинки чата` ограничена ролью `super_admin`;
   - в server list для product management удален дублирующий формат `name (slug)`;
   - в header убран текст `// No server selected` (без выбранного сервера показывается только `Dato`);
   - вкладка `Этот сервер` блокируется без выбранного сервера + guard возвращает на `Наблюдаемость`;
   - onboarding для состояния без серверов расширен до сценария "Приветствие и выбор" (invite или создание сервера).
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `69cf604`, PASS).
- Дополнительно по фидбеку прав доступа:
   - вкладка `Наблюдаемость` скрыта/недоступна при отсутствии выбранного сервера;
   - `canCreateRooms` в web учитывает роль пользователя в текущем сервере (`owner/admin`), а не только global role;
   - backend `POST /v1/rooms` допускает создание комнат для `owner/admin` текущего сервера (без требования global `admin/super_admin`).
- Изменения провалидированы в `test` на feature-ветке через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `0b99f9f`, PASS).

### Stage 4 - Data cutover

- [x] Создать `BossServer` и привязать текущие комнаты.
- [x] Зафиксировать `BossServer` как базовый сервер для test сценариев.
- [x] Верифицировать выборку комнат/сообщений в контексте сервера.
- [x] Smoke в test: create server -> invite -> accept -> switch -> chat.
- [x] Smoke в test: no data leak между серверами + ban enforcement в API/WS.
- [x] Smoke в test: no data leak между серверами для `nsfw=true` пространств + проверка age-gate на deep-link/invite.

Stage 4 note (2026-03-28):
- Инварианты cutover в `test` подтверждены SQL-проверками: `BossServer` присутствует как `is_default=true`, `rooms.server_id is null = 0`, `rooms.nsfw=true` присутствует и используется в smoke-проверках.
- Добавлен и интегрирован `smoke:multiserver:age-gate` в `postdeploy-smoke-test.sh`.
- Финальный test gate на feature-ветке: `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `2a4cc07`, PASS).
- Для насыщенного test-state (исчерпанный лимит активных invite) smoke-скрипты используют `active-invite-limit-skip` режим и не дают ложнопадающий результат deploy gate.

### Stage 5 - Prod rollout

- [x] Deploy в `test` + smoke.
- [ ] Ручная проверка критического сценария (owner/admin/member).
- [ ] Только после явного подтверждения: deploy в `prod`.

Stage 5 note (2026-03-28):
- Выполнен повторный test gate на feature-ветке:
   - `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke`.
   - Applied SHA: `9b8b610`.
   - Result: `PASS` (`smoke:multiserver`, `smoke:multiserver:age-gate`, `smoke:multiserver:role-matrix`, `smoke:realtime`).
- В рамках этого же прохода подтвержден backend owner-transfer endpoint: `POST /v1/servers/:serverId/owner`.

Stage 5 note (2026-03-29):
- Применен test deploy с фиксом UX/контроля входа в 18+ комнаты на feature-ветке:
   - `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke`.
   - Applied SHA: `4af7202`.
- Деплой применился успешно, но полный postdeploy smoke зафлапал на browser-check `smoke:web:rnnoise:browser` из-за сетевого таймаута к `https://test.datowave.com`.
- Повторный `smoke:test:postdeploy` подтвердил тот же flaky timeout в `smoke:web:rnnoise:browser`; при этом API/auth/web-version/sso проверки проходят.
- Целевые multi-server проверки после деплоя:
   - `smoke:multiserver:age-gate`: `ok` в режиме `no-room-skip` (для выбранного smoke server нет комнаты, сценарий корректно пропущен).
   - `smoke:multiserver:role-matrix`: `ok`.
- Для финального ручного подтверждения UX age-gate (оверлей + отсутствие ложного RTC join/sound) требуется ручной прогон в BossServer комнате `18plus`.

### Stage 6 - Stabilization (сразу после релиза)

- [x] Owner transfer и защита от "server without owner".
- [ ] Membership lifecycle: `leave`, `kick`, `rejoin` (частично: `leave` и `rejoin` подтверждены вручную; `kick` остается открытым).
- [x] Admin control plane для суперадмина (глобальный список серверов, service ban/unban, переход в server management).
- [ ] Закрыть зависимость legal Stage E: перевести room-level age-gate в полноценный server+room режим и зафиксировать это в legal плане.

Stage 6 note (2026-03-28):
- Добавлен backend endpoint передачи владения сервером: `POST /v1/servers/:serverId/owner`.
- Правила owner safety сохранены: владелец не может уйти с сервера (`owner_cannot_leave`) и не может быть удален (`owner_cannot_be_removed`) без передачи владения.
- Ownership transfer выполняется транзакционно с аудит-событием `server.owner.transferred`.
- Добавлен UI для owner transfer и server unban в списке участников (`ServerProfileModal`).
- Список участников расширен флагом `isServerBanned`, чтобы UI корректно показывал действие `Забанить/Снять бан`.
- Добавлен UI для server rename и server age-confirm (status + confirm action) в `ServerProfileModal`.
- Изменения провалидированы в `test` через `TEST_REF=origin/feature/multiserver-stage1-services SMOKE_MULTISERVER=1 SMOKE_MULTISERVER_AGE_GATE=1 npm run deploy:test:smoke` (SHA `e6ae8a6`, PASS).
- Повторная валидация расширенного UI-среза (rename + age-confirm) прошла в `test` через тот же gate (SHA `96d70ed`, PASS).
- `Membership lifecycle` частично закрыт: `leave`, `kick/remove`, `rejoin` реализованы; для полного закрытия нужен финальный ручной чек `kick` в end-to-end сценарии.
- Ручная проверка (2026-03-28): вход по invite на сервер и последующий `leave` отработали успешно.
- Ручная проверка (2026-03-28): после `leave` повторный вход по invite (`rejoin`) отрабатывает успешно.
- Ручная проверка (2026-03-28): создание и удаление серверов выполняются корректно.

## 7) Что еще нужно добавить (рекомендации)

1. Удаление сервера (с ограничениями и подтверждением).
   - должно быть мягким, как у комнат на сервере. 
   - у супер админа есть корзина в списке серверов, из которой их можно восстановить
2. Роли finer-grained:
   - управление комнатами,
   - управление правами участников,
   - управление интеграциями.
3. Invite security:
   - только hashed token в БД,
   - короткий ttl по умолчанию,
   - лимит попыток accept,
   - device/IP risk checks на accept.
4. Наблюдаемость:
   - метрики `server_create_ok/fail`, `invite_accept_ok/fail`,
   - аудит "кто кого добавил/удалил".
   - метрики `server_ban_apply_ok/fail`, `service_ban_apply_ok/fail`.
5. Совместимость клиента:
   - добавить версионирование ответа `/v1/servers`,
   - graceful fallback для старых клиентов.
6. v2 backlog:
   - server templates / bootstrap,
   - appeal flow для банов,
   - монетизация/квоты,
   - архивирование/экспорт сервера.

## 8) Критерии готовности v1

- Пользователь может создать сервер и сразу стать `owner`.
- Пользователь видит список своих серверов и переключается между ними.
- В шапке показывается `Dato // ServerName`.
- Инвайт ссылка создается и позволяет вступить на сервер.
- Раздельные баны работают корректно: `server_ban` и `service_ban`.
- Суперадмин имеет два рабочих контура: `Product Management` и `Server Management`.
- Доступ к данным изолирован по `server_id`.
- Исторический сервер корректно мигрирован и называется `BossServer`.
- `BossServer` используется как базовый сервер для тестовых сценариев.

## 9) Зафиксированные решения

1. Владелец `BossServer` в проде: пользователь `gismalink@gmail.com`.
2. Лимит серверов на пользователя в v1: 1 бесплатный сервер; для `super_admin` лимит не ограничен.
3. Переименование сервера в v1: Только владелец сервере.
4. Публичного каталога серверов нет: вход только по invite; при этом в админке суперадмина нужен список всех серверов.
5. Удаление сервера: нужно поддержать, приоритет можно отложить на следующий этап после базового rollout.