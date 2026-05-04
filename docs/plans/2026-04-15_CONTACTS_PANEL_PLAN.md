# План: панель контактов (Contacts Panel v2)
Date: 2026-04-15
Scope: выделенная панель контактов справа, публичные профили пользователей, кастомные имена контактов, расширенный поиск, конструктор аватаров.
Depends on: `2026-03-20_DIRECT_MESSAGES_PLAN.md` (DM v1 — deployed)

## 0) Что хотим получить

- Третья колонка справа — «Панель контактов» со списком людей, статусами, уведомлениями.
- Автодобавление в контакты при первом сообщении на любом сервере (не только DM).
- Публичная ссылка на профиль пользователя (`/@username`), как в Telegram.
- Возможность копировать ссылку на себя из настроек профиля.
- Добавление в контакты из профиля участника сервера.
- Кастомное «отображаемое имя» для контактов — псевдоним, заданный владельцем контакта.
- Сворачивание панели в узкую колонку (аватары + бейджи).
- Поиск по контактам: и по оригинальному имени, и по кастомному имени.
- Telegram-like фичи: группы/категории контактов, «избранное», online-статус, «last seen».
- **Загрузка своих картинок запрещена.** Аватар собирается через конструктор из набора частей (как в играх).

## 1) Модель данных — изменения

### 1.1 Новая миграция (0030)

#### `users` — добавить уникальный username

```sql
-- Сделать username уникальным (ранее nullable, без ограничения).
-- Перед наложением constraint заполнить пустые username уникальным fallback.
UPDATE users
SET username = CONCAT(split_part(email, '@', 1), '-', LEFT(id::text, 6))
WHERE username IS NULL OR username = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON users (LOWER(username));

-- Ограничение формата: 3-32 символа, [a-z0-9_.-]
ALTER TABLE users ADD CONSTRAINT users_username_format
  CHECK (username ~ '^[a-zA-Z0-9][a-zA-Z0-9_.\-]{1,30}[a-zA-Z0-9]$');
```

#### `dm_contacts` — расширить

```sql
ALTER TABLE dm_contacts
  ADD COLUMN IF NOT EXISTS display_name TEXT,          -- кастомное имя (nullable, до 64 символов)
  ADD COLUMN IF NOT EXISTS is_favorite  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name   TEXT;           -- категория/группа (nullable, до 64 символов)
```

#### `users` — добавить avatar_config

```sql
-- Конструктор аватаров: JSONB с набором выбранных свойств.
-- Загрузка пользовательских изображений запрещена — только конструктор.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb;
```

> Формат `avatar_config` — см. раздел «2A) Конструктор аватаров».

#### `user_presence` — новая таблица (online/last seen)

```sql
CREATE TABLE IF NOT EXISTS user_presence (
  user_id     UUID PRIMARY KEY REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'offline',   -- online | idle | dnd | offline
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_text TEXT                                -- кастомный текст статуса (до 128 символов)
);
```

> Примечание: online/idle/offline в v1 уже вычисляется на лету через WS presence в комнатах; `user_presence` добавляет глобальный (кросс-серверный) статус и «последний раз в сети».

### 1.2 Инварианты

- `username` уникален (case-insensitive) и неизменяем через обычный PATCH (отдельный endpoint со своей валидацией + cooldown).
- `display_name` в `dm_contacts` виден только владельцу контакта — никогда не утекает другим пользователям.
- `user_presence.status` обновляется автоматически через WS heartbeat; `last_seen` пишется при disconnect.
- **Загрузка пользовательских изображений для аватара запрещена.** Аватар формируется исключительно через конструктор (`avatar_config`). Это упрощает модерацию, сохраняет единый визуальный стиль и устраняет необходимость хранения/ресайза/CDN для аватарок.

## 2A) Конструктор аватаров (Avatar Constructor)

### Концепция

Вместо загрузки своих картинок — конструктор аватара из набора компонентов, как в играх (RPG character creator). Единый стиль, никаких проблем с модерацией и хранением.

### Формат: только портрет (голова + плечи)

Аватар — портрет (голова и верхняя часть плеч), а не фигура в полный рост. Это проще для asset production и лучше читается на маленьких размерах (18–40px).

