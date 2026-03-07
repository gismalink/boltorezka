# Merge-Ready Checklist (Boltorezka + Edge)

> Legacy status: dated snapshot (`2026-03-04`), not a current release checklist.

Дата: 2026-03-04  
Статус: Ready for merge workflow execution

## 1) Current references

### Boltorezka

- Feature branch: `feature/video-stream-overlay-chat-toggle`
- Latest feature SHA: `1f5f05f`
- Current open target for prod flow: `main` (merge required)

### Edge

- Branch: `main`
- Latest applied ingress SHA: `095b504`
- Note: edge изменения для Caddy-only уже в `main` и применены на server.

## 2) Merge order (required)

1. Merge Boltorezka feature branch into `main`.
2. Re-run test rollout from `origin/main` (same smoke gate).
3. Refresh pre-prod decision package with `main` SHA.
4. Keep decision status `NO-GO` until explicit prod approval fields are filled.

## 3) Boltorezka merge scope (must include)

- API static toggle (`API_SERVE_STATIC`) and API/static decoupling.
- Caddy-only static delivery flow (deploy scripts sync bundle into edge static dir).
- Test evidence updates (`STATUS`, `TEST_RESULTS`, `feature-log`, `PREPROD_DECISION_PACKAGE`).

## 4) Post-merge test validation (from main)

```bash
ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'
```

Expected gate:
- `smoke:sso` PASS
- `smoke:api` PASS
- `smoke:web:version-cache` PASS
- `smoke:realtime` PASS (`reconnectOk=true`)

## 5) Pre-prod package update after main test pass

Обновить в `docs/runbooks/PREPROD_DECISION_PACKAGE.md`:
- `Target main SHA`
- `Last test deploy SHA`
- owner/sign-off fields (`Release Owner`, `Rollback Owner`, `Rollback ref`)

## 6) No-go until explicit approval

Даже после merge+test PASS — только `NO-GO`, пока не заполнены sign-off поля и нет явного подтверждения на prod rollout.
