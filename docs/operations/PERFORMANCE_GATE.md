# Post-MVP Performance Gate

Цель: зафиксировать минимальные пороги GO/NO-GO для test/prod readiness после MVP.

## Scope

- API latency (p95/p99) на smoke/load сценариях.
- WS reconnect success.
- Call/video setup success.
- Базовая стабильность realtime (ack/nack/idempotency без аномалий).

## GO criteria (все обязательны)

1. **API latency**
   - p95 `GET /health` <= 400 ms (test нагрузочный профиль),
   - p99 `GET /health` <= 900 ms,
   - timeout/error rate <= 0.1%.
2. **Realtime reconnect**
   - `smoke:realtime` возвращает `reconnectOk=true` в test postdeploy.
3. **Call setup / relay**
   - extended relay smoke (`SMOKE_CALL_SIGNAL=1`) PASS,
   - нет роста `call.* handling failed`/critical ICE ошибок в postdeploy logs.
4. **Web/API compatibility**
   - `smoke:web:version-cache` PASS (`/version` + cache policy).
5. **Operational stability**
   - `deploy:test:smoke` PASS на целевом ref,
   - container health stable (`Up`),
   - явные критичные ошибки в API logs отсутствуют.

## NO-GO criteria (любой пункт)

- p95/p99 выше порогов,
- reconnect/call relay smoke FAIL,
- `smoke:web:version-cache` FAIL,
- деградация API health или spike критичных runtime ошибок,
- отсутствие валидного test evidence на текущем ref.

## Evidence sources

- `docs/status/TEST_RESULTS.md` — циклы с latency/reconnect/relay.
- `docs/operations/SMOKE_CI_MATRIX.md` — обязательные smoke-гейты.
- `docs/runbooks/PREPROD_DECISION_PACKAGE.md` — финальный GO/NO-GO пакет.
