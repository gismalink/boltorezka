# Boltorezka Pre-Prod Decision Package

Дата: 2026-03-07  
Среда подготовки: `test`  
Релизный поток: `feature/* -> test -> merge -> main -> prod`

## 1) Decision summary

- Decision status: **REFRESHED (NO-GO пока не выполнен новый prod sign-off)**.
- Причина: пакет обновлён под актуальные gate-правила и свежие test evidence (`Cycle #15`, rollout от `origin/main`), но новый explicit prod approval ещё не заполнялся.
- Production rollout policy: только из `origin/main` после отдельного explicit approval.
- SFU readiness reference: `docs/runbooks/SFU_STAGE4_PROD_READINESS_PACKAGE.md`.

## 2) Scope of evidence

Этот пакет агрегирует:
- последнюю test-валидацию deploy+smoke,
- e2e smoke coverage для web MVP (`login/join/send/voice/reconnect`),
- rollback owner/plan и команды,
- owner responsibilities при rollout/rollback.

## 3) Current technical evidence

### 3.1 Latest verified test rollout

- Branch: `origin/main`
- Verified deploy SHA in test: `29ad7be`
- Command:
  - `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'`
- Result:
  - `health` — PASS
  - `smoke:sso` — PASS
  - `smoke:api` — PASS
  - `smoke:web:version-cache` — PASS
  - `smoke:realtime` — PASS
  - `reconnectOk=true`

### 3.1.1 Static delivery mode (current)

- Current validated mode in test: **Caddy-only static serving**.
- Runtime model:
  - API container serves only API/WS/auth (`API_SERVE_STATIC=0`),
  - web static bundle synced to edge path `~/srv/edge/ingress/static/boltorezka/test`,
  - edge Caddy serves web static directly and routes API paths to `boltorezka-api-test`.

### 3.1.2 Additional readiness evidence (2026-03-04)

- Version/cache contract:
  - `index.html` served with `no-store/no-cache`.
  - hash-assets served as `immutable`.
  - `/version.appBuildSha` matches deployed build SHA in test.
- Runtime media resilience:
  - active-call auto-refresh outgoing mic track on `navigator.mediaDevices.devicechange` implemented and verified in build/type checks.
- Performance gate policy formalized:
  - canonical thresholds document: `docs/operations/PERFORMANCE_GATE.md`.

### 3.1.3 Latest production rollout (historical reference)

- Target: `origin/main`
- Deploy SHA in prod: `36dd4e129b92e7bb0300ff936a8359f6f9be3658`
- Commands:
  - `ssh mac-mini 'cd ~/srv/boltorezka && PROD_REF=origin/main npm run deploy:prod'`
  - post-checks: `curl -I https://boltorezka.gismalink.art/health`, `curl https://boltorezka.gismalink.art/v1/auth/mode`
- Result:
  - health: `200`
  - mode: `sso`

### 3.2 Web E2E smoke coverage (roadmap block)

- Unified flow command:
  - `npm run smoke:web:e2e`
- Actual orchestrator:
  - `scripts/smoke/smoke-web-e2e.sh`
- Coverage included:
  - login redirect (`smoke:sso`),
  - room join + message send/receive (`smoke:realtime`),
  - voice connect/disconnect relay path (`SMOKE_CALL_SIGNAL=1`),
  - reconnect scenario (`SMOKE_RECONNECT=1`),
  - admin moderation checks (`promote/demote/ban/unban`) в server profile UI.

### 3.4 Voice baseline evidence (canonical)

- Canonical runbook: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Закреплённый baseline:
  - `VITE_RTC_ICE_TRANSPORT_POLICY=relay`
  - `VITE_RTC_ICE_SERVERS_JSON` с `turns:gismalink.art:5349?transport=tcp`
- Важное runtime-условие: отправка offer/answer после ICE gathering (или timeout guard).

### 3.3 Verify pipeline gate

- Optional gate in baseline verify:
  - `SMOKE_WEB_E2E=1 npm run check`
- Gate integration file:
  - `scripts/verify-all.sh`

## 4) Rollback owner and responsibilities

### 4.1 Owner model (required)

- **Release Owner**: инженер, который инициирует `prod` rollout (single accountable owner).
- **Rollback Owner**: тот же Release Owner (или явно делегированный инженер, зафиксированный до rollout).
- **Incident Comms Owner**: on-duty owner (фиксирует статус в release log и командном канале).

### 4.2 Owner checklist before prod command

1. Подтвердить, что rollout идёт из `origin/main`.
2. Зафиксировать target SHA и план rollback до старта rollout.
3. Подтвердить доступ к server runbook/script path.
4. Подтвердить, что latest `test` smoke PASS и evidence приложен.

## 5) Rollback plan (command-level)

### 5.1 Trigger conditions

- health-check degradation,
- auth/SSO regression,
- realtime массовые disconnect/error spikes,
- message delivery/idempotency regressions,
- критичные user-facing ошибки после rollout.

### 5.2 Test rollback path (automated policy)

- Recommended protected rollout in test:
  - `AUTO_ROLLBACK_ON_FAIL=1 AUTO_ROLLBACK_SMOKE=1 TEST_REF=origin/<ref> npm run deploy:test:smoke`
