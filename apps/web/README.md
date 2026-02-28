# Web App (boltorezka)

Frontend package на `React + TypeScript + Vite`.

## Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`

## Import conventions (2026-02-28)

- Use barrel entrypoints:
  - `src/components`
  - `src/hooks`
  - `src/services`
- Use domain types entrypoint:
  - `src/domain` (re-export from `src/types.ts`)
- Prefer imports in form:
  - `from "./components"`
  - `from "./hooks"`
  - `from "./services"`
  - `from "./domain"`
- Direct file imports are allowed only for local module internals (for example `./types` inside `components`).

## Notes

- Internal structure and boundaries are documented in `docs/ARCHITECTURE_NOTES.md`.

## WebRTC env (optional)

- `VITE_RTC_ICE_SERVERS_JSON` — JSON array of ICE servers for STUN/TURN.
- `VITE_RTC_ICE_TRANSPORT_POLICY` — `all` or `relay`.
- `VITE_RTC_RECONNECT_MAX_ATTEMPTS` — max auto-reconnect tries for active call session.
- `VITE_RTC_RECONNECT_BASE_DELAY_MS` / `VITE_RTC_RECONNECT_MAX_DELAY_MS` — reconnect backoff window.
