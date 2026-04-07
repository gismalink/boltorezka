# План: AI-Agent Ready Accessibility Implementation (Q2-Q3 2026)
Date: 2026-04-06
Scope: Внедрение подхода accessibility tree-first для web и Electron desktop интерфейсов Datowave, чтобы AI-агенты работали по машинно-читаемой структуре UI, а не по скриншотам.

## 0) Контекст

- По текущему процессу часть автоматизированных сценариев остается screenshot-first, что дороже по токенам и менее надежно.
- Ключевая идея: использовать accessibility tree как первичный интерфейс взаимодействия для агентов.
- Для интерактивных элементов требуется полный semantic profile: `identifier`, `label`, `hint`, `value`, `traits/state`.
- Списки, декоративные элементы и подтверждение действий должны быть явно структурированы для агентной навигации.

## 0.1) Назначение документа

- Это implementation-план по внедрению подходов из статьи Коннора Ладди в Datowave.
- Документ определяет конкретные паттерны, очередность внедрения, критерии приемки и evidence.
- Фокус документа: не общий program-management, а практическая интеграция AI-agent-ready accessibility.

## 1) Цели

- Снизить зависимость от screenshot-based агентных сценариев и перевести критические флоу на accessibility tree-first navigation.
- Сформировать единый стандарт именования и описания интерактивных UI-элементов для web и Electron desktop.
- Добавить проверяемый канал подтверждения действий агента (status/log/value state) без визуального анализа экрана.
- Интегрировать agent-readiness проверки в цикл разработки и test smoke.

## 2) Workstreams

### 2.1 Semantic Contract (identifier/label/hint/value/traits)

- [x] Зафиксировать стандарт структурированных имен (`<screen>.<section>.<action>[.<element>]`) для pilot-флоу через единый реестр `chatAgentSemantics`.
- [x] Описать обязательные поля semantic profile для pilot chat controls (стабильный `identifier` + state/value/status).
- [x] Зафиксировать mapping на платформы:
	- ARIA/data-attributes для web,
	- desktop-electron renderer: тот же semantic contract, что и web.
- [ ] Запретить неполные интерактивные элементы без `identifier` и состояния (`value/state`) для всех экранов (пока enforced только на pilot chat scope).

### 2.2 Screen Context и Navigation Model

- [x] Добавить view-level/screen-level identifier для pilot chat screen.
- [x] Ввести screen context contract: где находится агент, какой active scope (room/topic/modal), какие доступные действия.
- [x] Нормализовать списки как семантические контейнеры (list/listitem или platform equivalents), а не только визуальные блоки.
- [ ] Скрыть декоративные элементы из accessibility tree (chat pilot cleanup-pass выполнен частично; остаётся cross-screen pass вне chat scope).

### 2.3 Action Confirmation и Agent Feedback

- [x] Добавить единый status/live feedback слой для подтверждения действий агента (pilot scope).
- [x] Для stateful controls pilot scope выставлять актуальный `value`/`state` (selected/pinned/unread/muted и т.д.).
- [x] Добавить событийный лог подтверждений (action accepted/failed + reason), пригодный для агентной валидации (pilot UI status channel).
- [x] Внедрить шаблон ошибок для агентов: детерминированные причины отказа вместо неявного UI-состояния (единый reason-code helper в chat semantic contract).

### 2.4 Coordinates и Deterministic Interaction

- [ ] Добавить optional-слой координатной телеметрии для интерактивных элементов (без зависимости от OCR/vision).
- [ ] Связать координаты со стабильными `identifier`, а не с текстом/позицией в DOM.
- [ ] Ввести правила инвалидации координат при layout change/resize.
- [ ] Добавить safety-check: перед click агент валидирует, что target id и state совпадают.

### 2.5 Dev Workflow и Quality Gates

