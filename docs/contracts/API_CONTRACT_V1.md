# Boltorezka HTTP API Contract v1

Каноничный минимальный HTTP-контракт для текущего MVP-контура.

## Base

- Base path: `/v1/*`
- Auth mode: `sso`
- Bearer JWT: required для protected endpoints

## Auth

### GET /v1/auth/mode

- Auth: public
- 200:
  - `mode`: `sso`
  - `ssoBaseUrl`: string

### GET /v1/auth/sso/start?provider=google|yandex&returnUrl=<url>

- Auth: public
- 302 redirect на central auth
- 400 `ValidationError` при некорректном provider

### GET /v1/auth/sso/logout?returnUrl=<url>

- Auth: public
- 302 redirect на central auth logout

### GET /v1/auth/sso/session

- Auth: cookie session from central auth
- 200:
  - `authenticated: false|true`
  - `user: User | null`
  - `token: string | null` (local JWT for API/WS ticket)
  - `sso` metadata when authenticated
- 503 `SsoUnavailable` при проблеме с central SSO

### POST /v1/auth/register

- Auth: public
- 410 `SsoOnly`

### POST /v1/auth/login

- Auth: public
- 410 `SsoOnly`

### GET /v1/auth/me

- Auth: Bearer JWT
- 200:
  - `user: User | null`

### GET /v1/auth/ws-ticket

- Auth: Bearer JWT
- 200:
  - `ticket`: uuid
  - `expiresInSec`: number (current 45)
- 401 `Unauthorized`

## Rooms

### GET /v1/rooms

- Auth: Bearer JWT
- 200:
  - `rooms[]`: `{ id, slug, title, is_public, created_at, is_member }`

### POST /v1/rooms

- Auth: Bearer JWT + role `admin|super_admin`
- Body:
  - `slug` (3..48, `^[a-z0-9-]+$`)
  - `title` (3..120)
  - `is_public` (optional, default true)
- 201:
  - `room`: `{ id, slug, title, is_public, created_at }`
- 400 `ValidationError`
- 409 `Conflict` (slug exists)
- 401/403 for authz/authn violations

### GET /v1/rooms/:slug/messages?limit=1..100&beforeCreatedAt=<iso>&beforeId=<id>

- Auth: Bearer JWT
- Cursor pagination:
  - initial page: only `limit`
  - next page: pass both `beforeCreatedAt` + `beforeId` from previous `pagination.nextCursor`
  - `beforeCreatedAt` and `beforeId` must be provided together
- 200:
  - `room`: `{ id, slug, title, is_public }`
  - `messages[]`: `{ id, room_id, user_id, text, created_at, user_name }`
  - `pagination`:
    - `hasMore`: boolean
    - `nextCursor`: `{ beforeCreatedAt, beforeId } | null`
- 400 `ValidationError` for invalid cursor params
- 404 `RoomNotFound`
- 403 `Forbidden` (private room without membership)

## Admin / RBAC

### GET /v1/admin/users

- Auth: Bearer JWT + role `admin|super_admin`
- 200:
  - `users[]`: `{ id, email, name, role, created_at }`

### POST /v1/admin/users/:userId/promote

- Auth: Bearer JWT + role `super_admin`
- Body:
  - optional `role`, only `admin`
- 200:
  - `user`: updated user row
- 400 `ValidationError`
- 404 `UserNotFound`

## Telemetry

### POST /v1/telemetry/web

- Auth: optional Bearer JWT
- Body:
  - `event` (1..120)
  - `level` (optional, 1..24)
  - `meta` (optional object)
- 200: `{ ok: true }`
- 400 `ValidationError`
- 401 `Unauthorized` if invalid bearer format/token

### GET /v1/telemetry/summary

- Auth: Bearer JWT + role `admin|super_admin`
- 200:
  - `day`
  - `metrics`: `{ nack_sent, ack_sent, chat_sent, chat_idempotency_hit, telemetry_web_event }`

## Health

### GET /health

- Auth: public
- 200:
  - `status`: `ok|degraded`
  - `checks`: `{ api, db, redis }`
  - `ts`

## Error model (current baseline)

Typical error envelope:

```json
{
  "error": "ValidationError|Unauthorized|Forbidden|Conflict|RoomNotFound|UserNotFound|SsoOnly|SsoUnavailable",
  "message": "human-readable"
}
```

Some validation responses may return `issues` (zod flatten output).