### Слои и свойства

| Слой (z-order) | Ключ в `avatar_config` | Варианты (v1) | Обязательный |
|---------------|------------------------|---------------|-------------|
| 0. Фон | `background` | 12 цветов (solid) + 4 градиента | да |
| 1. Форма головы | `species` | `human`, `cat`, `dog`, `fox`, `owl`, `robot`, `bear`, `panda` | да |
| 2. Цвет кожи/шерсти | `skinColor` | 8 вариантов (палитра зависит от species) | да |
| 3. Глаза | `eyes` | 10 форм × 8 цветов | да |
| 4. Брови | `brows` | 6 вариантов + `none` | нет |
| 5. Рот/выражение | `mouth` | 8 вариантов | да |
| 6. Волосы/причёска | `hair` | 15 вариантов + `none` (для robot — «антенны», для животных — «уши» и т.п.) | нет |
| 7. Цвет волос | `hairColor` | 10 цветов | нет (если hair = none) |
| 8. Аксессуары | `accessories` | массив: `glasses`, `hat`, `earring`, `headphones`, `crown`, `mask`, `bandana` | нет |
| 9. Спецэффект | `effect` | `none`, `sparkle`, `fire`, `ice`, `pixel-glow` | нет |

### Формат `avatar_config` (JSONB)

```jsonc
{
  "species": "cat",
  "background": "#3B82F6",
  "skinColor": "orange-tabby",
  "eyes": { "shape": "round", "color": "green" },
  "brows": "none",
  "mouth": "smile",
  "hair": "none",
  "hairColor": null,
  "accessories": ["glasses", "headphones"],
  "effect": "none"
}
```

- Пустой `{}` → fallback: отображать инициалы (текущее поведение, обратная совместимость).
- Валидация: значения проверяются по каталогу допустимых `species`, `eyes.shape` и т.д. Невалидные ключи игнорируются при рендере.

### Рендеринг

- **SVG-based**: каждый слой — отдельный SVG-фрагмент, композиция через `<svg>` с вложенными `<use>` / `<g>`.
- **Клиентский**: рендер полностью на клиенте — zero server load. Компонент `<AvatarConstructed config={avatarConfig} size={px} />`.
- **Размеры**: 18px (member list), 24px (mobile chat), 32px (collapsed contacts), 40px (expanded contacts), 64px (profile modal), 128px (profile page).
- **Кэш**: SVG sprite bundle (`avatar-parts.svg`) загружается один раз, кэшируется immutable.
- **Fallback**: если `avatar_config` пустой или невалидный → инициалы в цветном квадрате (текущее поведение).

### UI конструктора

- Доступен в: настройки профиля (`/settings/profile`), first-run onboarding.
- Превью аватара в реальном времени (128px).
- Вкладки по категориям: Форма → Лицо → Волосы → Аксессуары → Эффекты.
- Кнопка «Рандом» — случайная комбинация.
- Сохранение: `PATCH /v1/auth/me` → `{ avatarConfig: {...} }`.

### API

- `PATCH /v1/auth/me` — расширить: принимает `avatarConfig` (JSONB), валидация серверная.
- `GET /v1/users/:username/profile` — возвращает `avatarConfig` (вместо `avatarUrl`).
- Все эндпоинты, возвращающие пользователей (members, contacts, threads), включают `avatarConfig`.

### Ограничения (жёсткие)

- **Загрузка собственных изображений для аватара запрещена** — ни через API, ни через UI.
- Аватар формируется только через конструктор.
- Это распространяется и на серверные профили (аватар пользователя глобальный, един для всех серверов).
- В будущем допускается расширение каталога частей (новые species, аксессуары, seasonal items), но не пользовательские загрузки.

## 2) Публичные профили

### 2.1 Username как handle

- Формат: `^[a-zA-Z0-9][a-zA-Z0-9_.\-]{1,30}[a-zA-Z0-9]$` (3–32 символа).
- URL: `https://datowave.com/@{username}` — публичная страница (без авторизации: имя + аватар + кнопка «Открыть в приложении»; с авторизацией: полный профиль + «Написать» + «В контакты»).
- Deep link: `datowave://profile/{username}` (для desktop-клиента).

### 2.2 API

