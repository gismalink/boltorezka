# Desktop Runtime Transport Runbook

Purpose: canonical runtime endpoint resolution matrix for web/desktop and a quick diagnostics path for incidents класса `WS=ok, RTC=fail`.

## 1) Runtime matrix

| Runtime | Runtime ID | public origin source | API base | Realtime WS base | RTC signal normalization |
| --- | --- | --- | --- | --- | --- |
| web-dev | `web-dev` | `window.location` (без `VITE_APP_PUBLIC_ORIGIN`) | `http(s)://<current-host>` | `ws://` для `http`, `wss://` для `https` | входной URL без форсинга secure transport |
| web-prod | `web-prod` | `window.location` или `VITE_APP_PUBLIC_ORIGIN` | `https://<public-host>` | `wss://<public-host>` | `ws://` автоматически повышается до `wss://` |
| desktop-dev | `desktop-dev` | fallback desktop origin при `file://` | fallback origin (`resolvePublicOrigin`) | derived from fallback origin | secure transport не форсится, если runtime не `https` |
| desktop-prod | `desktop-prod` | `VITE_APP_PUBLIC_ORIGIN` (обязательно для release) | `https://<public-host>` | `wss://<public-host>` | `ws://...:7880` -> `wss://...:7881` |

Invariants:
- Для production-like runtime (`web-prod`, `desktop-prod`) transport должен быть только `https/wss`.
- `apps/web/src/transportRuntime.ts` является единой точкой резолва API/WS/RTC/SSO endpoint-ов.
- Любые новые runtime ветки не добавляются локально в feature-код без обновления этого runbook.

## 2) Implementation map

- Unified resolver: `apps/web/src/transportRuntime.ts`
- API path resolution: `apps/web/src/api.ts`
- Realtime websocket base: `apps/web/src/services/realtimeClient.ts`
- SSO start/logout URL resolution: `apps/web/src/services/authController.ts`
- RTC signal URL normalization + diagnostics: `apps/web/src/hooks/rtc/useLivekitVoiceRuntime.ts`

## 3) Desktop diagnostics in call log

При `file://` runtime перед LiveKit connect пишутся строки:
- `transport runtime=<runtimeId> api=<resolved-api-base> ws=<resolved-ws-base> publicOrigin=<resolved-origin>`
- `livekit signal raw=<token-response-url>`
- `livekit signal resolved=<normalized-url>`

Эти строки обязательны для triage, когда websocket chat соединение живое, но voice runtime не поднимается.

## 4) Quick verification (test)

1. Запустить desktop runtime smoke на `test` контуре.
2. Убедиться, что в call log появились `transport runtime=...` + `livekit signal raw/resolved`.
3. Прогнать targeted smoke после изменения resolver:
   - `npm run smoke:realtime`
   - `npm run smoke:livekit:token-flow`
   - practical desktop media check (manual or scripted current gate)

Expected:
- В desktop runtime `runtimeId` соответствует `desktop-dev` или `desktop-prod`.
- Для production origin websocket всегда `wss://`.
- `livekit signal resolved` совпадает с transport policy (`wss` для secure runtime).
