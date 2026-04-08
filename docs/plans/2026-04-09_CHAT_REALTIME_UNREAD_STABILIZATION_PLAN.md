# План: Стабилизация realtime чата и unread counters
Date: 2026-04-09
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
- [ ] Привести обработку payload в WS handlers к консистентному поведению для room/topic полей.
- [ ] Убрать хрупкие места optimistic delivery при смене контекста (room/topic switch).

### 2.3 P2: Рефакторинг и observability

- [ ] Локально сократить связность unread логики (выделение helper/use-case функций).
- [ ] Добавить targeted unit-тесты на read-decrement и reconciliation merge.
- [ ] Добавить краткие runtime-логи для диагностики рассинхрона (временно, под флаг/ограничение шумности).

## 3) Приоритеты

1. P0: Корректность unread/read в realtime и reconciliation.
2. P1: Полнота websocket event coverage и устойчивость delivery.
3. P2: Рефакторинг, тесты и операционная наблюдаемость.

## 4) Acceptance criteria

- [ ] В сценарии 2 пользователя / 2 браузера unread в неактивной комнате меняется без перезагрузки страницы.
- [ ] `chat.topic.read` не вычитает unread/mention, если в топике фактически 0.
- [ ] После read-события `mentionUnreadCount` топика не остаётся висеть > 0.
- [ ] Background refresh не поднимает unread назад из cache-hit после успешного read.
- [ ] `chat.topic.deleted` корректно отражается в UI без ручного refresh.
- [ ] `npm -C apps/web run build` проходит без ошибок.
- [ ] Deploy в `test` + smoke check проходит.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