1. `PATCH /v1/auth/me/username` — `{ username }` — смена username (rate limit: 1 раз в 30 дней).
2. `GET /v1/users/:username/profile` — публичный (или полупубличный) профиль.
   - Без auth: `{ username, name, avatarConfig }`.
   - С auth: добавляет `{ isContact, isBlocked, mutualServers[], dmThreadId? }`.

### 2.3 Копирование ссылки

- В настройках профиля (`/settings/profile`): кнопка «Копировать ссылку на профиль» → `https://datowave.com/@{username}`.
- В панели контактов: правый клик по контакту → «Скопировать ссылку».

## 3) Панель контактов (frontend)

### 3.1 Layout

```
Desktop (≥801px):
grid-cols-[320px_1fr_var(--contacts-width)]

--contacts-width:
  expanded:  280px
  collapsed:  56px   ← только аватары + бейджи
  hidden:      0px   ← мобильный или off
```

- Переключатель expand/collapse — кнопка-иконка в header панели (двойная стрелка или sidebar icon).
- Состояние `expanded | collapsed` сохраняется в `localStorage`.
- На мобильных: панель контактов доступна как отдельная вкладка (рядом с «Каналы» / «Чат»).

### 3.2 Expanded-режим

```
┌──────────────────────────┐
│ 🔍 Поиск контактов    [≪]│
├──────────────────────────┤
│ ★ Избранное              │
│   ┌──┐ Дима    ●  (2)    │
│   └──┘ «Dimka»           │
│   ┌──┐ Анна    ○         │
│   └──┘                   │
├──────────────────────────┤
│ 📁 Работа                │
│   ┌──┐ Максим  ●  (1)    │
│   └──┘                   │
├──────────────────────────┤
│ Все контакты             │
│   ┌──┐ Олег    ◐         │
│   └──┘ «Коллега»         │
│   ┌──┐ Maria   ○         │
│   └──┘                   │
│   ...                    │
└──────────────────────────┘
```

Каждая строка контакта:
- **Аватар** (40px, SVG-конструктор) с индикатором статуса (●/◐/○ = online/idle/offline).
- **Имя**: display_name (если задан), ниже мелко — оригинальное имя + `@username`.
- **Бейдж** непрочитанных DM (красный, как в Telegram).
- **Кнопки** (по hover / long press): написать DM, позвонить, профиль.
- **Группа/секция**: «Избранное», кастомные группы, «Все контакты».

### 3.3 Collapsed-режим (узкая колонка, 56px)

```
┌──────┐
│ [🔍] │
├──────┤
│ [av] │ ← аватар 32px + бейдж
│  (2) │
│ [av] │
│      │
│ [av] │
│  (1) │
│ ...  │
└──────┘
```

- Только аватары (32px) со статус-индикатором.
- Бейдж непрочитанных — маленький кружок с цифрой.
- Клик по аватару:
  - Одиночный: раскрыть панель и сфокусировать контакт.
  - (или) Одиночный: открыть мини-попап с именем + быстрые действия (DM / call / expand).
- Tooltip при hover: имя контакта.

### 3.4 Поиск

- Строка поиска в header панели.
- Поиск по: `name`, `username`, `display_name` (nickname владельца контакта), `email`.
- Fuzzy-match + подсветка совпадений.
- При вводе: скрыть группы, показать flat-список результатов, сортированный по релевантности.
- Если введён `@username` — приоритетный матч по username; если совпадений нет в контактах — предложить «Найти пользователя» (глобальный поиск).

### 3.5 Контекстное меню контакта (правый клик)

- **Написать** → открыть DM.
- **Позвонить** → DM-вызов (когда DM Calls готовы).
- **Профиль** → открыть модалку профиля.
- **Изменить имя** → inline-редактирование display_name.
- **Переместить в группу** → подменю с группами + «Новая группа».
- **В избранное** / **Убрать из избранного**.
- **Скопировать ссылку** → `https://datowave.com/@{username}` в буфер.
- **Убрать из контактов** (с подтверждением).
- **Заблокировать** (с подтверждением).

## 4) Автодобавление в контакты

### 4.1 Триггеры

