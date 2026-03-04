# Legacy `apps/api/public` Deprecation Plan

Цель: безопасно вывести из эксплуатации legacy static path в `apps/api/public`, не ломая текущий production/runtime flow, где API-контейнер раздаёт собранный React bundle из `public`.

## 1) Текущее состояние

- API использует `@fastify/static` и раздаёт содержимое `apps/api/public` (см. `apps/api/src/index.ts`).
- В image-build pipeline каталог `public` наполняется из `apps/web/dist` (см. `apps/api/Dockerfile`).
- Legacy POC-контент уже вынесен в `legacy/poc/`; в `apps/api/public` в репозитории фактически нет legacy файлов (только `.gitkeep`).

Вывод: технический риск не в «старых файлах в `public`», а в связанности API и static-хостинга в одном процессе.

## 2) Target state

- React web остаётся единственным UI path.
- API отвечает только за API/WS/auth/realtime.
- Static hosting веба выносится в отдельный delivery path (edge/CDN/ingress static), либо остаётся в API как временный fallback до отдельного решения.

## 3) Scope и non-goals

В scope:
- формализовать phased-cutover;
- зафиксировать критерии `GO/NO-GO`;
- подготовить откат без простоя.

Вне scope:
- мгновенный отказ от static serving в API в этом же инкременте;
- редизайн ingress/доменов.

## 4) Phased plan

### Phase A — Inventory & Guardrails (docs + checks)

1. Зафиксировать все точки, где предполагается static serving из API:
   - `apps/api/src/index.ts` (`fastifyStatic`),
   - `apps/api/Dockerfile` (`COPY --from=web-build /web/dist ./public`).
2. Добавить smoke-check на корректную отдачу `index.html` и web assets в test.
3. Зафиксировать ownership и rollback owner в pre-prod package.

Exit criteria:
- инвентаризация completed,
- smoke/checklist обновлены,
- rollback owner назначен.

### Phase B — Dual-path readiness (test)

1. Подготовить альтернативный static path (через edge/ingress или отдельный web-serving container).
2. В test включить dual-path проверку:
   - API-only route жив,
   - new static route жив,
   - auth/SSO/callback flow эквивалентен.
3. Прогнать `deploy:test:smoke` + web e2e smoke.

Exit criteria:
- обе схемы работают в test,
- нет regressions по SSO/WS/chat/voice.

### Phase C — Cutover (prod)

1. Явный `GO` из pre-prod package.
2. Переключение default static path на новую схему.
3. Усиленный мониторинг 30–60 минут:
   - `/health`,
   - `/v1/auth/mode`,
   - login/session completion,
   - ws-ticket + realtime connect.

Exit criteria:
- нет роста auth/realtime ошибок,
- core smoke проходит без ручных фиксов.

### Phase D — Decommission cleanup

1. Удалить/свернуть лишний runtime-coupling в API после стабилизации cutover.
2. Обновить docs/contracts/runbooks.
3. Зафиксировать release note с итоговым статусом deprecation.

#### Phase D execution update (2026-03-04)

- В API добавлен runtime toggle `API_SERVE_STATIC`:
   - `1` (default) — static serving из `apps/api/public` включён,
   - `0` — API не регистрирует static routes (`/` и `/__web/`).
- В host compose для server контуров установлен decommission-safe default:
   - `TEST_API_SERVE_STATIC=0`,
   - `PROD_API_SERVE_STATIC=0`.
- Локальная backward compatibility сохранена (без env переменной API по умолчанию продолжает раздавать static).

#### Phase D rehearsal evidence (2026-03-04)

- Rehearsal rollout в `test` на SHA `8eeed7b` показал ожидаемый эффект decoupling:
   - API/SSO/realtime smoke остаются PASS,
   - web version-cache smoke падает с `index fetch failed: 404` (static route через API отключён).
- Rollback rehearsal выполнен на SHA `b931324`:
   - полный `deploy:test:smoke` — PASS.

Вывод:
- rollback path validated;
- для финального закрытия deprecation требуется отдельный внешний static delivery path (не через API container) и smoke на этом пути.

## 5) Rollback plan

Rollback trigger:
- деградация SSO callback/session,
- массовые ошибки загрузки web assets,
- рост reconnect/auth errors после cutover.

Rollback action:
1. Вернуть предыдущий проверенный ref через штатный GitOps deploy script.
2. Прогнать postdeploy smoke (`health`, `auth mode`, `smoke:sso`, `smoke:api`, `smoke:realtime`).
3. Зафиксировать инцидент и решение в release log + feature log.

## 6) Test-first command template

```bash
ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/<branch> npm run deploy:test:smoke'
```

Для исключения (только по явному решению):

```bash
ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke'
```

## 7) Ownership

- Tech owner: backend/web platform owner.
- Ops owner: GitOps/deploy owner.
- Approval owner (prod): release approver из pre-prod decision package.

## 8) Immediate next tasks

1. Добавить explicit smoke-check для web static delivery contract.
2. Подготовить draft dual-path rollout в test.
3. После test evidence обновить `PREPROD_DECISION_PACKAGE.md`.
