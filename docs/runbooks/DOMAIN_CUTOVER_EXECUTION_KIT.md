# Domain Cutover Execution Kit

Цель: единый операционный пакет для выполнения оставшихся шагов 3.6 (re-onboarding execution).

Scope:
- `test` first, затем `prod` только после explicit подтверждения.
- GitOps-only для всех серверных изменений.

## 1) Invite/Reset URL matrix

Использовать только новые host-ы.

Test:
- Base app URL: `https://test.datowave.com`
- Invite URL pattern: `https://test.datowave.com/invite/<token>`
- Reset URL pattern: `https://test.datowave.com/reset-password/<token>`

Prod:
- Base app URL: `https://datowave.com`
- Invite URL pattern: `https://datowave.com/invite/<token>`
- Reset URL pattern: `https://datowave.com/reset-password/<token>`

Validation checklist перед отправкой:
- URL начинается с `https://`
- host принадлежит `test.datowave.com` или `datowave.com`
- нет `*.gismalink.art`
- в URL нет пробелов и обрезанных токенов

## 2) Campaign batch template (10 users)

Скопируй таблицу и заполни по каждому пользователю:

| # | userEmail | env | inviteLink | resetLink | sentAtUtc | status | activatedAtUtc | notes |
|---|-----------|-----|------------|-----------|-----------|--------|----------------|-------|
| 1 |           | test|            |           |           | pending|                |       |
| 2 |           | test|            |           |           | pending|                |       |
| 3 |           | test|            |           |           | pending|                |       |
| 4 |           | test|            |           |           | pending|                |       |
| 5 |           | test|            |           |           | pending|                |       |
| 6 |           | test|            |           |           | pending|                |       |
| 7 |           | test|            |           |           | pending|                |       |
| 8 |           | test|            |           |           | pending|                |       |
| 9 |           | test|            |           |           | pending|                |       |
|10 |           | test|            |           |           | pending|                |       |

Status values:
- `pending`
- `sent`
- `opened`
- `activated`
- `failed`

## 3) Manual verification checklist (10 users)

Для каждого пользователя выполнить:
1. Открыть invite/reset ссылку на новом домене.
2. Завершить SSO вход.
3. Убедиться, что `Complete SSO Session` отрабатывает.
4. Проверить вход в `general`.
5. Отправить тестовое сообщение.
6. Зафиксировать итог (`pass|fail`) и причину fail.

Шаблон фиксации:

| # | userEmail | login | completeSession | roomJoin | messageSend | result | failReason |
|---|-----------|-------|-----------------|----------|-------------|--------|------------|
| 1 |           |       |                 |          |             |        |            |
| 2 |           |       |                 |          |             |        |            |
| 3 |           |       |                 |          |             |        |            |
| 4 |           |       |                 |          |             |        |            |
| 5 |           |       |                 |          |             |        |            |
| 6 |           |       |                 |          |             |        |            |
| 7 |           |       |                 |          |             |        |            |
| 8 |           |       |                 |          |             |        |            |
| 9 |           |       |                 |          |             |        |            |
|10 |           |       |                 |          |             |        |            |

Completion rule:
- Шаг считается завершенным при `10/10 pass`.
- При fail обязательно добавить follow-up задачу и повторную проверку.

## 4) Migration banner rollout task

Текст баннера:
- "Сайт переехал на новый домен datowave.com. Пожалуйста, авторизуйтесь повторно на новом адресе."

CTA:
- Label: `Перейти на datowave.com`
- URL: `https://datowave.com`

Task steps:
1. Включить banner на legacy host в `test`.
2. Проверить:
- banner виден на старом домене,
- CTA ведет на `https://datowave.com`,
- нет redirect-loop.
3. Зафиксировать evidence (скрин + smoke/ручная проверка).
4. После test-валидации включить в `prod` по approval.

## 5) Post-cutover report (ready-to-fill)

- Environment:
- Period covered:
- Invited users total:
- Activated users total:
- Pending users total:
- Failed deliveries:
- Top blockers:
- Recovery actions:
- Final status: `stable | needs-followup`.

## 6) Suggested execution order

1. Заполнить campaign batch template.
2. Отправить invite/reset в `test` группе.
3. Пройти manual verification checklist (10 users).
4. Включить и проверить migration banner в `test`.
5. Сформировать post-cutover report draft.