| Событие | source | Детали |
|---------|--------|--------|
| Отправка DM (существующее) | `dm_auto` | Уже реализовано; при `POST /v1/dm/threads` |
| Отправка сообщения в серверный чат с `@mention` | `server_mention` | Если пользователь упомянул другого — добавить обоих друг другу |
| Первый DM reply на серверное сообщение | `dm_auto` | Расширение текущего поведения |
| Ручное добавление из профиля участника | `manual` | Кнопка «В контакты» в профиле |
| Переход по ссылке `/@username` + кнопка «Добавить» | `manual` | Из публичного профиля |

### 4.2 De-dup

- `dm_contacts(owner_user_id, contact_user_id)` уже уникальный. `INSERT ... ON CONFLICT DO NOTHING`.
- Source обновляется только при upgrade: `manual` > `server_mention` > `dm_auto` (не понижаем; `manual` — максимальный приоритет).

## 5) Кастомное имя контакта (display_name)

### 5.1 API

- `PATCH /v1/dm/contacts/:contactUserId` — `{ displayName?, groupName?, isFavorite? }`.
- `displayName: null` — сбросить на оригинальное.
- Ограничение: до 64 символов, trim whitespace, sanitize.

### 5.2 UX

- В панели контактов: display_name показывается крупно, оригинальное имя — мелко под ним.
- В DM-чатах: header показывает display_name (если задан), с тултипом оригинального имени.
- В mentions (`@`): автокомплит ищет и по display_name, и по оригинальному.
- В уведомлениях: «**Димка** (Дмитрий Иванов) прислал сообщение».

## 6) Online-статус и Last Seen

### 6.1 Backend

- При WS connect → `user_presence.status = 'online'`, `last_seen = now()`.
- WS heartbeat каждые 30с → обновлять `last_seen`.
- При WS disconnect (все сессии) → `status = 'offline'`, `last_seen = now()`.
- Idle detection: если нет heartbeat > 5 мин → `status = 'idle'`.
- DND: пользователь ставит вручную (`PATCH /v1/auth/me/status`).

### 6.2 Realtime

- Новые WS-события:
  - `presence.status_changed` → `{ userId, status, lastSeen }` — рассылается контактам.
- Рассылка только пользователям, у которых `userId` в контактах (не всему серверу) — privacy.

### 6.3 Privacy

- Настройка: `show_last_seen` (enum: `everyone` | `contacts` | `nobody`).
- Если `nobody` → online-статус и last_seen скрыты; контактам видно только «давно не был».

## 7) Группы и избранное

### 7.1 Группы контактов

- Группа — просто строка `group_name` на записи `dm_contacts`.
- Порядок секций: **Избранное** → **Кастомные группы** (по имени) → **Все контакты**.
- API:
  - `GET /v1/dm/contacts/groups` — `string[]` (уникальные имена групп).
  - `PATCH /v1/dm/contacts/:contactUserId` — `{ groupName }`.
  - `DELETE /v1/dm/contacts/groups/:groupName` — убрать группу у всех контактов (batch).
  - `PATCH /v1/dm/contacts/groups/:groupName` — `{ newName }` — переименовать.

### 7.2 Избранное

- `is_favorite = true` → контакт отображается в секции «Избранное» вверху.
- Toggle через `PATCH /v1/dm/contacts/:contactUserId` → `{ isFavorite }`.
- Также доступен через контекстное меню и свайп (мобильные).

## 8) Дополнительные Telegram-like фичи

### 8.1 Кастомный текст статуса

- Пользователь может задать короткое текстовое сообщение-статус (до 128 символов): «На встрече», «В отпуске до 20.04» и т.п.
- Хранится в `user_presence.status_text`.
- Отображается в профиле и под именем контакта при hover.
- `PATCH /v1/auth/me/status` — `{ statusText }`.

### 8.2 Shared contacts / Mutual servers

- В профиле контакта: блок «Общие серверы» — список серверов, где вы оба участники.
- API: `GET /v1/users/:username/profile` уже может включать `mutualServers[]`.

### 8.3 Уведомления per-contact

- Mute/unmute конкретного контакта (не thread, а контакта — все DM от него).
- Хранится в новом поле `dm_contacts.muted_until TIMESTAMPTZ` (null = не muted; timestamp = muted до).
- `PATCH /v1/dm/contacts/:contactUserId` — `{ mutedUntil: "2026-04-16T00:00:00Z" | null }`.

