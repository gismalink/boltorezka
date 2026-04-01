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

## Переменные

- `SOCKETIO_POC_PORT` (default `3199`)
- `SOCKETIO_POC_URL` (default `http://127.0.0.1:3199`)
- `SOCKETIO_POC_ROOM` (default `poc-room`)

## Что фиксируем для сравнения

- `pingAckMs`
- `roomJoinAckMs` (оба клиента)
- `chat.send`:
  - `sendAckMs`
  - `receiveMsOnPeerB`

## Важно

- POC изолирован и не подключен в runtime `apps/api/src/routes/realtime.ts`.
- Это исследовательский контур, не prod path.
