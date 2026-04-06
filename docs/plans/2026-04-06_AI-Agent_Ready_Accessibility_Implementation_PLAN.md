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

- [ ] Зафиксировать стандарт структурированных имен (`<screen>_<section>_<action>_<element>`).
- [ ] Описать обязательные поля semantic profile для кнопок, полей, переключателей, пунктов меню и списков.
- [ ] Зафиксировать mapping на платформы:
	- ARIA/data-attributes для web,
	- desktop-electron renderer: тот же semantic contract, что и web.
- [ ] Запретить неполные интерактивные элементы без `identifier` и состояния (`value/state`).

### 2.2 Screen Context и Navigation Model

- [ ] Добавить view-level/screen-level identifier для ключевых экранов.
- [ ] Ввести screen context contract: где находится агент, какой active scope (room/topic/modal), какие доступные действия.
- [ ] Нормализовать списки как семантические контейнеры (list/listitem или platform equivalents), а не только визуальные блоки.
- [ ] Скрыть декоративные элементы из accessibility tree.

### 2.3 Action Confirmation и Agent Feedback

- [ ] Добавить единый status/live feedback слой для подтверждения действий агента.
- [ ] Для stateful controls всегда выставлять актуальный `value`/`state` (selected/pinned/unread/muted и т.д.).
- [ ] Добавить событийный лог подтверждений (action accepted/failed + reason), пригодный для агентной валидации.
- [ ] Внедрить шаблон ошибок для агентов: детерминированные причины отказа вместо неявного UI-состояния.

### 2.4 Coordinates и Deterministic Interaction

- [ ] Добавить optional-слой координатной телеметрии для интерактивных элементов (без зависимости от OCR/vision).
- [ ] Связать координаты со стабильными `identifier`, а не с текстом/позицией в DOM.
- [ ] Ввести правила инвалидации координат при layout change/resize.
- [ ] Добавить safety-check: перед click агент валидирует, что target id и state совпадают.

### 2.5 Dev Workflow и Quality Gates

- [ ] Включить agent-readiness review в Definition of Done для UI-задач.
- [ ] Добавить checklist в PR/feature flow: semantic completeness, list semantics, state value, action confirmation.
- [ ] Внедрить smoke-проверки критических флоу в test по accessibility tree contract.
- [ ] Фиксировать evidence в `docs/status/FEATURE_LOG.md` с явной пометкой `agent-ready accessibility`.

### 2.6 Пилотные флоу (первая волна)

- [ ] Chat timeline + context actions.
- [ ] Composer + mention picker + attachment actions.
- [ ] Rooms/topics navigation + filters.
- [ ] Core modal flows (settings/profile/confirm dialogs).

## 3) Приоритеты

1. P0: Semantic Contract + Screen Context + Action Confirmation.
2. P1: Dev Workflow/Quality Gates + пилотные флоу чата и навигации.
3. P2: Coordinates layer и расширение coverage на остальные экраны.

## 4) Acceptance criteria

- [ ] Для пилотных флоу агент проходит сценарии по accessibility tree без обязательного screenshot анализа.
- [ ] Для всех интерактивных элементов пилотных экранов заполнены `identifier`, `label`, `hint`, `value/state`.
- [ ] Списки пилотных экранов представлены в явной семантике списка и элементов списка.
- [ ] Декоративные элементы исключены из дерева доступности, stateful controls отдают актуальный `value/state`.
- [ ] Каждое действие агента имеет машинно-читаемое подтверждение успеха/ошибки.
- [ ] Smoke в `test` подтверждает стабильность agent-ready contract для пилотных флоу.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- Продовые rollout только из default branch после merge и подтвержденного smoke в test.
- Любые серверные изменения только через GitOps-процесс и канонические скрипты/runbook.
