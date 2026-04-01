# Socket.IO POC (non-prod path)

Цель spike: сравнить baseline native WebSocket протокола с Socket.IO для трех событий:
- `ping`
- `room.join`
- `chat.send`

## Запуск

1. Поднять server POC:

```bash
npm --prefix apps/api run spike:socketio:server
```

2. В отдельном терминале запустить client harness:

```bash
npm --prefix apps/api run spike:socketio:client
```

3. Для native ws POC:

```bash
npm --prefix apps/api run spike:ws:server
npm --prefix apps/api run spike:ws:client
```

4. Для автоматического сравнения обоих вариантов:

```bash
npm --prefix apps/api run spike:compare
```

## Переменные

- `SOCKETIO_POC_PORT` (default `3199`)
- `SOCKETIO_POC_URL` (default `http://127.0.0.1:3199`)
- `SOCKETIO_POC_ROOM` (default `poc-room`)
- `NATIVE_WS_POC_PORT` (default `3200`)
- `NATIVE_WS_POC_URL` (default `ws://127.0.0.1:3200/ws`)
- `NATIVE_WS_POC_ROOM` (default `poc-room`)

## Что фиксируем для сравнения

- `pingAckMs`
- `roomJoinAckMs` (оба клиента)
- `chat.send`:
  - `sendAckMs`
  - `receiveMsOnPeerB`

## Важно

- POC изолирован и не подключен в runtime `apps/api/src/routes/realtime.ts`.
- Это исследовательский контур, не prod path.
