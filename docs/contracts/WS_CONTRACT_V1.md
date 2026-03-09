# Boltorezka WebSocket Contract v1

Каноничный контракт realtime envelope и событий.

## Connection

- URL: `/v1/realtime/ws?ticket=<ws-ticket>`
- Ticket source: `GET /v1/auth/ws-ticket`
- Bearer token в query не используется

### Handshake failures

- Missing ticket -> error `MissingTicket`, close `4001`
- Invalid/expired ticket -> error `InvalidTicket`, close `4002`
- Corrupted ticket payload -> error `InvalidTicket`, close `4003`
- Missing subject in ticket -> error `InvalidTicket`, close `4004`

## Envelope format

Client -> server:

```json
{
  "type": "string",
  "requestId": "optional-string",
  "idempotencyKey": "optional-string",
  "payload": {}
}
```

Server -> client envelope types:

- `server.ready`
- `ack`
- `nack`
- `error`
- `pong`
- `room.joined`
- `room.left`
- `room.presence`
- `presence.joined`
- `presence.left`
- `chat.message`
- `chat.edited`
- `chat.deleted`
- `call.initial_state`
- `call.mic_state`
- `call.video_state`

## Server control envelopes

### server.ready

```json
{
  "type": "server.ready",
  "payload": {
    "userId": "string",
    "userName": "string",
    "connectedAt": "iso-datetime"
  }
}
```

### ack

```json
{
  "type": "ack",
  "payload": {
    "requestId": "string",
    "eventType": "string",
    "ts": 1700000000000
  }
}
```

Extended ack meta can include:

- room join: `roomId`, `roomSlug`
- chat send: `messageId`, `idempotencyKey`
- duplicate chat send: `duplicate: true`, `idempotencyKey`
- call state relay: `relayedTo`

### nack

```json
{
  "type": "nack",
  "payload": {
    "requestId": "string",
    "eventType": "string",
    "code": "string",
    "message": "string",
    "ts": 1700000000000
  }
}
```

Common `code` values:

- `UnknownEvent`
- `ValidationError`
- `NoActiveRoom`
- `TargetNotInRoom`
- `RoomNotFound`
- `Forbidden`
- `MessageNotFound`
- `EditWindowExpired`
- `DeleteWindowExpired`

### error

```json
{
  "type": "error",
  "payload": {
    "code": "string",
    "message": "string"
  }
}
```

### pong

```json
{
  "type": "pong",
  "payload": {
    "ts": 1700000000000
  }
}
```

## Client events (supported)

### ping

- Input: `{ type: "ping" }`
- Output: `pong` + `ack`

### room.join

Input payload:

```json
{ "roomSlug": "general" }
```

Outputs:

- `room.joined`
- `ack`
- `room.presence`
- broadcast `presence.joined` to other sockets in room

### room.leave

Input payload:

```json
{}
```

Rules:

- requires active room

Outputs:

- `room.left`
- `ack`
- broadcast `presence.left` to other sockets in previous room

### chat.send

Input payload:

```json
{ "text": "hello" }
```

Rules:

- requires active room
- idempotent when `idempotencyKey` provided

Outputs:

- broadcast `chat.message`
- `ack`
- duplicate send returns cached `chat.message` + `ack(duplicate=true)`

### chat.edit

Input payload:

```json
{ "messageId": "uuid", "text": "updated text" }
```

Rules:

- requires active room
- only own message can be edited
- edit window: 10 minutes from `created_at`

Outputs:

- broadcast `chat.edited`
- `ack`
- `nack` with `MessageNotFound|Forbidden|EditWindowExpired` on violation

### chat.delete

Input payload:

```json
{ "messageId": "uuid" }
```

Rules:

- requires active room
- only own message can be deleted
- delete window: 10 minutes from `created_at`

Outputs:

- broadcast `chat.deleted`
- `ack`
- `nack` with `MessageNotFound|Forbidden|DeleteWindowExpired` on violation

### call.mic_state

Input payload:

```json
{
  "muted": true,
  "speaking": false,
  "audioMuted": false
}
```

Rules:

- requires active room
- relayed to room peers except sender

Outputs:

- relayed `call.mic_state` envelope
- `ack` with `relayedTo`

### call.video_state

Input payload:

```json
{
  "settings": {
    "localVideoEnabled": true
  }
}
```

Rules:

- requires active room
- relayed to room peers except sender

Outputs:

- relayed `call.video_state`
- `ack` with `relayedTo`

### call.initial_state (server replay)

Sent by server on `room.join` as a snapshot of known participants call state for late joiners.

The payload includes:

- `roomSlug`
- `participants[]` with `userId`, optional `mic` and optional `video` state

## Server broadcast payloads

### room.joined

```json
{
  "roomId": "string",
  "roomSlug": "string",
  "roomTitle": "string"
}
```

### room.left

```json
{
  "roomId": "string",
  "roomSlug": "string"
}
```

### room.presence

```json
{
  "roomId": "string",
  "roomSlug": "string",
  "users": [{ "userId": "string", "userName": "string" }]
}
```

### presence.joined | presence.left

```json
{
  "userId": "string",
  "userName": "string",
  "roomSlug": "string|null",
  "presenceCount": 1
}
```

### chat.message

```json
{
  "id": "uuid",
  "roomId": "string",
  "roomSlug": "string|null",
  "userId": "string",
  "userName": "string",
  "text": "string",
  "createdAt": "iso-datetime",
  "senderRequestId": "string|null"
}
```

### chat.edited

```json
{
  "id": "uuid",
  "roomId": "string",
  "roomSlug": "string|null",
  "text": "string",
  "editedAt": "iso-datetime",
  "editedByUserId": "string"
}
```

### chat.deleted

```json
{
  "id": "uuid",
  "roomId": "string",
  "roomSlug": "string|null",
  "deletedByUserId": "string",
  "ts": "iso-datetime"
}
```

### call.* relay payload

```json
{
  "fromUserId": "string",
  "fromUserName": "string",
  "roomId": "string",
  "roomSlug": "string|null",
  "targetUserId": "string|null",
  "ts": "iso-datetime"
}
```

Signal events add `signal`, terminal events add `reason`.

## Compatibility note

This is a v1 operational contract for current implementation.
Breaking changes must be introduced with explicit versioning strategy and smoke matrix update.
