# Boltorezka Pre-Prod Decision Package

Дата: 2026-02-28  
Среда подготовки: `test`  
Релизный поток: `feature/* -> test -> merge -> main -> prod`

## 1) Decision summary

- Decision status: **NOT READY FOR PROD** (пакет подготовлен, используется как gate-документ).
- Причина: пакет evidence/rollback собран, но перед `prod` всё равно требуется явное подтверждение владельца релиза и merge-ready состояние по бизнес-критериям MVP.
- Production rollout policy: только из `origin/main` после отдельного explicit approval.

## 2) Scope of evidence

Этот пакет агрегирует:
- последнюю test-валидацию deploy+smoke,
- e2e smoke coverage для web MVP (`login/join/send/voice/reconnect`),
- rollback owner/plan и команды,
- owner responsibilities при rollout/rollback.

## 3) Current technical evidence

### 3.1 Latest verified test rollout

- Branch: `origin/feature/web-header-profile-menu`
- Verified deploy SHA in test: `49abe56`
- Command:
  - `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/web-header-profile-menu npm run deploy:test:smoke'`
- Result:
  - `smoke:sso` — PASS
  - `smoke:realtime` — PASS
  - `reconnectOk=true`

### 3.2 Web E2E smoke coverage (roadmap block)

- Unified flow command:
  - `npm run smoke:web:e2e`
- Actual orchestrator:
  - `scripts/smoke-web-e2e.sh`
- Coverage included:
  - login redirect (`smoke:sso`),
  - room join + message send/receive (`smoke:realtime`),
  - voice connect/disconnect relay path (`SMOKE_CALL_SIGNAL=1`),
  - reconnect scenario (`SMOKE_RECONNECT=1`).

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
  - `bash ./scripts/examples/deploy-prod-from-ref.sh <known-good-ref> <repo-dir>`
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
