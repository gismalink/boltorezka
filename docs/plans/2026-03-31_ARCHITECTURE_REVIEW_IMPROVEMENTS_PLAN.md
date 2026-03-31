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

- Первый инкремент выноса admin-orchestration выполнен: admin server handlers (`block/unblock`, `delete`) вынесены из `App.tsx` в `hooks/rooms/useAdminServerActions.ts`.
- `App.tsx` уменьшен с 2101 до 2051 строк без изменения поведения (web build и type checks проходят).

### 2.2 API route decomposition

- [ ] Разделить крупные маршруты auth/realtime на bounded modules (`session`, `sso`, `desktop-handoff`, `presence`, `call-signaling`, `chat-realtime`).
- [ ] Вынести cross-cutting concerns в middleware/services: rate-limit, envelope/ack helpers, audit events.
- [ ] Добавить контрактные тесты на public handler boundaries после декомпозиции.

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