- [ ] Включить agent-readiness review в Definition of Done для UI-задач.
- [ ] Добавить checklist в PR/feature flow: semantic completeness, list semantics, state value, action confirmation.
- [x] Внедрить smoke-проверки критических флоу в test по accessibility tree contract (новый gate `smoke:web:agent-semantics:browser`, подключен в `smoke:web:e2e` и `run-all-smokes`).
- [x] Фиксировать evidence в `docs/status/feature-log/` с явной пометкой `agent-ready accessibility`.

### 2.6 Пилотные флоу (первая волна)

- [x] Chat timeline + context actions.
- [x] Composer + mention picker + attachment actions.
- [x] Rooms/topics navigation + filters.
- [x] Core modal flows (settings/profile/confirm dialogs) — pilot scope покрыт (chat + member profile + user settings/delete-confirm).

## 3) Приоритеты

1. P0: Semantic Contract + Screen Context + Action Confirmation.
2. P1: Dev Workflow/Quality Gates + пилотные флоу чата и навигации.
3. P2: Coordinates layer и расширение coverage на остальные экраны.

## 4) Acceptance criteria

- [ ] Для пилотных флоу агент проходит сценарии по accessibility tree без обязательного screenshot анализа (код и smoke готовы; требуется прогон на test с токеном).
- [ ] Для всех интерактивных элементов пилотных экранов заполнены `identifier`, `label`, `hint`, `value/state` (выполнено для chat pilot; нужно финализировать settings/profile).
- [x] Списки пилотных экранов представлены в явной семантике списка и элементов списка.
- [ ] Декоративные элементы исключены из дерева доступности, stateful controls отдают актуальный `value/state` (state/value реализованы; cleanup decorative tree остаётся).
- [x] Каждое действие агента имеет машинно-читаемое подтверждение успеха/ошибки (pilot chat scope).
- [x] Smoke в `test` подтверждает стабильность agent-ready contract для пилотных флоу (`smoke:web:agent-semantics:evidence` PASS, selectors=12, SHA `064d583`).

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- Продовые rollout только из default branch после merge и подтвержденного smoke в test.
- Любые серверные изменения только через GitOps-процесс и канонические скрипты/runbook.

## 6) Progress Update (2026-04-06)

- Выполнены core P0/P1 инкременты в chat scope: semantic ids + screen context + action feedback + pilot coverage для timeline/composer/navigation/search/overlays.
- Добавлен и централизован реестр идентификаторов: `apps/web/src/constants/chatAgentSemantics.ts`.
- Добавлен browser smoke gate: `npm run smoke:web:agent-semantics:browser`.
- Gate встроен в orchestration:
	- `SMOKE_E2E_AGENT_SEMANTICS_BROWSER=1` в `scripts/smoke/smoke-web-e2e.sh`.
	- `SMOKE_ALL_RUN_AGENT_SEMANTICS_BROWSER=1` в `scripts/smoke/run-all-smokes.sh`.
- Документация smoke/feature-log синхронизирована под новый gate.
- Добавлены deterministic статусы `accepted/failed:<reason>` для composer/search/topic-context действий в pilot chat scope.
- Стандартизирован словарь reason-codes и общий helper построения статусов в `chatAgentSemantics`.
- Расширена modal/profile семантика в chat pilot (`data-agent-id` для profile modal) и уменьшен decorative noise в accessibility tree (tab glyphs/unread divider visual tokens скрыты для assistive tree).
- Добавлены deterministic `data-agent-id` и dialog semantics для user settings/delete-confirm и room member profile modal.
- Browser smoke `smoke:web:agent-semantics:browser` расширен на optional путь открытия user settings modal через user dock controls.
- Pilot smoke в `test` закрыт PASS: `smoke:web:agent-semantics:evidence` подтвердил browser gate (`verified selectors: 12`, SHA `064d583`), см. `docs/status/test-results/2026-04-06.md`.

## 7) Evidence Artifact (test)

- Test-results template for current pilot run:
	- `docs/status/test-results/2026-04-06.md`
- После фактического test прогона обновить поля:
	- `Applied SHA`,
	- `Result`,
	- `Output excerpt`,
	- `Notes`.
