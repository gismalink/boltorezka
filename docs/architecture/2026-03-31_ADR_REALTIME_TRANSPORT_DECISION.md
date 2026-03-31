# ADR: Realtime transport decision (native WebSocket vs Socket.IO)

Date: 2026-03-31
Status: Accepted

## Контекст

В текущей архитектуре realtime слой уже реализован на native WebSocket и включает:

- typed envelope protocol (`type`, `requestId`, optional `idempotencyKey`, `payload`),
- собственные `ack/nack/error` конверты,
- idempotency и retry/ack-timeout логику,
- smoke и unit тесты на transport/protocol behavior.

Появился вопрос, стоит ли перейти на Socket.IO как готовый websocket framework.

## Decision

На текущем этапе оставляем native WebSocket как основной realtime transport.
Переход на Socket.IO не выполняем как default path.

## Decision matrix

Оценка: 1 (хуже) .. 5 (лучше)

| Критерий | Native WS (current) | Socket.IO migration now | Комментарий |
|---|---:|---:|---|
| Текущая функциональная зрелость | 5 | 3 | Контракт и поведение уже реализованы и проверяются smokes. |
| Migration effort | 4 | 1 | Socket.IO потребует миграции server/client envelope и части smoke stack. |
| Риск регрессий | 4 | 2 | Высокий риск протокольного дрейфа на период миграции. |
| Production payoff в текущем scope | 4 | 2 | Ключевые текущие проблемы в boundaries/gates, а не transport framework. |
| Масштабирование экосистемой adapters | 3 | 4 | Socket.IO может упростить отдельные сценарии горизонтального fan-out. |
| Fallback на long-polling | 2 | 5 | Сильная сторона Socket.IO, если это станет обязательным требованием. |

## Последствия

Плюсы:

- Избегаем крупного migration ветвления в период активной стабилизации архитектуры.
- Фокусируемся на P0: auth storage hardening и mandatory quality gates.

Минусы:

- Остается стоимость сопровождения собственного transport слоя.
- Нет built-in long-polling fallback из коробки.

## Триггеры пересмотра решения

Пересматривать ADR, если выполняется хотя бы один пункт:

1. Long-polling fallback становится обязательным product requirement.
2. Для горизонтального масштабирования требуется adapter ecosystem и migration cost становится оправданным.
3. Поддержка собственного transport слоя начинает занимать >20% realtime engineering capacity в течение двух последовательных итераций.

## План безопасного пересмотра (если триггер сработал)

1. Поднять отдельный Spike/POC (не в prod path): `ping`, `room.join`, `chat.send`.
2. Сравнить latency/error-rate/reconnect behavior на одинаковом smoke сценарии.
3. Принять go/no-go только после test environment отчета и rollback плана.
