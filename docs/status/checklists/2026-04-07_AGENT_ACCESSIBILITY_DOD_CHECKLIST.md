# Agent Accessibility DoD Checklist (UI)

Date: 2026-04-07
Scope: обязательный DoD/checklist для UI-изменений, затрагивающих интерактивные элементы и agent navigation.

## 1) Semantic completeness (required)

- [ ] Для новых/изменённых интерактивных элементов задан стабильный `data-agent-id`.
- [ ] Для stateful/изменяемых элементов задан `data-agent-state` и/или `data-agent-value`.
- [ ] `aria-label`/`label`/hint заданы там, где элемент без текстового имени.
- [ ] Нет временных/нестабильных идентификаторов, завязанных на случайные значения.

## 2) Navigation and list semantics (required)

- [ ] Экран/модал имеет явный screen/dialog marker (`role` + `data-agent-id`).
- [ ] Списки представлены как list/listitem (или эквивалент) и не только визуальными блоками.
- [ ] Поиск/фильтры/вкладки отдают текущее состояние через `data-agent-state/value`.

## 3) Action confirmation (required)

- [ ] После агентного действия есть машинно-читаемое подтверждение (`accepted`/`failed:<reason>` или эквивалентный статус-канал).
- [ ] Ошибки возвращаются детерминированно (reason-code), без "тихого" отказа.

## 4) Decorative noise control (required)

- [ ] Декоративные иконки/разделители, не несущие смысл, скрыты из assistive tree (`aria-hidden="true"` или эквивалент).
- [ ] Проверено, что скрытие не ломает интерактивность и доступные имена контролов.

## 5) Verification evidence (required)

- [ ] Пройден `npm run smoke:web:agent-semantics:browser` в test-контуре.
- [ ] Если нужно обновить markdown evidence, использован явный флаг:
  - `SMOKE_EVIDENCE_WRITE_DOC=1 npm run smoke:web:agent-semantics:evidence`
- [ ] Результат зафиксирован в `docs/status/test-results/YYYY-MM-DD.md`.

## 6) Definition of Done for UI tasks

UI-задача считается Done только если:

1. Выполнены пункты 1-5 этого checklist.
2. Нет новых interactive элементов без semantic contract.
3. Есть traceable evidence в test-results/feature-log.
