# SFU Session Contract (Stage 0 Canonical)

Дата: 2026-03-06  
Статус: Draft approved for Stage 0 test implementation

## 1) Назначение

Документ фиксирует единый transport contract для SFU session lifecycle и совместимость с текущим WS signaling контуром Boltorezka.

## 2) Общие правила

- Контур внедрения: только `test`.
- Routing источник истины: сервер (`mediaTopology` в room metadata/events).
- Допустимые topology значения: `p2p` | `sfu`.
- При недоступности SFU или несовместимости клиента обязателен rollback на `p2p` для новых сессий.

## 3) Routing contract (уже внедрен в Stage 0 scaffold)

Server outbound events:
- `room.joined.payload.mediaTopology`
- `room.presence.payload.mediaTopology`
- `rooms.presence.payload.rooms[].mediaTopology`

Семантика:
- `p2p`: текущий baseline путь (default).
- `sfu`: room помечена для SFU media plane (на Stage 0 пока без переключения runtime-пайплайна).

## 4) Session contract: client -> server

События резервируются как canonical SFU transport API:

1. `sfu.join`
- payload:
  - `roomSlug: string`
  - `sessionId: string` (client-generated idempotent join session id)
  - `capabilities: { audio: boolean; video: boolean; simulcast?: boolean; codecPreferences?: string[] }`

2. `sfu.publish`
- payload:
  - `sessionId: string`
  - `kind: "audio" | "video"`
  - `transportId: string`
  - `rtpParameters: Record<string, unknown>`

3. `sfu.subscribe`
- payload:
  - `sessionId: string`
  - `targetUserId: string`
  - `kinds: Array<"audio" | "video">`

4. `sfu.leave`
- payload:
  - `sessionId: string`
  - `reason?: string`

## 5) Session contract: server -> client

1. `sfu.joined`
- payload:
  - `sessionId: string`
  - `routerId: string`
  - `transportOptions: Record<string, unknown>`

2. `sfu.participant_published`
- payload:
  - `userId: string`
  - `kinds: Array<"audio" | "video">`
  - `producerRefs: Array<{ kind: "audio" | "video"; producerId: string }>`

3. `sfu.subscribed`
- payload:
  - `sessionId: string`
  - `targetUserId: string`
  - `consumerRefs: Array<{ kind: "audio" | "video"; consumerId: string; parameters: Record<string, unknown> }>`

4. `sfu.left`
- payload:
  - `sessionId: string`
  - `reason?: string`

5. `sfu.error`
- payload:
  - `code: string`
  - `message: string`
  - `sessionId?: string`

## 6) Capability envelope (web)

Минимально поддерживаемые capability flags на Stage 0:
- `audio=true`
- `video=true`
- `simulcast=false` (может быть включен позже)
- `codecPreferences` опционален и advisory-only

## 7) Совместимость и rollback

- Клиенты без SFU поддержки продолжают работать через `p2p`.
- Если room помечена как `sfu`, но SFU join неуспешен, server возвращает `sfu.error` и инициирует fallback policy.
- Stage 0 не меняет production behavior и не меняет default topology (`p2p`).

## 8) Метрики Stage 0/1 (обязательный минимум)

- `sfu_join_attempt`
- `sfu_join_success`
- `sfu_join_failed`
- `sfu_publish_attempt`
- `sfu_publish_success`
- `sfu_subscribe_attempt`
- `sfu_subscribe_success`
- `sfu_reconnect_join_success`
- `sfu_one_way_media_incident`

Рекомендуемые labels:
- `room_slug`
- `media_topology`
- `failure_code` (для *_failed)
- `client_version`

## 9) Связанные документы

- `docs/architecture/SFU_MIGRATION_PLAN.md`
- `docs/architecture/SFU_STAGE0_EXECUTION_PLAN.md`
- `docs/architecture/PHASE0_MVP_ADR.md`
