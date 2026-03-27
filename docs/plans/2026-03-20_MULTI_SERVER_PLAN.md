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
- [ ] `InviteService` (create/accept/revoke).
- [ ] `BanService` (server/service ban apply/revoke/check).
- [x] Middleware `requireServerMembership`.
- [x] Middleware `requireNotServiceBanned` и `requireNotServerBanned`.
- [ ] Идемпотентность чувствительных операций (транзакции, уникальные индексы, race-safe path).

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

### Stage 2 - API + auth integration

- [ ] Эндпоинты `/v1/servers*` и `/v1/invites/:token/accept`.
- [ ] Эндпоинты серверных/глобальных банов.
- [ ] Эндпоинты `GET /v1/admin/servers` и `GET /v1/admin/servers/:serverId/overview`.
- [ ] Проверка ролей и аудит-логи чувствительных действий.
- [ ] Ограничение rate limit для invite create/accept.
- [ ] Ограничение количества активных invite ссылок на сервер.
- [ ] Интеграция с legal Stage E: server-aware код ошибки для 18+ доступа (например, `AgeVerificationRequired`) и аудит age-confirm событий в контексте `server_id`.

### Stage 3 - Frontend integration

- [ ] Server switcher + current server context.
- [ ] Header `Bolto // ServerName`.
- [ ] Screen: Create server.
- [ ] Screen: Members + Invite link.
- [ ] Empty state / onboarding "Создать первый сервер".
- [ ] Админка суперадмина: `Product Management` + `Server Management`.

### Stage 4 - Data cutover

- [ ] Создать `BossServer` и привязать текущие комнаты.
- [ ] Зафиксировать `BossServer` как базовый сервер для test сценариев.
- [ ] Верифицировать выборку комнат/сообщений в контексте сервера.
- [ ] Smoke в test: create server -> invite -> accept -> switch -> chat.
- [ ] Smoke в test: no data leak между серверами + ban enforcement в API/WS.
- [ ] Smoke в test: no data leak между серверами для `nsfw=true` пространств + проверка age-gate на deep-link/invite.

### Stage 5 - Prod rollout

- [ ] Deploy в `test` + smoke.
- [ ] Ручная проверка критического сценария (owner/admin/member).
- [ ] Только после явного подтверждения: deploy в `prod`.

### Stage 6 - Stabilization (сразу после релиза)

- [ ] Owner transfer и защита от "server without owner".
- [ ] Membership lifecycle: `leave`, `kick`, `rejoin`.
- [ ] Admin control plane для суперадмина (глобальный список серверов, service ban/unban, переход в server management).
- [ ] Закрыть зависимость legal Stage E: перевести room-level age-gate в полноценный server+room режим и зафиксировать это в legal плане.

## 7) Что еще нужно добавить (рекомендации)

1. Удаление сервера (с ограничениями и подтверждением).
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
- В шапке показывается `Bolto // ServerName`.
- Инвайт ссылка создается и позволяет вступить на сервер.
- Раздельные баны работают корректно: `server_ban` и `service_ban`.
- Суперадмин имеет два рабочих контура: `Product Management` и `Server Management`.
- Доступ к данным изолирован по `server_id`.
- Исторический сервер корректно мигрирован и называется `BossServer`.
- `BossServer` используется как базовый сервер для тестовых сценариев.

## 9) Зафиксированные решения

1. Владелец `BossServer` в проде: пользователь `gismalink@gmail.com`.
2. Лимит серверов на пользователя в v1: 1 бесплатный сервер.
3. Переименование сервера в v1: разрешено любому участнику сервера.
4. Публичного каталога серверов нет: вход только по invite; при этом в админке суперадмина нужен список всех серверов.
5. Удаление сервера: нужно поддержать, приоритет можно отложить на следующий этап после базового rollout.