### 8.4 Pinned contacts

- «Закреплённые» контакты — поднимаются вверх независимо от last_message.
- Реализуется через `is_favorite` (избранное = закреплённые, одна концепция, без дублирования).

### 8.5 Contact notes

- Приватные заметки о контакте (только для владельца).
- Новое поле: `dm_contacts.notes TEXT` (до 500 символов).
- Доступно из карточки контакта / контекстного меню.

### 8.6 Typing indicator в панели контактов

- Если контакт сейчас печатает в DM — показать мигающий индикатор (три точки) вместо last_message preview.
- Реализуется через существующий WS-механизм `dm.typing`.

## 9) API — полный контракт изменений

### Новые эндпоинты

| Method | Path | Описание |
|--------|------|----------|
| `PATCH` | `/v1/auth/me/username` | Смена username (cooldown 30 дней) |
| `PATCH` | `/v1/auth/me/status` | Обновить statusText и/или DND |
| `GET` | `/v1/users/:username/profile` | Публичный профиль |
| `GET` | `/v1/dm/contacts/groups` | Список групп |
| `PATCH` | `/v1/dm/contacts/groups/:groupName` | Переименовать группу |
| `DELETE` | `/v1/dm/contacts/groups/:groupName` | Удалить группу |

### Изменённые эндпоинты

| Method | Path | Изменение |
|--------|------|-----------|
| `PATCH` | `/v1/dm/contacts/:contactUserId` | Добавить поля: `displayName`, `groupName`, `isFavorite`, `mutedUntil`, `notes` |
| `GET` | `/v1/dm/contacts` | Ответ расширяется: `displayName`, `groupName`, `isFavorite`, `mutedUntil`, `notes`, `presenceStatus`, `lastSeen`, `statusText`, `username`, `avatarConfig` |
| `POST` | `/v1/dm/contacts` | Можно сразу передать `displayName`, `groupName` |
| `GET` | `/v1/dm/threads` | Добавить `peerUsername`, `peerDisplayName`, `peerPresenceStatus`, `peerAvatarConfig` |

### WS-события — новые

| Событие | Payload | Кому |
|---------|---------|------|
| `presence.status_changed` | `{ userId, status, lastSeen, statusText }` | Контактам пользователя |
| `dm.contact.added` | `{ contactUserId, source }` | Текущему пользователю (sync между устройствами) |
| `dm.contact.updated` | `{ contactUserId, displayName?, groupName?, isFavorite? }` | Текущему пользователю |
| `dm.contact.removed` | `{ contactUserId }` | Текущему пользователю |

## 10) Миграция данных

1. **Username uniqueness**: Перед наложением unique constraint — найти дубликаты и добавить suffix (`-N` или `-{id_prefix}`).
2. **Existing contacts**: Все `dm_contacts` получают `is_favorite = false`, `display_name = NULL`, `group_name = NULL`.
3. **User presence**: Создать записи для всех `users` со `status = 'offline'`, `last_seen = now()`.
4. **Server-chat auto-contacts**: Не мигрировать ретроактивно (только новые mentions → auto-add).

## 11) Этапы реализации

### Stage 0 — Design (этот документ)
- [x] Зафиксировать расширение `dm_contacts`.
- [x] Зафиксировать `user_presence` схему.
- [x] Зафиксировать username unique constraint.
- [x] Зафиксировать layout панели контактов (expanded/collapsed).
- [x] Зафиксировать API-контракт.
- [x] Зафиксировать конструктор аватаров (avatar_config JSONB, SVG-рендер, запрет загрузки картинок).

### Stage 1 — Backend: username + avatar + presence + contacts v2
- [ ] Миграция 0030: username unique, `avatar_config` JSONB, dm_contacts расширение, user_presence.
- [ ] `PATCH /v1/auth/me` — принимать `avatarConfig` с серверной валидацией по каталогу.
- [ ] Username change endpoint с cooldown.
- [ ] Public profile endpoint (`GET /v1/users/:username/profile`) — возвращать `avatarConfig`.
- [ ] `PATCH /v1/dm/contacts/:contactUserId` — расширить.
- [ ] Contacts groups API.
- [ ] Presence service: connect/disconnect/heartbeat/idle hooks.
- [ ] WS broadcast `presence.status_changed` (только контактам).
- [ ] Auto-add контакта при server-chat `@mention`.

