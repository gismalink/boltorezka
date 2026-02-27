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
- `call.offer`
- `call.answer`
- `call.ice`
- `call.reject`
- `call.hangup`

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
- call relay: `relayedTo`, `targetUserId`

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

### call.offer | call.answer | call.ice

Input payload:

```json
{
  "signal": {},
  "targetUserId": "optional-user-id"
}
```

Rules:

- requires active room
- `payload.signal` required and size validated (2..12000 bytes)
- when `targetUserId` omitted: relay to all room peers except sender
- when `targetUserId` provided: relay only to that user in same room

Outputs:

- relayed `call.offer|call.answer|call.ice` envelope
- `ack` with `relayedTo`
- `nack(TargetNotInRoom)` when targeted user has no room socket

### call.reject | call.hangup

Input payload:

```json
{
  "targetUserId": "optional-user-id",
  "reason": "optional-string"
}
```

Rules and relay model are the same as call signaling events.

Outputs:

- relayed `call.reject|call.hangup`
- `ack` with `relayedTo`
- `nack(TargetNotInRoom)` for missing targeted peer

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