- Behavior:
  - при smoke fail выполняется rollback на previous test SHA,
  - rollback outcome пишется в release-log.

### 5.3 Prod rollback path (manual, explicit)

- Rollback target: previous known-good `main` SHA.
- Deploy command (prod path):
  - `bash ./scripts/deploy/deploy-prod-from-ref.sh <known-good-ref> <repo-dir>`
- Post-rollback mandatory checks:
  - `curl -I https://boltorezka.gismalink.art/health`
  - short SSO + room + chat smoke
  - logs review (critical errors)

## 6) Release log / audit artifacts

- Local artifact:
  - `.deploy/release-log.tsv`
- Shared edge release log:
  - `~/srv/edge/RELEASE_LOG.md` (через edge release-log script)
- Smoke summary artifact:
  - `.deploy/last-smoke-summary.env`

## 7) Go/No-Go form for final approval

Перед prod нажать один из статусов:

- **GO** — все gates pass, owner подтверждён, rollback target/owner зафиксированы.
- **NO-GO** — хотя бы один gate не пройден.

### Approval record (to fill before prod)

- Release Owner: `<name>`
- Rollback Owner: `<name>`
- Target prod ref: `origin/main@<sha>`
- Rollback ref: `<known-good-sha>`
- Decision: `GO | NO-GO`
- Timestamp UTC: `<yyyy-mm-ddThh:mm:ssZ>`

## 8) MVP-like readiness gate (required before prod)

Этот раздел определяет, когда пункт roadmap “вернуться к `prod`” считается выполненным.

### 8.1 Mandatory GO criteria

Для статуса **GO** одновременно должны быть выполнены все пункты:

1. **Branch discipline**
  - rollout target = `origin/main@<sha>`;
  - feature branch не используется для `prod`.
2. **Test reliability**
  - свежий `deploy:test:smoke` — PASS;
  - `smoke:sso` — PASS;
  - `smoke:realtime` — PASS;
  - `reconnectOk=true`.
3. **Web e2e MVP coverage**
  - `npm run smoke:web:e2e` проходит с актуальным test URL и валидными smoke credentials.
4. **Realtime call relay coverage**
  - extended relay сценарий (`SMOKE_CALL_SIGNAL=1`) подтверждает relay-path (`call.offer/call.reject/call.hangup`).
5. **Operational readiness**
  - назначены `Release Owner` и `Rollback Owner`;
  - зафиксирован rollback ref (`<known-good-sha>`);
  - доступ к runbook/script path подтверждён.
6. **Audit trail readiness**
  - подготовлены release notes;
  - release/rollback команды и ожидаемые артефакты (`.deploy/release-log.tsv`, edge release log) известны заранее.
7. **Version/cache compatibility gate**
  - `smoke:web:version-cache` — PASS;
  - `appBuildSha` в `/version` соответствует deployed SHA.
8. **Performance gate compliance**
  - соблюдены пороги из `docs/operations/PERFORMANCE_GATE.md` (API latency/reliability + realtime stability) для текущего release кандидата.

### 8.2 Automatic NO-GO conditions

Если выполняется хотя бы одно условие — решение только **NO-GO**:

- любой smoke/e2e gate падает,
- нет явного owner sign-off,
- rollback target не определён до старта rollout,
- target ref не `origin/main`.

### 8.3 Pre-prod gate record (fill before prod)

- Target main SHA: `<sha>`
- Last test deploy SHA: `<sha>`
- smoke:sso: `PASS | FAIL`
- smoke:realtime: `PASS | FAIL`
- reconnectOk: `true | false`
- smoke:web:e2e: `PASS | FAIL`
- call relay scenario: `PASS | FAIL`
- Release Owner: `<name>`
- Rollback Owner: `<name>`
- Rollback ref: `<known-good-sha>`
- Final decision: `GO | NO-GO`

### 8.4 Current gate record (2026-03-01)

### 8.4 Current gate record (refresh 2026-03-07)

- Target main SHA: `<to-fill-before-next-prod>`
- Last test deploy SHA: `58c678f` (`origin/feature/video-stream-investigation`, Stage 3 SFU-default profile)
- smoke:sso: `PASS`
- smoke:api: `PASS`
- smoke:realtime: `PASS`
- reconnectOk: `true`
- smoke:web:version-cache: `PASS`
- smoke:web:e2e: `PASS`
- call relay scenario (`SMOKE_CALL_SIGNAL=1`): `PASS`
- SFU default profile (`deploy:test:sfu`): `PASS x5 consecutive`
- mediaTopology gate: `expected=sfu`, `mediaTopologyFirstOk=true`
- Performance gate (`docs/operations/PERFORMANCE_GATE.md`): `READY_FOR_SIGNOFF`
- Release Owner: `<to-fill-before-next-prod>`
- Rollback Owner: `<to-fill-before-next-prod>`
- Rollback ref: `<to-fill-before-next-prod>`
- Final decision: `NO-GO (pending merge-to-main validation, explicit prod approval and sign-off fields)`
