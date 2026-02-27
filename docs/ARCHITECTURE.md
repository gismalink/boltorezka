# Boltorezka v2 Architecture

## 1) Цели

- Надёжный realtime chat/voice/video продукт.
- Единый backend-контракт для Web + iOS + macOS.
- Операционная предсказуемость через GitOps и runbook-driven deploy.

## 2) Высокоуровневая схема

1. **Control plane** (HTTP API)
   - Auth/session
   - Users/profiles
   - Rooms/membership/permissions
   - Message history

2. **Realtime plane** (WebSocket signaling)
   - Presence
   - Room events (join/leave/typing)
   - Call events (offer/answer/ice relay)

3. **Media plane** (WebRTC)
   - MVP: P2P для ограниченного размера комнаты.
   - Следующий этап: SFU для масштабирования групповых звонков.

4. **Data plane**
   - Postgres: постоянные сущности.
   - Redis: ephemeral state (presence, WS session routing, throttling).

## 3) Компоненты backend

- `boltorezka-api` (единый сервис: HTTP API + WebSocket signaling/presence/chat/call relay)
- `postgres`
- `redis`
- `coturn` (отдельный сервис, credentials только через env/secret manager)

Текущая production-shaped реализация использует единый runtime API сервис; выделение отдельного realtime сервиса рассматривается как будущая эволюция только при необходимости масштабирования.

## 4) Domain model (минимум)

- `User`
- `DeviceSession`
- `Room`
- `RoomMember`
- `Message`
- `CallSession`
- `CallParticipant`

## 5) Контракты и versioning

- HTTP: OpenAPI, versioned path (`/v1/...`).
- WS: envelope формата:

```json
{
  "v": 1,
  "type": "room.join",
  "requestId": "uuid",
  "payload": {}
}
```

- Все клиенты обязаны обрабатывать `error` и `server.capabilities`.

## 6) Надёжность

- Heartbeat/ping-pong для WS.
- Reconnect c exponential backoff.
- Idempotency для критичных команд (`send message`, `join room`).
- Ack/Nack протокол для клиента.

## 7) Безопасность

- Authz на каждом room action (не доверять клиенту).
- Rate limiting:
  - login/auth endpoints,
  - WS connect,
  - message send,
  - signaling events.
- Абсолютно без хардкода TURN credentials в репозитории.

## 8) Наблюдаемость

- Structured logs (requestId/userId/sessionId correlation).
- Метрики:
  - WS active connections,
  - join/leave rate,
  - message latency,
  - call setup success ratio,
  - ICE failure rate.
- Health endpoints: liveness/readiness.

## 9) Мультиплатформа (Web + iOS + macOS)

### Общие принципы

- Один backend-контракт для всех платформ.
- Единая доменная терминология (room/member/presence/call state).
- Feature parity по фазам, не “всё сразу”.

### Web

- Первая платформа для fastest feedback.
- Референс-реализация новых протоколов WS/RTC.

### iOS + macOS

- Общий Swift package:
  - `BoltorezkaCoreModels`
  - `BoltorezkaNetworking`
  - `BoltorezkaRealtime`
  - `BoltorezkaCallEngine`
- UI слой:
  - SwiftUI for iOS
  - SwiftUI for macOS
- iOS-specific later phase:
  - audio interruptions,
  - route changes,
  - push/call integrations (если потребуется продуктом).

## 10) Legacy migration

Текущие файлы legacy POC не удаляются сразу, но считаются временными:

- `boltorezkaApp.js`
- `webSocketHandler.js`
- `mdl/*`

Миграция идёт через постепенную замену слоёв на новую архитектуру, начиная с backend контрактов.