### Stage 2 — Frontend: конструктор аватаров + панель контактов
- [ ] SVG sprite bundle `avatar-parts.svg` (все слои: species, eyes, mouth, hair, outfit, accessories, effects).
- [ ] Компонент `<AvatarConstructed config={} size={} />` — SVG-рендер аватара из config.
- [ ] UI конструктора аватара в настройках профиля (вкладки по категориям + превью + «Рандом»).
- [ ] Заменить инициалы на `<AvatarConstructed>` в: member list, chat, DM header, contacts.
- [ ] Компонент `ContactsPanel` (expanded + collapsed режимы).
- [ ] Grid layout: `grid-cols-[320px_1fr_var(--contacts-width)]`.
- [ ] localStorage persist для expand/collapse.
- [ ] ContactRow: аватар-конструктор, display_name, оригинальное имя, статус-индикатор, бейдж.
- [ ] Секции: Избранное → Группы → Все.
- [ ] Контекстное меню контакта.
- [ ] Inline-редактирование display_name.
- [ ] Поиск по контактам (name + username + display_name).

### Stage 3 — Frontend: профиль + настройки
- [ ] Публичная страница `/@username` (SSR/SPA-route).
- [ ] «Копировать ссылку на профиль» в настройках.
- [ ] Смена username в настройках (с cooldown и validation).
- [ ] «Добавить в контакты» из профиля участника сервера.
- [ ] Кастомный текст статуса в настройках.

### Stage 4 — Расширения
- [ ] Typing indicator в панели контактов.
- [ ] Per-contact mute.
- [ ] Contact notes.
- [ ] Last seen privacy settings.
- [ ] Мобильная адаптация (вкладка «Контакты»).

### Stage 5 — Test rollout
- [ ] Deploy в `test`.
- [ ] Smoke: собрать аватар в конструкторе → сохранить → отображается корректно.
- [ ] Smoke: fallback на инициалы при пустом avatar_config.
- [ ] Smoke: создать контакт → задать display_name → найти поиском.
- [ ] Smoke: публичный профиль `/@username` с аватаром-конструктором.
- [ ] Smoke: auto-add при @mention в серверном чате.
- [ ] Smoke: expand/collapse панели + бейджи.
- [ ] Smoke: presence online→offline→online.

### Stage 6 — Prod rollout
- [ ] После green test-gate: deploy в `prod`.

## 12) Responsive / Mobile

| Breakpoint | Поведение |
|------------|-----------|
| ≥1100px | Три колонки: sidebar (320) + chat (flex) + contacts (280) |
| 801–1099px | Две колонки: sidebar (320) + chat (flex). Контакты — оверлей по кнопке (slide-in справа) |
| ≤800px | Мобильный: три вкладки (Каналы / Чат / Контакты). Контакты — full-width |

## 13) Критерии готовности

- Конструктор аватаров работает; аватар рендерится из `avatar_config` во всех местах (member list, chat, DM, contacts, profile).
- Загрузка пользовательских изображений недоступна (ни API, ни UI).
- Fallback на инициалы при пустом / невалидном `avatar_config`.
- Панель контактов отображается и сворачивается.
- Контакты отображают online-статус, last seen, бейдж непрочитанных DM.
- Поиск работает по name + username + display_name.
- Публичный профиль `/@username` отдаёт данные.
- Auto-add при DM и при @mention на сервере.
- Display_name виден только владельцу контакта.
- Группы и избранное работают.
- Mobile: вкладка «Контакты» доступна.

## 14) Зафиксированные решения

1. **Загрузка своих картинок для аватара запрещена.** Аватар — только конструктор из набора частей.
2. Конструктор аватаров: SVG-based, клиентский рендер, серверная валидация, JSONB-хранение.
3. Каталог частей расширяем (seasonal items, новые species), пользовательские загрузки — нет.
4. Аватар глобальный (един для всех серверов, не per-server).
