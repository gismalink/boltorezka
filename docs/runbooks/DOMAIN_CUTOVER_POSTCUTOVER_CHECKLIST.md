# Domain Cutover Post-Cutover Checklist (owners)

Цель: контрольный список после переключения домена с явными владельцами и сроками.

Использование:
- Создай запись на rollout (`test`/`prod`) и назначь owners до старта.
- Каждому пункту нужен статус: `todo | in-progress | done | blocked`.

## 1) Release record

- Environment: `test | prod`
- Cutover date/time (UTC):
- Release owner:
- Rollback owner:
- Incident comms owner:
- Commit SHA:
- Rollback ref:

## 2) Immediate checks (0-30 минут)

1. Health checks на новых host.
- Owner: Release owner
- SLA: 10 минут
- Status:

2. Auth redirect/start/logout smoke (`smoke:sso`, `smoke:sso:routing`).
- Owner: Auth owner
- SLA: 15 минут
- Status:

3. Session/realtime/media smoke пакет.
- Owner: Realtime owner
- SLA: 30 минут
- Status:

4. Проверка redirect-map (legacy -> datowave) без loop.
- Owner: Edge owner
- SLA: 30 минут
- Status:

## 3) Short-term checks (0-24 часа)

1. Логи API/ingress без повторяющихся критичных ошибок.
- Owner: On-call
- Status:

2. Мониторинг auth fail rate/latency на новых host.
- Owner: SRE owner
- Status:

3. Мониторинг media incidents (one-way/stalled/reconnect spikes).
- Owner: Realtime owner
- Status:

4. Проверка desktop update endpoints (если релиз затрагивал desktop).
- Owner: Desktop owner
- Status:

## 4) Re-onboarding checks (в окно совместимости)

1. Рассылка re-onboarding сообщения текущим пользователям.
- Owner: Product/Support owner
- Status:

2. Отправка invite/reset ссылок на новый домен.
- Owner: Support owner
- Status:

3. Проверка migration banner на старом домене.
- Owner: Web owner
- Status:

4. Трек invited -> activated (ежедневно).
- Owner: Product owner
- Status:

## 5) Completion gate

Cutover считается стабилизированным, когда:
- все immediate checks = `done`,
- нет открытых `blocked` в short-term checks,
- для re-onboarding есть актуальный прогресс-отчет.

## 6) Post-cutover report template

- Environment:
- Period covered:
- Invited users:
- Activated users:
- Pending users:
- Main incidents:
- Rollbacks (if any):
- Final decision: `stable | needs-followup`.
