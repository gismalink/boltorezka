# Transport Sync Contract v2 (Draft)

Статус: draft (не каноничный прод-контракт)

Цель: задать единый протокол поверх WS/HTTP/SSE, чтобы убрать расхождения в ordering, delivery и recovery после reconnection.

## 1. Scope

Контракт покрывает:

- доставку realtime событий в клиент;
- клиентские мутации с ack/nack;
- дедупликацию при повторных отправках;
- восстановление состояния после разрыва соединения;
- fallback-пути (SSE/long-poll) без потери консистентности.

## 2. Core invariants

1. У каждого клиентского действия есть стабильный `clientEventId` (UUID).
2. У каждого серверного события есть монотонный `serverEventSeq` в пределах stream.
3. Каждый поток событий имеет `streamId` и `streamOffset`.
4. Сервер применяет idempotency по `idempotencyKey`.
5. Клиент применяет событие ровно один раз по `(streamId, serverEventSeq)`.

## 3. Envelope v2

Client -> server:

```json
{
  "type": "chat.edit",
  "requestId": "uuid",
  "clientEventId": "uuid",
  "idempotencyKey": "uuid",
  "streamId": "server:<serverId>:room:<roomId>",
  "lastAppliedSeq": 10452,
  "payload": {}
}
```

Server -> client event envelope:

```json
{
  "type": "chat.message",
  "streamId": "server:<serverId>:room:<roomId>",
  "serverEventSeq": 10453,
  "eventId": "uuid",
  "ts": "2026-04-07T10:15:20.000Z",
  "payload": {}
}
```

Server -> client ack envelope:

```json
{
  "type": "ack",
  "payload": {
    "requestId": "uuid",
    "clientEventId": "uuid",
    "eventType": "chat.edit",
    "acceptedAtSeq": 10453,
    "idempotencyKey": "uuid"
  }
}
```

Server -> client nack envelope:

```json
{
  "type": "nack",
  "payload": {
    "requestId": "uuid",
    "clientEventId": "uuid",
    "eventType": "chat.edit",
    "code": "ValidationError",
    "message": "text is empty"
  }
}
```

## 4. Ordering and dedup

Клиент хранит `lastAppliedSeqByStreamId`.

Правила применения входящего события:

1. Если `serverEventSeq <= lastAppliedSeq`, событие считается дубликатом и игнорируется.
2. Если `serverEventSeq == lastAppliedSeq + 1`, событие применяется сразу.
3. Если `serverEventSeq > lastAppliedSeq + 1`, фиксируется gap и запускается recovery.

## 5. Reconnection and gap recovery

На reconnect клиент отправляет handshake:

```json
{
  "type": "sync.resume",
  "payload": {
    "streams": [
      { "streamId": "server:s1:room:r1", "lastAppliedSeq": 10452 },
      { "streamId": "server:s1:room:r2", "lastAppliedSeq": 891 }
    ]
  }
}
```

Сервер отвечает одним из режимов:

1. `sync.delta` — список пропущенных событий по stream.
2. `sync.snapshot` + `sync.delta` — если окно delta уже утеряно.

Если `delta` недоступна (retention превышен), сервер обязан вернуть `snapshot` и верхний `serverEventSeq`.

## 6. HTTP/WS unified mutation policy

Для мутаций вводится единая policy-модель:

- `ws-only` — только WS.
- `ws-first-http-fallback` — сначала WS, при недоступности транспорта fallback в HTTP.
- `http-only` — только HTTP (например, upload init/finalize).

Требование: бизнес-операция описывается один раз через policy и единый mapping payload/result.

## 7. Polling fallback and server load policy

Короткий polling для high-frequency сущностей запрещен.

При деградации WS:

1. Предпочтительно SSE fallback (server push, без постоянного short polling).
2. Если SSE недоступен, допускается long-polling с backoff/jitter.
3. Short polling разрешен только для low-frequency admin/diagnostic сценариев.

## 8. Initial migration plan

Фаза 1:

- закрепить envelope v2 поля (`clientEventId`, `serverEventSeq`, `streamId`);
- добавить `sync.resume` handshake без включения strict gap-fail в UI.

Фаза 2:

- включить dedup по seq в клиенте;
- перевести inbox на SSE/WS events, оставить polling как аварийный fallback.

Фаза 3:

- перевести unread aggregate на push-события или один batched endpoint;
- удалить legacy short-poll контуры для high-frequency потоков.

## 9. Backward compatibility

Пока активен V1:

- сервер может не присылать `serverEventSeq` для старых каналов;
- клиент обязан мягко деградировать: применять V1-логику, но логировать отсутствие seq;
- rollout через feature flag по серверу и клиенту.

## 10. Open questions

1. Гранулярность stream: room-level или server-level per domain?
2. Размер retention окна для `sync.delta`.
3. Нужна ли отдельная компенсация для cross-stream causal ordering.
4. Где хранить lastAppliedSeq для desktop/web (memory vs persisted storage).
