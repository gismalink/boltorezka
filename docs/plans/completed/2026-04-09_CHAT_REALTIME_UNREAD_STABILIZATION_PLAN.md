# План: Стабилизация realtime чата и unread counters
Date: 2026-04-09
Status: Closed
Closed At: 2026-04-11
Scope: Web chat/runtime + websocket message controller + unread reconciliation в apps/web, а также согласование ws event coverage для topic lifecycle. Вне scope: полный редизайн API протокола, миграции БД, крупные UI-рефакторинги.

## 0) Контекст

- Зафиксированы расхождения unread в сценариях с разными пользователями/браузерами: часть обновлений приходила только после HTTP refresh.
- В коде одновременно используются realtime инкременты и периодическая серверная сверка; текущая логика merge и read-decrement может давать drift.
- Нужен детерминированный и предсказуемый контур: realtime как быстрый путь, reconciliation как корректирующий путь без ложных возвратов старых значений.

## 1) Цели

- Убрать ложные инкременты/декременты unread и mentionUnread при `chat.topic.read`.
- Исключить возврат устаревших unread значений из cache-hit ветки background refresh.
- Закрыть пробел маршрутизации websocket-событий для жизненного цикла топиков (`chat.topic.deleted`).
- Зафиксировать единые правила обработки сообщений: событие -> локальный realtime update -> reconciliation без регрессий.

## 2) Workstreams

### 2.1 P0: Корректность unread/read (критично)

- [x] Проаудировать цепочку `chat.message` -> unread increment -> UI counters.
- [x] Исправить `chat.topic.read`: корректная дельта, без `Math.max(1, ...)`, без ложных вычитаний.
- [x] Сбрасывать и `unreadCount`, и `mentionUnreadCount` на прочитанном топике.
- [x] Исправить background refresh merge: cache-hit не должен реинжектить устаревшие значения поверх актуальных.

### 2.2 P1: Покрытие realtime событий и устойчивость

- [x] Добавить обработчик `chat.topic.deleted` на клиенте.
- [x] Привести обработку payload в WS handlers к консистентному поведению для room/topic полей.
- [x] Убрать хрупкие места optimistic delivery при смене контекста (room/topic switch).

### 2.3 P2: Рефакторинг и observability

- [x] Локально сократить связность unread логики (выделение helper/use-case функций).
- [x] Добавить targeted unit-тесты на read-decrement и reconciliation merge.
- [x] Добавить краткие runtime-логи для диагностики рассинхрона (временно, под флаг/ограничение шумности).

## 3) Приоритеты

1. P0: Корректность unread/read в realtime и reconciliation.
2. P1: Полнота websocket event coverage и устойчивость delivery.
3. P2: Рефакторинг, тесты и операционная наблюдаемость.

## 4) Acceptance criteria

- [x] В сценарии 2 пользователя / 2 браузера unread в неактивной комнате меняется без перезагрузки страницы.
- [x] `chat.topic.read` не вычитает unread/mention, если в топике фактически 0.
- [x] После read-события `mentionUnreadCount` топика не остаётся висеть > 0.
- [x] Background refresh не поднимает unread назад из cache-hit после успешного read.
- [x] `chat.topic.deleted` корректно отражается в UI без ручного refresh.
- [x] `npm -C apps/web run build` проходит без ошибок.
- [x] Deploy в `test` + smoke check проходит.
- Прогресс 2026-04-11: `deploy:test:smoke` для `feature/ws-version-sync-datute` на SHA `8d6d85c98fd8e78dd5afb3f7c46283f9556082ea` завершён успешно; `smoke:chat:anchor-jump`, `smoke:realtime`, `smoke:web:version-cache`, auth/api/browser smoke — зелёные.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
