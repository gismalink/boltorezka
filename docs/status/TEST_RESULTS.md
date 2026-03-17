# Boltorezka Test Results

Отдельный журнал результатов тестов/нагрузки.

## 2026-03-17 — Cycle #54 (Signing readiness fallback, windows-only Azure OIDC path)

- Environment: `GitHub Actions` (`desktop-artifacts` workflow, `feature/desktop-unsigned-mode`)
- Build refs:
  - `11c63df5a62efc7e7388eecad10e0374b2c25d40` (baseline before fixes)
  - `2d509ce5d98fffa74b86e9dfcf16696cced9dbce` (renderer build runner hardening)
  - `9560e39f7bcfa3f69e537e600843b9dbd531d877` (Windows dependency install fix)
  - `1b811cbaf05bc39303c305ee39f86844d96f8c56` (electron-builder runner hardening)

### Functional gate

- Signed RC dispatch chain: PARTIAL PASS (engineering blockers removed; operational secrets blocker remains)
  - input set:
    - `release_channel=test`
    - `signed=true`
    - `create_release_draft=false`
    - `signed_platforms=windows-only`
    - `windows_signing_provider=azure-oidc`
  - run evidence:
    - `https://github.com/gismalink/boltorezka/actions/runs/23208569072` (main baseline) -> FAIL in Windows signed build path (`Build Windows release candidate (Azure signing path)`)
    - `https://github.com/gismalink/boltorezka/actions/runs/23208784048` (`2d509ce`) -> FAIL on `npm ci` (`EBADPLATFORM dmg-license darwin-only`)
    - `https://github.com/gismalink/boltorezka/actions/runs/23208881830` (`9560e39`) -> FAIL in Windows signed build path after renderer build completed
    - `https://github.com/gismalink/boltorezka/actions/runs/23209017455` (`1b811cb`) -> Windows build+pack PASS, fail moved to Azure auth step

### Root cause evidence

- Fixed during this cycle:
  - Renderer build launcher under Windows shell path resolved via npm execpath (no silent spawn failure).
  - `dmg-license` moved to `optionalDependencies`, removing Windows `EBADPLATFORM` during `npm --prefix apps/desktop-electron ci`.
  - Electron-builder launcher under Windows shell path resolved via npm execpath (no silent npx spawn failure).
- Current blocker (operational readiness):
  - `Azure login (OIDC for Windows signing)` fails with missing Azure identifiers:
    - `Login failed with Error: Using auth-type: SERVICE_PRINCIPAL. Not all values are present. Ensure 'client-id' and 'tenant-id' are supplied.`

### Scope covered by this cycle

- Закрыты code-level Windows CI blockers signing pipeline: install/build/pack path для signed RC теперь проходит до Azure login.
- Подтверждено, что remaining blocker находится в secrets/config readiness, а не в desktop build code path.

### Decision

- Cycle #54: FAIL (expected operational blocker).
- Next action: заполнить `AZURE_TRUSTED_SIGNING_CLIENT_ID` и `AZURE_TRUSTED_SIGNING_TENANT_ID` (и связанные Trusted Signing secrets), затем повторить signed RC workflow для PASS evidence.

## 2026-03-16 — Cycle #53 (Server-first unsigned desktop publish, test channel)

- Environment: `test` (`https://test.boltorezka.gismalink.art`, mac-mini)
- Build ref: `origin/feature/desktop-unsigned-mode` (`24bf8fd72b2fd9ff52a7febabfd8b4bf7346a06d`)

### Functional gate

- Server-first desktop publish: PASS
  - `DESKTOP_CHANNEL=test DESKTOP_SIGNING_MODE=unsigned DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh HEAD "$PWD"`
  - script marker: `signing mode: unsigned`
  - electron-builder evidence: `skipped macOS application code signing ... CSC_IDENTITY_AUTO_DISCOVERY=false`
  - publish target: `/srv/edge/ingress/static/boltorezka/test/desktop/test/24bf8fd72b2fd9ff52a7febabfd8b4bf7346a06d`
  - channel manifest: `/srv/edge/ingress/static/boltorezka/test/desktop/test/latest.json`
  - mac updater feed: `/srv/edge/ingress/static/boltorezka/test/desktop/test/mac/latest-mac.yml`

### Scope covered by this cycle

- Внедрен и проверен управляемый `DESKTOP_SIGNING_MODE=unsigned` для временного test-only desktop distribution.
- Подтверждена публикация unsigned артефактов в test channel без блокировки на dev accounts/secrets.

### Decision

- Cycle #53: PASS.
- Временный unsigned path для `test` доступен; для `prod` по policy остается только trusted signing path.

## 2026-03-15 — Cycle #52 (Signed RC workflow dispatch on main, test channel)

- Environment: `GitHub Actions` (`desktop-artifacts` workflow)
- Build ref: `origin/main` (`de7d9c57661b267b51017b417d0c025bf20da9c6`)
- Run: `https://github.com/gismalink/boltorezka/actions/runs/23116286958`

### Functional gate

- Signed RC dispatch: STARTED
  - `gh workflow run desktop-artifacts.yml -f release_channel=test -f signed=true -f create_release_draft=false`
- Workflow result: FAIL
  - `build-macos-latest` -> FAIL (`Build signed desktop release candidate`)
  - `build-windows-latest` -> FAIL (`Build signed desktop release candidate`)
  - `github-release-chain` -> SKIPPED (upstream build failed)

### Root cause evidence

- Required signing env values were empty during run:
  - `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- macOS log contains explicit signing-path failure:
  - `empty password will be used for code signing  reason=CSC_KEY_PASSWORD is not defined`
  - `⨯ /Users/runner/work/boltorezka/boltorezka/apps/desktop-electron not a file`
- Repository secret inventory check did not return required desktop signing secrets:
  - `gh secret list --repo gismalink/boltorezka | rg "DESKTOP_(CSC_LINK|CSC_KEY_PASSWORD|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|WIN_CSC_LINK|WIN_CSC_KEY_PASSWORD)"` -> no matches.

### Scope covered by this cycle

- Подтверждено, что workflow dispatch и signed path wiring работают технически.
- Выявлен operational blocker readiness-гейта: отсутствует configured secrets set для signing/notarization.

### Decision

- Cycle #52: FAIL (expected blocker).
- Next action: заполнить required GitHub Secrets и повторить signed RC cycle для получения release-grade PASS evidence.

## 2026-03-15 — Cycle #51 (Controlled prod rollout from origin/main)

- Environment: `prod` (`https://boltorezka.gismalink.art`, mac-mini)
- Build ref: `origin/main` (`a19185a`)

### Functional gate

- Desktop publish for prod channel: PASS
  - `DESKTOP_CHANNEL=prod DESKTOP_PUBLIC_BASE_URL=https://boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/main "$PWD"`
  - `DESKTOP_BUILD_SHA=a19185a6f7e354f91a52608c4fa408964dca279c`
- Controlled prod deploy: PASS
  - `PROD_REF=origin/main npm run deploy:prod`
  - deploy marker: `DEPLOY_SHA=a19185a6f7e354f91a52608c4fa408964dca279c`
- Post-deploy checks: PASS
  - `GET /health` -> `200`, `api/db/redis=ok`, `appBuildSha=a19185a6f7e354f91a52608c4fa408964dca279c`
  - `GET /v1/auth/mode` -> `{"mode":"sso","ssoBaseUrl":"https://auth.gismalink.art"}`
  - `smoke:web:version-cache` on prod -> PASS
  - `smoke:desktop:update-feed` with `SMOKE_DESKTOP_CHANNEL=prod` -> PASS
  - `GET /desktop/prod/latest.json` -> JSON manifest (channel `prod`)
  - `GET /desktop/prod/mac/latest-mac.yml` -> valid updater YAML
  - `docker compose ps boltorezka-api-prod` -> `Up`

### Scope covered by this cycle

- Выполнен controlled prod rollout из default branch (`origin/main`) по GitOps policy.
- Подтверждена работоспособность desktop distribution/update endpoints в prod.

### Decision

- Cycle #51: PASS.
- Prod rollout выполнен и верифицирован; rollback ref зафиксирован: `104e33142039e82736d18d7f1e24e38af260e668`.

## 2026-03-15 — Cycle #50 (Post-merge main gate: full test deploy+smoke PASS)

- Environment: `test` (`https://test.boltorezka.gismalink.art`, mac-mini)
- Build ref: `origin/main` (`10b6fd5`)

### Functional gate

- Pre-step desktop publish from `main`: PASS
  - `DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/main "$PWD"`
  - published desktop SHA: `10b6fd5c5ff1b5005a68e8f4c125d7f8af8980c0`
- Full test rollout from `main`: PASS
  - `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 SMOKE_DESKTOP_UPDATE_FEED=1 SMOKE_DESKTOP_CHANNEL=test npm run deploy:test:smoke`
  - postdeploy gates PASS:
    - `smoke:sso`, `smoke:api`, `smoke:auth:session`, `smoke:auth:cookie-negative`, `smoke:auth:cookie-ws-ticket`
    - `smoke:web:version-cache` (`sha=10b6fd5c5ff1b5005a68e8f4c125d7f8af8980c0`)
    - `smoke:web:crash-boundary:browser`, `smoke:web:rnnoise:browser`
    - `smoke:desktop:update-feed`
    - `smoke:realtime`
- Server summary marker: PASS
  - `SMOKE_STATUS=pass`
  - `SMOKE_DESKTOP_UPDATE_FEED_STATUS=pass`
  - `SMOKE_SUMMARY_TEXT` contains `desktop_update_feed=pass`

### Scope covered by this cycle

- Закрыт обязательный post-merge test gate уже из `origin/main`.
- Подтверждена стабильность полного test rollout pipeline после merge M3 desktop workstream в default branch.

### Decision

- Cycle #50: PASS.
- `main` готов к дальнейшему pre-prod decision stage (prod rollout только по явному подтверждению).

## 2026-03-15 — Cycle #49 (Full test deploy+smoke with desktop update-feed gate)

- Environment: `test` (`https://test.boltorezka.gismalink.art`, mac-mini server flow)
- Build ref: `origin/feature/electron-desktop-foundation` (`2056029`)

### Functional gate

- Full rollout command: PASS
  - `ssh -t mac-mini 'cd ~/srv/boltorezka && SMOKE_DESKTOP_UPDATE_FEED=1 SMOKE_DESKTOP_CHANNEL=test ./scripts/deploy/deploy-test-and-smoke.sh origin/feature/electron-desktop-foundation "$PWD"'`
- Precondition to keep desktop feed alive during deploy: PASS
  - test static sync now preserves `desktop/` subtree under `~/srv/edge/ingress/static/boltorezka/test`
- Postdeploy smoke pack: PASS
  - `smoke:sso`, `smoke:api`, `smoke:auth:session`, `smoke:auth:cookie-negative`, `smoke:auth:cookie-ws-ticket`
  - `smoke:web:version-cache` (`sha=2056029789bbfdd5c955efc0e4e4187a7844d9cf`)
  - `smoke:web:crash-boundary:browser`
  - `smoke:web:rnnoise:browser`
  - `smoke:desktop:update-feed`
  - `smoke:realtime`
- Summary marker: PASS
  - `SMOKE_STATUS=pass`
  - `SMOKE_DESKTOP_UPDATE_FEED_STATUS=pass`
  - `SMOKE_SUMMARY_TEXT` contains `desktop_update_feed=pass`

### Scope covered by this cycle

- Подтверждено, что новый gate `desktop_update_feed` работает в полном `deploy-test-and-smoke` цикле, а не только в изолированном postdeploy запуске.
- Закрыт regression risk: web static sync больше не удаляет desktop distribution feed.

### Decision

- Cycle #49: PASS.
- Test rollout pipeline с desktop update-feed gate operationally green.

## 2026-03-15 — Cycle #48 (Postdeploy integration: desktop update-feed gate)

- Environment: `test` (`mac-mini`, postdeploy smoke)
- Build ref: `origin/feature/electron-desktop-foundation` (`8bcfc12`)

### Functional gate

- `postdeploy-smoke-test.sh` интегрирован с desktop update-feed проверкой:
  - добавлен шаг `smoke:desktop:update-feed`
  - добавлен summary field `SMOKE_DESKTOP_UPDATE_FEED_STATUS`
- Server run (fast mode) after sync to latest feature commit: PASS
  - `SMOKE_DESKTOP_UPDATE_FEED=1 SMOKE_DESKTOP_CHANNEL=test SMOKE_REALTIME=0 SMOKE_WEB_CRASH_BOUNDARY_BROWSER=0 SMOKE_WEB_RNNOISE_BROWSER=0 ./scripts/deploy/postdeploy-smoke-test.sh "$PWD"`
- Evidence from summary file: PASS
  - `SMOKE_DESKTOP_UPDATE_FEED_STATUS=pass`
  - `SMOKE_SUMMARY_TEXT` содержит `desktop_update_feed=pass`

### Scope covered by this cycle

- Desktop updater distribution contract включен в стандартный postdeploy smoke-пакет.
- Снижена вероятность регрессии, когда `/desktop/...` endpoints отдают SPA fallback или невалидный updater feed.

### Decision

- Cycle #48: PASS.
- Gate `desktop_update_feed` считается operationally wired into postdeploy checks.

## 2026-03-15 — Cycle #47 (Automated desktop updater feed smoke command)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`dfb343c`)

### Functional gate

- Added smoke command:
  - `smoke:desktop:update-feed` -> `node ./scripts/smoke/smoke-desktop-update-feed.mjs`
- Command run: PASS
  - `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:update-feed`
  - Output:
    - `[smoke:desktop:update-feed] ok base=https://test.boltorezka.gismalink.art channel=test sha=dfb343c7532ac6028f0e9cfdf57ed8a6c8a11f17 path=Boltorezka-0.2.0-arm64-mac.zip contentLength=101903233`

### Scope covered by this cycle

- Автоматизирована проверка desktop update distribution contract для test:
  - `/desktop/<channel>/latest.json`
  - `/desktop/<channel>/mac/latest-mac.yml`
  - `HEAD` на zip артефакт из YAML `path`.

### Decision

- Cycle #47: PASS.
- Проверка updater feed вынесена в reusable smoke command для post-deploy циклов.

## 2026-03-15 — Cycle #46 (Electron updater generic feed compatibility on test)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`dfb343c`)

### Functional gate

- Root-cause detected before fix:
  - `GET /desktop/test/mac/latest-mac.yml` returned SPA HTML, not updater metadata.
- Fix applied:
  - `scripts/deploy/build-desktop-server-and-publish.sh` now generates mac feed layer:
    - `.../desktop/test/mac/latest-mac.yml`
    - `.../desktop/test/mac/Boltorezka-0.2.0-arm64-mac.zip`
    - `.../desktop/test/mac/*.blockmap`
- Server run after fix: PASS
  - `ssh -t mac-mini 'cd ~/srv/boltorezka && DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/feature/electron-desktop-foundation "$PWD"'`
  - script output confirms `mac updater feed` path written.
- Public endpoint smoke: PASS
  - `HEAD https://test.boltorezka.gismalink.art/desktop/test/mac/latest-mac.yml` -> `200`, `content-length=353`
  - `GET https://test.boltorezka.gismalink.art/desktop/test/mac/latest-mac.yml` -> valid YAML (`version`, `path`, `sha512`, `releaseDate`)
  - `HEAD https://test.boltorezka.gismalink.art/desktop/test/mac/Boltorezka-0.2.0-arm64-mac.zip` -> `200`, `content-type=application/zip`, `content-length=101903233`

### Scope covered by this cycle

- Подтверждена совместимость test distribution с `electron-updater` generic provider для mac.
- Закрыт blocker, при котором update runtime получал SPA fallback вместо updater metadata.

### Decision

- Cycle #46: PASS.
- M3 update feed для `test/mac` operationally green.

## 2026-03-15 — Cycle #45 (Desktop downloads routing fix: public /desktop path)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`8640a76`)

### Functional gate

- Root-cause detected: previous desktop publish target was outside Caddy web-root for test env.
  - Symptom: `GET /desktop/test/latest.json` returned SPA `index.html`.
- Fix applied in script and deployed on server: PASS
  - publish target moved to env web-root path:
    - `~/srv/edge/ingress/static/boltorezka/test/desktop/test/<sha>/...`
    - `~/srv/edge/ingress/static/boltorezka/test/desktop/test/latest.json`
  - run command:
    - `ssh -t mac-mini 'cd ~/srv/boltorezka && DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/feature/electron-desktop-foundation "$PWD"'`
- Public endpoint smoke after fix: PASS
  - `GET https://test.boltorezka.gismalink.art/desktop/test/latest.json` returns JSON (`sha=8640a7651944aea76b921fadf9f887cee3e00557`, `totalFiles=99`)
  - `HEAD https://test.boltorezka.gismalink.art/desktop/test/8640a7651944aea76b921fadf9f887cee3e00557/Boltorezka-0.2.0-arm64.dmg` returns `200` with binary payload headers (`content-length=105422525`)

### Scope covered by this cycle

- Закрыт blocker на публичную раздачу desktop артефактов по ожидаемому URL `/desktop/<channel>/...`.
- Подтверждено, что server-first publish path совместим с текущим Caddy routing без дополнительных правок ingress.

### Decision

- Cycle #45: PASS.
- Test distribution path для desktop downloads operationally green.

## 2026-03-15 — Cycle #44 (Server-first desktop build/publish on mac-mini server)

- Environment: `test` (`mac-mini: ~/srv/boltorezka + ~/srv/edge`)
- Build ref: `origin/feature/electron-desktop-foundation` (`ae44a04`)

### Functional gate

- Server-first script run on server checkout: PASS
  - `ssh -t mac-mini 'cd ~/srv/boltorezka && DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/feature/electron-desktop-foundation "$PWD"'`
  - build/publish completed without script errors.
- Published channel manifest on server edge static: PASS
  - `~/srv/edge/ingress/static/boltorezka/desktop/test/latest.json`
  - `channel=test`, `sha=ae44a04ef9acbc00ffea1d944263276ec0c4e68d`, `totalFiles=99`
  - URLs point to `https://test.boltorezka.gismalink.art/desktop/test/<sha>/...`
- Deploy marker on server checkout: PASS
  - `~/srv/boltorezka/.deploy/last-desktop-build.env`
  - `DESKTOP_BUILD_SHA=ae44a04ef9acbc00ffea1d944263276ec0c4e68d`
  - `DESKTOP_BUILD_TARGET_DIR=~/srv/edge/ingress/static/boltorezka/desktop/test/ae44a04ef9acbc00ffea1d944263276ec0c4e68d`

### Scope covered by this cycle

- Подтверждена работоспособность server-first desktop build/publish в целевом server окружении (mac-mini), а не только локально.
- Подтверждено обновление channel pointer `latest.json` и generation build snapshot каталога `/desktop/test/<sha>/...` на сервере.

### Decision

- Cycle #44: PASS.
- Server-first desktop pipeline для `test` считается operationally verified.

## 2026-03-15 — Cycle #43 (Server-first desktop build/publish test channel)

- Environment: `local server-like run` (`edge static path on macOS workspace`)
- Build ref: `origin/feature/electron-desktop-foundation` (`a186160`)

### Functional gate

- Server-first script run (isolated clone): PASS
  - `DESKTOP_CHANNEL=test EDGE_REPO_DIR=/Users/davidshvartsman/Mamaiamcoder/edge DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh HEAD /tmp/boltorezka-desktop-build-test`
  - marker file created: `.deploy/last-desktop-build.env`
  - `DESKTOP_BUILD_SHA=a1861606e1d45f527050149f144bfa5189985a95`
  - `DESKTOP_BUILD_TARGET_DIR=/Users/davidshvartsman/Mamaiamcoder/edge/ingress/static/boltorezka/desktop/test/a1861606e1d45f527050149f144bfa5189985a95`
- Channel manifest generation: PASS
  - `latest.json` exists at `/Users/davidshvartsman/Mamaiamcoder/edge/ingress/static/boltorezka/desktop/test/latest.json`
  - `channel=test`, `sha=a1861606e1d45f527050149f144bfa5189985a95`, `totalFiles=99`
  - URLs generated with base `https://test.boltorezka.gismalink.art/desktop/test/<sha>/...`
- Artifact publication snapshot: PASS
  - Found published files including:
    - `Boltorezka-0.2.0-arm64.dmg`
    - `Boltorezka-0.2.0-arm64-mac.zip`
    - `manifest.json`
    - blockmap files

### Scope covered by this cycle

- Подтвержден end-to-end server-first path `build -> publish -> latest.json` для test канала.
- Подтверждена корректная структура static distribution каталога `/desktop/test/<sha>/...` и channel pointer через `latest.json`.

### Decision

- Cycle #43: PASS (server-first pipeline verified for test channel).
- Следующий шаг: выполнить аналогичный прогон на реальном серверном checkout (`~/srv/boltorezka`) и добавить smoke evidence установки/обновления desktop клиента.

## 2026-03-15 — Cycle #42 (Test rollout on 64f6b72 with full postdeploy PASS)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`64f6b72`)

### Functional gate

- Rollout: `ssh mac-mini 'cd ~/srv/boltorezka && ./scripts/deploy/deploy-test-and-smoke.sh origin/feature/electron-desktop-foundation "$PWD"'`: PARTIAL
  - deploy/rebuild: PASS
  - postdeploy: FAIL on first run (`smoke:auth:session` -> `fetch failed`)
- Retry postdeploy only:
  - `ssh mac-mini 'cd ~/srv/boltorezka && SMOKE_FETCH_RETRIES=8 SMOKE_FETCH_TIMEOUT_MS=20000 SMOKE_FETCH_RETRY_DELAY_MS=2500 SMOKE_REALTIME_RETRIES=4 SMOKE_REALTIME_RETRY_DELAY_MS=3000 ./scripts/deploy/postdeploy-smoke-test.sh "$PWD"'`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:auth:session`: PASS
  - `smoke:auth:cookie-negative`: PASS
  - `smoke:auth:cookie-ws-ticket`: PASS
  - `smoke:web:version-cache`: PASS (`sha=64f6b727eac6752db43134bb3311b4d86d102f40`)
  - `smoke:web:crash-boundary:browser`: PASS
  - `smoke:web:rnnoise:browser`: PASS
  - `smoke:realtime`: PASS (`reconnectOk=true`, `mediaTopologyFirstOk=true`, `mediaTopologySecondOk=true`)

### Scope covered by this cycle

- Подтвержден test rollout на SHA `64f6b72` с green postdeploy пакетом после transient сетевого сбоя первого прогона.
- Подтверждено, что retry-hardening в browser/realtime smoke path не ломает функциональные проверки и сохраняет expected coverage.

### Decision

- Cycle #42: PASS.
- Pre-merge test gate на актуальном SHA считается green (с учетом transient rerun evidence).

## 2026-03-15 — Cycle #41 (Postdeploy rerun flake migrated to RNNoise browser smoke)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`843c2df`)

### Functional gate

- Server postdeploy rerun:
  - `ssh mac-mini 'cd ~/srv/boltorezka && SMOKE_FETCH_RETRIES=8 SMOKE_FETCH_TIMEOUT_MS=20000 SMOKE_FETCH_RETRY_DELAY_MS=2500 SMOKE_REALTIME_RETRIES=4 SMOKE_REALTIME_RETRY_DELAY_MS=3000 ./scripts/deploy/postdeploy-smoke-test.sh'`: PARTIAL
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:auth:session`: PASS
  - `smoke:auth:cookie-negative`: PASS
  - `smoke:auth:cookie-ws-ticket`: PASS
  - `smoke:web:version-cache`: PASS (`sha=843c2dfc75708c4d9d2a977f2f0055c954341f70`)
  - `smoke:web:crash-boundary:browser`: PASS
  - `smoke:web:rnnoise:browser`: FAIL (`page.goto: net::ERR_CONNECTION_TIMED_OUT`)

### Scope covered by this cycle

- Подтверждено, что SSO/API/auth + version-cache + crash-boundary smoke остаются green в текущем test контуре.
- Зафиксирован сетевой флейк на RNNoise browser startup path; функциональная деградация RNNoise flow на уровне приложения не подтверждена.

### Decision

- Cycle #41: PARTIAL (transient network timeout in `smoke:web:rnnoise:browser`).
- Добавлен startup retry hardening в RNNoise smoke script; требуется повторный прогон после rollout нового SHA.

## 2026-03-15 — Cycle #40 (Postdeploy smoke stabilized after retry-hardening)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`a3b84ae` smoke scripts in server repo, app deploy SHA remains `030b0ec`)

### Functional gate

- Server postdeploy rerun:
  - `ssh mac-mini 'cd ~/srv/boltorezka && bash ./scripts/deploy/postdeploy-smoke-test.sh "$PWD"'`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:auth:session`: PASS
  - `smoke:auth:cookie-negative`: PASS
  - `smoke:auth:cookie-ws-ticket`: PASS
  - `smoke:web:version-cache`: PASS (`sha=030b0ecc032edb97a369b15df350560c3ab22d4e`)
  - `smoke:web:crash-boundary:browser`: PASS
  - `smoke:web:rnnoise:browser`: PASS
  - `smoke:realtime`: PASS (`reconnectOk=true`, `mediaTopologyFirstOk=true`)

### Scope covered by this cycle

- Подтверждена стабильность postdeploy smoke после hardening retry logic в `smoke:sso` и browser startup path (`smoke:web:crash-boundary:browser`).
- Cycle #39 закрыт повторным прогоном: внешний connectivity flake более не блокирует общий gate.

### Decision

- Cycle #40: PASS.
- Test gate восстановлен в green-state.

## 2026-03-15 — Cycle #39 (Observability counters rollout verification)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`030b0ec`)

### Functional gate

- Rollout: `ssh mac-mini 'cd ~/srv/boltorezka && bash ./scripts/deploy/deploy-test-and-smoke.sh origin/feature/electron-desktop-foundation "$PWD"'`: PARTIAL
  - deploy/rebuild: PASS
  - postdeploy: FAIL (`smoke:realtime` -> `connect ETIMEDOUT 95.165.154.118:443`)
- Retry postdeploy only: FAIL (тот же `ETIMEDOUT` на `smoke:realtime`)
- Internal API verification (from API container localhost):
  - `GET /v1/telemetry/summary` содержит новые поля
    - `telemetry_runtime_desktop/web/unknown`
    - `telemetry_desktop_platform_*`
    - `telemetry_desktop_electron_version_present`

### Scope covered by this cycle

- Подтверждено, что релиз `030b0ec` развернут в test и telemetry summary расширен новыми desktop observability counters.
- Выявлен внешний сетевой блокер текущего окружения/маршрута к test домену (`curl -I https://test.boltorezka.gismalink.art` -> timeout), влияющий на browser/electron smoke path.

### Decision

- Cycle #39: PARTIAL (observability counters verified, postdeploy realtime blocked by external `ETIMEDOUT`).
- Закрыт повторным прогоном (см. Cycle #40).

## 2026-03-15 — Cycle #38 (Forced app update path: version mismatch -> recovery)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`cbf851f`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:web:version-mismatch:browser`: PASS
  - `mode=mismatch`
  - `versionRequests=2`
  - `mismatchSha=smoke-mismatch-sha`

### Scope covered by this cycle

- Подтвержден forced update flow на version mismatch: клиент фиксирует расхождение build SHA и инициирует reload.
- Подтвержден recovery path: overlay "App updated" отображается, после `Continue` pending-флаг очищается и UI возвращается в рабочее состояние.

### Decision

- Cycle #38: PASS.
- Desktop checklist пункт `Forced app update path (version mismatch) и корректный recovery` закрыт.

## 2026-03-15 — Cycle #37 (Test rollout after desktop media-permission rollback)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`db34f4d`)

### Functional gate

- Rollout: `ssh mac-mini 'cd ~/srv/boltorezka && bash ./scripts/deploy/deploy-test-and-smoke.sh origin/feature/electron-desktop-foundation "$PWD"'`: PASS
- Post-deploy smoke pack: PASS
  - `smoke:sso`, `smoke:api`, `smoke:auth:session`, `smoke:auth:cookie-negative`, `smoke:auth:cookie-ws-ticket`
  - `smoke:web:version-cache` (`sha=db34f4d0da06bdd3a1c3f06eaebfada1cb277142`)
  - `smoke:web:crash-boundary:browser`, `smoke:web:rnnoise:browser`, `smoke:realtime`

### Scope covered by this cycle

- Подтвержден успешный test rollout после rollback агрессивных desktop permission handlers.
- Подтверждено восстановление desktop media path после перезапуска runtime: баннер доступа к устройствам исчез, устройства работают.
- Manual verification после rollout: screen share стартует, devices path работает.

### Decision

- Cycle #37: PASS.
- M2 practical blocker по `Screen share start/stop` снят на test в ручной проверке.

## 2026-03-14 — Cycle #36 (Desktop screenshare gate diagnostics)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`0e53086`)

### Functional gate

- `SMOKE_TEST_BEARER_TOKEN=<server smoke token> SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_ROOM_SLUG=general npm run smoke:desktop:screenshare`: SKIP
  - reason: screen share control remains disabled in desktop runtime (`secondary rtc-placeholder-btn`)

### Scope covered by this cycle

- Добавлен automation probe для screen share control path с диагностикой disabled-state.
- Подтвержден blocker для M2 `Screen share start/stop`: в текущем test контуре control недоступен, вероятно из-за `roomVoiceConnected=false`/room policy.

### Decision

- Cycle #36: SKIP (blocked).
- Требуется отдельная отладка RTC/session policy для включения screen share control.

## 2026-03-14 — Cycle #35 (Desktop media controls smoke)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`800b338`)

### Functional gate

- `SMOKE_TEST_BEARER_TOKEN=<server smoke token> SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:media-controls`: PASS
  - `micStateTransition=1 -> 0`
  - `audioStateTransition=0 -> 1`
  - `inputOptionsCount=7`
  - `outputOptionsCount=6`
  - `cameraOptionsCount=2`

### Scope covered by this cycle

- Подтвержден рабочий desktop path для media controls: mic/audio toggles и меню выбора input/output/camera устройств.
- Проверен authenticated desktop runtime через browser-first handoff + exchange в рамках smoke сценария.

### Decision

- Cycle #35: PASS.
- Подготовлен automation baseline для M2 пункта `Mute/unmute + input/output switch`.

## 2026-03-14 — Cycle #34 (Desktop build metadata propagation)

- Environment: `local build pipeline` (desktop package -> web renderer build)
- Build ref: `origin/feature/electron-desktop-foundation` (`1d7c504` during run)

### Functional gate

- `npm --prefix apps/desktop-electron run build:renderer`: PASS
  - `VITE_APP_VERSION=0.2.0`
  - `VITE_APP_BUILD_SHA=1d7c504`
  - `VITE_APP_BUILD_DATE=2026-03-14`

### Scope covered by this cycle

- Подтвержден единый build metadata path для desktop+renderer: desktop package version и build SHA синхронно попадают в web bundle при desktop build.

### Decision

- Cycle #34: PASS.
- Checklist `4.1 / version+build SHA` может быть закрыт.

## 2026-03-14 — Cycle #33 (Desktop handoff browser-level soak)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`dbe678a`)

### Functional gate

- `SMOKE_TEST_BEARER_TOKEN=<server smoke token> SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_HANDOFF_BROWSER_SOAK_CYCLES=20 npm run smoke:desktop:handoff:browser-soak`: PASS
  - `totalCycles=20`
  - `elapsedMs=29960`
  - Chromium: `7` cycles, stable user identity
  - WebKit: `7` cycles, stable user identity
  - Firefox: `6` cycles, stable user identity
  - state transition: `pending->completed` (все циклы)

### Scope covered by this cycle

- Закрыт browser-level soak follow-up для deterministic handoff протокола на трех движках (Chromium/WebKit/Firefox).
- Подтверждена воспроизводимость handoff flow без race на уровне browser fetch/polling path.

### Decision

- Cycle #33: PASS.
- Handoff deterministic follow-up закрыт.

## 2026-03-14 — Cycle #32 (Desktop handoff soak 20 cycles)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`dbe678a`)

### Functional gate

- `SMOKE_TEST_BEARER_TOKEN=<server smoke token> SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_HANDOFF_SOAK_CYCLES=20 npm run smoke:desktop:handoff:soak`: PASS
  - `cycles=20`
  - `elapsedMs=15003`
  - `stateTransition=pending->completed` (все циклы)
  - `userId` стабилен во всех циклах

### Scope covered by this cycle

- Подтверждена стабильность deterministic handoff protocol под последовательной нагрузкой (20 циклов create/exchange/complete/status).
- Race-condition класса "attempt state drift" в текущем test контуре не воспроизведен.

### Decision

- Cycle #32: PASS.
- Soak-evidence для handoff протокола зафиксирован.

## 2026-03-14 — Cycle #31 (Desktop voice checkpoint 15m after deterministic handoff)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`dbe678a`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:voice-checkpoint:15m`: PASS
  - `elapsedMs=900001`
  - `probes=90`
  - `maxProbeGapMs=10012`
  - `maxVoiceCounters={"meterSessions":1,"meterStreams":1,"meterAudioContexts":1}`

### Scope covered by this cycle

- Закрыт формальный 15-minute voice checkpoint gate для desktop M2 acceptance на test.
- Подтверждено, что после deterministic handoff rollout voice diagnostics остаются стабильными в 15-минутном окне.

### Decision

- Cycle #31: PASS.
- Continuation checkpoint по voice 15m закрыт.

## 2026-03-14 — Cycle #30 (Deterministic handoff smoke on test rollout)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`dbe678a`)

### Functional gate

- Rollout: `ssh mac-mini 'cd ~/srv/boltorezka && TEST_REF=origin/feature/electron-desktop-foundation npm run deploy:test:smoke'`: PASS
- Deterministic handoff smoke:
  - `SMOKE_TEST_BEARER_TOKEN=<server smoke token> SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:handoff-deterministic`: PASS
  - `attemptStatusBeforeComplete=pending`
  - `attemptStatusAfterComplete=completed`
  - `timeoutPathStatus=expired`

### Scope covered by this cycle

- Подтверждена работоспособность `attempt/status/complete` протокола после реального test rollout.
- Подтверждено отсутствие регрессии в базовом postdeploy smoke наборе test-контура.

### Decision

- Cycle #30: PASS.
- Deterministic handoff Phase 2 automation/evidence закрыт.

## 2026-03-14 — Cycle #29 (Deterministic handoff phase 1 regression check)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-phase1 deterministic handoff)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:sso-external`: PASS
  - `ssoStartExternalized=true`
  - `ssoLogoutMode=local-desktop`

### Scope covered by this cycle

- Подтверждено, что переход на deterministic handoff phase 1 не ломает desktop SSO start/logout регрессии.
- Актуализирован baseline: logout в desktop остается локальным (без external logout redirect).

### Decision

- Cycle #29: PASS.
- Можно переходить к Phase 2: отдельный deterministic handoff smoke (happy path + timeout path).

## 2026-03-14 — Cycle #28 (Desktop manual RTC checkpoint after multi-client fix)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`c745f06`)

### Functional gate

- Manual desktop/web verification after RTC multi-client stabilization rollout:
  - Соединение устанавливается и держится в desktop runtime.
  - Аудио (в т.ч. наушники) и камера работают при unfocused/minimized Electron window.
  - После sleep видео-соединение кратковременно разрывается и корректно восстанавливается после wake.

### Scope covered by this cycle

- Подтверждена практическая работоспособность ключевого M2 сценария реального использования (desktop не в фокусе + sleep/wake recovery) на test.
- Подтверждено, что последние фиксы reconnect/state не ломают media path в ручном checkpoint.

### Decision

- Cycle #28: PASS (manual checkpoint).
- Остается формальный 15-minute voice automation checkpoint как отдельный evidence gate.

## 2026-03-13 — Cycle #27 (Desktop SSO externalization gate)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`ec19740`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:sso-external`: PASS
  - `ssoStartExternalized=true`
  - `ssoLogoutExternalized=true`

### Scope covered by this cycle

- Добавлен и подтвержден regression gate на desktop SSO externalization,
- Зафиксировано, что auth start/logout flow не остается внутри app window.

### Decision

- Cycle #27: PASS.
- Desktop SSO externalization behavior закреплен автоматическим smoke.

## 2026-03-13 — Cycle #26 (Desktop 30-minute stability soak)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`87584d2`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_STABILITY_DURATION_MS=1800000 SMOKE_DESKTOP_STABILITY_PROBE_INTERVAL_MS=30000 npm run smoke:desktop:stability`: PASS
  - `durationMs=1800000`
  - `elapsedMs=1800001`
  - `probes=60`
  - `maxProbeGapMs=30008`

### Scope covered by this cycle

- Подтвержден 30-минутный desktop runtime stability soak в test-контуре,
- Сформирован evidence слой для M2 long-session runtime stability automation.

### Decision

- Cycle #26: PASS.
- Runtime stability gate на 30 минут подтвержден; voice-session specific 30m gate остается отдельным ручным checkpoint.

## 2026-03-13 — Cycle #25 (Desktop stability soak warm-up)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`ff432d9`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_STABILITY_DURATION_MS=30000 SMOKE_DESKTOP_STABILITY_PROBE_INTERVAL_MS=10000 npm run smoke:desktop:stability`: PASS
  - `durationMs=30000`
  - `elapsedMs=30002`
  - `probes=3`
  - `maxProbeGapMs=10005`

### Scope covered by this cycle

- Подтверждена рабочая автоматизация long-session stability smoke,
- Зафиксирован warm-up evidence перед отдельным 30+ минут evidence run.

### Decision

- Cycle #25: PASS.
- Stability automation готов к 30m evidence прогону.

## 2026-03-13 — Cycle #24 (Desktop sleep/wake strict evidence)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`ff432d9`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SLEEP_WAKE_WINDOW_MS=90000 SMOKE_DESKTOP_SLEEP_WAKE_SUSPEND_THRESHOLD_MS=2000 SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1 SMOKE_DESKTOP_SLEEP_WAKE_ALLOW_MANUAL_WINDOW_CONFIRM=1 SMOKE_DESKTOP_SLEEP_WAKE_MANUAL_WINDOW_OK=1 npm run smoke:desktop:sleep-wake`: PASS
  - `elapsedMs=90157`
  - `maxGapMs=28610`
  - `suspendObserved=true`
  - `requireSuspend=true`
  - `windowRecoveryMode=manual-confirmed`
  - `platform=darwin`
  - `electronVersion=35.7.5`

### Scope covered by this cycle

- Закрыт sleep/wake evidence-grade checkpoint для desktop M2,
- Подтверждено восстановление desktop runtime после сна на test, с явной manual-confirm отметкой recovery mode.

### Decision

- Cycle #24: PASS.
- Sleep/wake пункт в desktop smoke checklist может быть закрыт.

## 2026-03-13 — Cycle #23 (Desktop sleep/wake assist automation)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`accc79c`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SLEEP_WAKE_WINDOW_MS=10000 npm run smoke:desktop:sleep-wake`: PASS
  - `elapsedMs=10002`
  - `suspendObserved=false`
  - `requireSuspend=false`
  - runtime markers after reload: `runtime=desktop`, `platform=darwin`, `electronVersion=35.7.5`

### Scope covered by this cycle

- Проверена техническая готовность sleep/wake assist smoke (launch/wait/reload/runtime validation),
- Подготовлен путь к evidence-grade прогону в strict режиме (`SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1`).

### Decision

- Cycle #23: PASS (assist automation).
- Strict suspend evidence run остается pending и должен быть выполнен на реальном sleep/wake сценарии.

## 2026-03-13 — Cycle #22 (Desktop diagnostics artifact + full secure chain)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`3b6fa30`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:diagnostics`: PASS
  - diagnostics artifact generated
  - `platform=darwin`
  - `electronVersion=35.7.5`
  - `webPreferences`: `contextIsolation=true`, `sandbox=true`, `nodeIntegration=false`
- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=2 npm run desktop:smoke:m2:secure:diag`: PASS

### Scope covered by this cycle

- Добавлен automated diagnostics artifact smoke для desktop runtime/security snapshot,
- Подтверждена единая chain-команда `desktop:smoke:m2:secure:diag` как расширенный M2 regression gate.

### Decision

- Cycle #22: PASS.
- Desktop observability baseline усилен runtime diagnostics artifact проверкой.

## 2026-03-13 — Cycle #21 (Desktop security baseline + secure chain)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`78955dd`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:security`: PASS
  - contextIsolation: `true`
  - sandbox: `true`
  - nodeIntegration: `false`
  - webSecurity: `true`
  - preload bridge keys: `platform,version`
  - popupBlocked: `true`
- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=2 npm run desktop:smoke:m2:secure`: PASS

### Scope covered by this cycle

- Добавлен и валидирован desktop security smoke (webPreferences + renderer isolation + bridge allowlist),
- Подтвержден агрегированный `desktop:smoke:m2:secure` command для M2 regression на feature/test.

### Decision

- Cycle #21: PASS.
- Security smoke может использоваться как обязательный desktop pre-merge gate вместе с M2 chain.

## 2026-03-13 — Cycle #20 (Desktop M2 plus soak chain)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`46b8f4d`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=3 npm run desktop:smoke:m2:soak`: PASS
  - `desktop:smoke`: PASS
  - `smoke:desktop:runtime`: PASS
  - `smoke:desktop:reconnect`: PASS
  - `smoke:desktop:telemetry`: PASS
  - `smoke:desktop:soak`: PASS (`cycles=3`)

### Scope covered by this cycle

- Подтвержден единый end-to-end M2 automation command с интегрированным reconnect soak gate,
- Снижен операционный риск ручного запуска нескольких desktop smoke команд по отдельности.

### Decision

- Cycle #20: PASS.
- `desktop:smoke:m2:soak` можно использовать как основной M2 regression command на feature/test этапах.

## 2026-03-13 — Cycle #19 (Desktop reconnect soak automation)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (working tree, post-`a6f232d`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_DESKTOP_SOAK_CYCLES=4 npm run smoke:desktop:soak`: PASS
  - runtime: `desktop`
  - platform: `darwin`
  - electronVersion: `35.7.5`
  - reconnect cycles: `4/4`

### Scope covered by this cycle

- Добавлен repeatable soak smoke для desktop reconnect stability (многократный network flap в одном Electron run),
- Сформирован automation evidence слой между single reconnect smoke и долгим ручным soak.

### Decision

- Cycle #19: PASS.
- M2 stability automation расширен новым `smoke:desktop:soak` gate.

## 2026-03-13 — Cycle #18 (Rolling SLO gate evidence)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Contour: server-side scheduler job (`~/srv/boltorezka/scripts/ops/scheduler/run-job.sh slo-rolling-gate`)

### Functional gate

- `slo-rolling-gate`: PASS
  - `SLO_ROLLING_STATUS=pass`
  - `SLO_ROLLING_ALERT_COUNT=0`
  - `SLO_ROLLING_TS=2026-03-13T17:52:39.405Z`

### Scope covered by this cycle

- Подтвержден актуальный rolling SLO baseline gate для auth/reconnect на test,
- Снят оставшийся блокер по `SLO/baseline` для desktop prod-readiness dependency chain.

### Decision

- Cycle #18: PASS.
- SLO gate evidence добавлен в cookie/session и desktop plan документы.

## 2026-03-13 — Cycle #17 (Electron M2 telemetry stabilization)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/electron-desktop-foundation` (`704b7df`)

### Functional gate

- `SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art npm run smoke:desktop:telemetry`: PASS
  - runtime: `desktop`
  - platform: `darwin`
  - electronVersion: `35.7.5`
- `npm run desktop:smoke:m2`: PASS
  - `desktop:smoke` (foundation build): PASS
  - `smoke:desktop:runtime`: PASS
  - `smoke:desktop:reconnect`: PASS
  - `smoke:desktop:telemetry`: PASS

### Scope covered by this cycle

- Закрыта стабилизация desktop telemetry smoke на test contour,
- Подтверждён полный M2 smoke-цикл (foundation/runtime/reconnect/telemetry),
- Runtime telemetry labels (`runtime/platform/electronVersion`) подтверждены в desktop execution path.

### Decision

- Cycle #17: PASS.
- M2 automation slice готов к следующему этапу (sleep/wake evidence и дальнейшие desktop hardening шаги).

## 2026-03-04 — Cycle #16 (RTC row/camera hotfix local smoke)

- Environment: local web preview (`http://127.0.0.1:4173`)
- Build ref: working tree (post-merge fixes)

### Functional gate

- `npm --prefix apps/web run build`: PASS
- `npm run smoke:web:e2e`: FAIL (no `SMOKE_BEARER_TOKEN` / `SMOKE_WS_TICKET`, auto-ticket path unavailable в локальном окружении)
- `SMOKE_WEB_BASE_URL=http://127.0.0.1:4173 npm run smoke:web:denied-media:browser`: PASS
  - denied banner visible,
  - request media access CTA visible.
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<token> npm run smoke:web:e2e`: FAIL (`[smoke:realtime] timeout: ack for call.offer`).
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<token> SMOKE_E2E_CALL_SIGNAL=0 SMOKE_E2E_RECONNECT=0 npm run smoke:web:e2e`: PASS.
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_BEARER_TOKEN=<token> SMOKE_CALL_SIGNAL=1 SMOKE_RECONNECT=0 npm run smoke:realtime`: FAIL-fast с явной причиной (`second ticket from another user required`).

### Root cause + fix

- Root cause: call-signal smoke запускался с двумя ws-ticket одного и того же userId; для non-text channels второй join эвиктит первый socket (`ChannelSessionMoved`), из-за чего `call.offer` ack не мог стабильно пройти.
- Fix: `scripts/smoke-web-e2e.sh` обновлён — auto-ticket path генерирует `SMOKE_WS_TICKET_SECOND` из другого пользователя (`SMOKE_USER_EMAIL_SECOND` или автоматически `email <> SMOKE_USER_EMAIL`).
- Guardrail: `scripts/smoke-realtime.mjs` теперь валит сценарий call-signal сразу с понятной ошибкой при same-user pair вместо timeout.

### Scope covered by this cycle

- Исправлен RTC/video sender baseline для peer-соединений (fix кейса «не видят камеры друг друга»),
- Упрощён RTC badge в списке участников до `rtc` с state-based styling (transparent / blinking / connected),
- Восстановлена цветовая семантика текущего пользователя (default orange, speaking blue как у остальных).

### Decision

- Cycle #16: PARTIAL PASS.
- Full-default `smoke:web:e2e` остаётся нестабильным в call-signal stage (`call.offer` ack timeout).

## 2026-03-04 — Cycle #15 (origin/main rollout validation)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/main` (`29ad7be`)
- Ingress ref: `edge/main` (`095b504`)

### Functional gate

- `TEST_REF=origin/main ALLOW_TEST_FROM_MAIN=1 npm run deploy:test:smoke`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Проверен full test rollout уже от `main` после merge feature-пакета,
- Caddy-only static delivery mode остаётся стабильным на main.

### Decision

- Cycle #15: PASS.
- `main` готов к следующему pre-prod sign-off этапу (без prod rollout до explicit approval).

## 2026-03-04 — Cycle #14 (full test deploy after preprod refresh)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`94c8d0e`)
- Ingress ref: `edge/main` (`095b504`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Full test rollout подтверждён на актуальном SHA после обновления pre-prod пакета,
- Caddy-only static delivery и API split routing остаются стабильными.

### Decision

- Cycle #14: PASS.
- Test contour ready for next pre-prod sign-off review stage.

## 2026-03-04 — Cycle #13 (Caddy-only static serving migration)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`7f319e9`)
- Ingress ref: `edge/main` (`095b504`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Удалён внутренний nginx слой для web static serving,
- static bundle синхронизируется в edge Caddy static directory,
- web/API split routing и cache policy валидированы на test.

### Decision

- Cycle #13: PASS.
- Caddy-only static serving подтверждён в test.

## 2026-03-04 — Cycle #12 (external static path rollout, decoupled API/web)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`2906b08`)
- Ingress ref: `edge/main` (`91db6c8`, split web/api routing)

### Functional gate

- `npm run smoke:test:postdeploy`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Test contour switched to external static delivery path (`web-default`),
- API static serving kept disabled (`API_SERVE_STATIC=0`) without regression in postdeploy gate.

### Decision

- Cycle #12: PASS.
- Legacy deprecation Phase D finalized for test contour.

## 2026-03-04 — Cycle #11 (browser-level denied-media headless E2E)

- Environment: local web (`http://localhost:5173`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (working tree)

### Functional gate

- `SMOKE_WEB_BASE_URL=http://localhost:5173 npm run smoke:web:denied-media:browser`: PASS
  - denied banner visible,
  - request media access CTA visible.

### Scope covered by this cycle

- Browser-level headless validation of denied-media UX path (runtime DOM, not source-only check).

### Decision

- Cycle #11: PASS.
- Roadmap пункт `Browser-level E2E: denied media permissions UX` переведён в completed.

## 2026-03-04 — Cycle #10 (audio input devicechange auto-update)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`b931324`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `health`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- Runtime auto-refresh outgoing audio track on system `devicechange` during active call,
- explicit call-log visibility for auto-update success/failure.

### Decision

- Cycle #10: PASS.
- Roadmap пункт по system devicechange handling для input device переведён в completed.

## 2026-03-04 — Cycle #9 (version-cache gate + dual-path readiness)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`edb033f`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `health`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:web:version-cache`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Dual-path validation (separate static path)

- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art/__web npm run smoke:web:static` — PASS.
- `SMOKE_API_URL=https://test.boltorezka.gismalink.art SMOKE_WEB_BASE_URL=https://test.boltorezka.gismalink.art/__web SMOKE_EXPECT_BUILD_SHA=edb033fa61aaeb71df24f78d3055b8c3f1c49f1d npm run smoke:web:version-cache` — PASS.

### Scope covered by this cycle

- build-version compatibility gate (`/version` + client auto-reload),
- anti-cache policy (`index.html` no-store, hash-assets immutable),
- separate static delivery path readiness in test (`/__web/`).

### Decision

- Cycle #9: PASS.
- Roadmap пункт `deprecation dry-run (dual-path readiness + rollback rehearsal)` переведён в completed.

## 2026-03-04 — Cycle #8 (feature video runtime/control increments)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/video-stream-overlay-chat-toggle` (`1c40a14`)

### Functional gate

- `TEST_REF=origin/feature/video-stream-overlay-chat-toggle npm run deploy:test:smoke`: PASS
  - `health`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Scope covered by this cycle

- sender-side video effects runtime (`none` / `8-bit` / `ASCII`),
- owner preview and conditional server settings,
- ASCII controls (cell size, contrast, color),
- video windows drag/resize UX and server min/max resize bounds,
- compact server video slider layout.

### Decision

- Cycle #8: PASS.
- Изменения готовы к дальнейшему test-first циклу и накоплению pre-prod evidence.

## 2026-03-02 — Cycle #1 (MVP gate + API load P1)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/tailwind-user-dock` (`50f89b3`)

### Functional gate

- `server-quick-check`: PASS
- `npm run smoke:test:postdeploy`: PASS
  - `smoke:sso`: PASS
  - `smoke:api`: PASS
  - `smoke:realtime`: PASS (`reconnectOk=true`)

### API load P1 (20 rps, 5 min)

- `GET /health`
  - avg: `146.43 ms`
  - p50: `106 ms`
  - p97.5: `642 ms`
  - p99: `1027 ms`
  - max: `1608 ms`
  - requests: `6k`

- `GET /v1/auth/mode`
  - avg: `100.54 ms`
  - p50: `90 ms`
  - p97.5: `281 ms`
  - p99: `350 ms`
  - max: `792 ms`
  - requests: `6k`

### Post-load checks

- API logs (`--tail=300`, grep `error|fatal|exception|panic`): no critical matches.

### Decision

- Cycle #1: PASS
- Next step: run P2 (`60 rps, 10 min`) + W1 (`100 concurrent WS, 10 min`) and capture TURN/api traffic deltas.

## 2026-03-02 — Cycle #2 (P2 + WS capacity probe)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/tailwind-user-dock` (`50f89b3`)

### API load P2 (60 connections, pipelining 10, 10 min)

- `GET /health`
  - avg: `185.48 ms`
  - p50: `130 ms`
  - p97.5: `599 ms`
  - p99: `758 ms`
  - max: `9993 ms`
  - requests: `1,929,350`
  - errors: `130` (`timeouts`)

### Realtime WS load

- W1 (`100 clients`, `10 min`):
  - connected: `100/100` (failures `0`)
  - sent: `8,252`
  - ack: `4,265`
  - nack: `4,087`
  - errors: `99`

- W2 probe (`200 clients`, `5 min`):
  - connected: `200/200` (failures `0`)
  - sent: `9,460`
  - ack: `4,949`
  - nack: `4,711`
  - errors: `199`

- Diagnostic rerun (`100 clients`, `2 min`, with code breakdown):
  - `nackCodes`: `NoActiveRoom=914`
  - `errorCodes`: `ChannelSessionMoved=99`
  - note: this probe used one JWT subject for all clients, so nack/error are dominated by session semantics (not socket-connect limit).

### Traffic and TURN observations

- Container net counters (baseline -> post):
  - `boltorezka-api-test`: `5.33MB / 7.25MB` -> `841MB / 1.11GB`
  - approx delta: `+835.7MB` recv, `+1.10GB` sent.

- `boltorezka-turn` net counters: `3.4GB / 2.71GB` -> `3.4GB / 2.71GB` (no measurable change).
- TURN socket sample (`ss -uan`, `ss -tan` inside container): `0 / 0` before, during and after these runs.

### Decision

- P2 API: PASS with low timeout share (`130 / 1,929,350` ~= `0.0067%`).
- Realtime gateway accepts at least `200` concurrent WS connections in this scenario.
- Current WS chat load probe is constrained by single-user session behavior; a multi-user token set is required for clean per-user chat throughput ceiling.
- TURN capacity was not exercised (no media relay allocations in these runs).

## 2026-03-02 — Cycle #3 (clean multi-user WS capacity)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/tailwind-user-dock` (`50f89b3`)

### Setup

- Seeded synthetic test users in `test` DB: `300` (`wsload_...@example.test`).
- `ws-load` updated to support token pool (`SMOKE_BEARER_TOKENS`) and round-robin assignment per client.

### Realtime WS load (unique users)

- W3 (`100 clients`, `5 min`, unique user tokens):
  - connected: `100/100` (failures `0`)
  - sent: `4,320`
  - ack: `4,420`
  - nack: `0`
  - errors: `0`
  - chatMessages: `211,972`

- W4 (`200 clients`, `5 min`, unique user tokens):
  - connected: `200/200` (failures `0`)
  - sent: `10,282`
  - ack: `10,436`
  - nack: `0`
  - errors: `0`
  - chatMessages: `948,713`

### Traffic and TURN observations (W4 window)

- Container net counters (baseline -> post):
  - `boltorezka-api-test`: `867MB / 1.26GB` -> `942MB / 2.03GB`
  - approx delta: `+75MB` recv, `+770MB` sent.

- `boltorezka-turn` net counters: no measurable change.
- TURN socket sample (`ss -uan`, `ss -tan`): `0 / 0` before and after.

### Decision

- Clean chat/realtime capacity (without single-session collisions) is confirmed at `200` concurrent active WS users on current test stack.
- TURN relay capacity remains unvalidated by these runs (media relay was not generated).

## 2026-03-03 — Cycle #4 (TURN relay allocation stress, test)

- Environment: `test` (`boltorezka-turn`)
- TURN config under test: relay UDP/TCP range `30000-30100` (101 ports)

### Method

- Tool: `turnutils_uclient` inside TURN container.
- Auth: production-like long-term TURN credentials from `infra/.env.host`.
- Peer mode: external peer `8.8.8.8` (loopback peer is rejected by TURN policy with `403 Forbidden IP`).

### Baseline after TURN restart

- Socket baseline (`/proc/net/*`): `udp_lines=17`, `tcp_lines=17`.

### Stable run (under limit)

- Scenario: `m=20`, `timeout 90`, `-c -e 8.8.8.8`.
- Result: PASS (run held until timeout, no `508`).
- Mid-run sockets: `udp_lines=61`, `tcp_lines=17` (delta `+44` UDP sockets vs baseline).

### Over-limit run

- Scenario: `m=50`, same flags, clean restart before run.
- Result: FAIL as expected with `error 508 (Cannot create socket)` and exit code `255`.

### Decision

- TURN relay capacity is now empirically exercised.
- Practical ceiling for this test profile is reached between `20` and `50` concurrent TURN clients (with this `uclient` mode allocating ~2+ relay sockets per client).
- With relay range size `101`, practical planning value is `~45-50` simultaneously relay-active clients for this profile; above that, expect `508` allocation failures.
- For target `~100 TURN sockets`: current config is consistent with roughly `~50` simultaneously relay-active participants in 1-allocation-per-media-stream pair patterns.
- Network `docker stats` NetIO for this cycle is not representative (client and TURN ran in same container namespace via localhost path).

## 2026-03-03 — Cycle #5 (TURN range 30000-31000 + large run + parallel telemetry)

- Environment: `test` (`boltorezka-turn`)
- TURN recreated with expanded range override: `TURN_MIN_PORT=30000`, `TURN_MAX_PORT=31000`.
- Port publish verification: `30000-31000/tcp` and `30000-31000/udp` are active on host.

### Large TURN run #1

- Scenario: `turnutils_uclient ... -m 300 -c -e 8.8.8.8 -r 3480` with `timeout 180`.
- Result: PASS (process ended by timeout, no `508`, no `Forbidden`).

### Large TURN run #2 (stress above #1)

- Scenario: `turnutils_uclient ... -m 500 -c -e 8.8.8.8 -r 3480` with `timeout 120`.
- Result: reached allocation limit (`error 508 (Cannot create socket)` observed).

### Parallel system telemetry (during large runs)

- TURN sockets (`/proc/net`):
  - baseline after recreate: `udp=17`, `tcp=17`
  - peak during run: `udp=917`, `tcp=17`
  - stable elevated plateau observed: `udp≈704`, `tcp=17`

- Container load snapshot (peak observed):
  - `boltorezka-turn`: CPU up to `18.63%`, RSS up to `63.7MiB`
  - `boltorezka-api-test`: near baseline (`~0.1-0.3% CPU`, `~92MiB` RSS)
  - `boltorezka-db-test` / `redis-test`: low/steady background load.

- Notes on network counters:
  - `docker stats` NetIO for TURN changed minimally in this harness because generator ran in container namespace and traffic path is mostly local.

### Decision

- Expanding relay range from `101` to `1001` ports significantly raised practical TURN headroom.
- Confirmed safe operating point at least `m=300` for this test profile.
- `m=500` already hits socket creation failures, so practical planning zone is below this level.
- For operations planning: start with conservative cap `~300` relay-active clients for this profile and treat `500` as over-limit until finer sweep confirms exact threshold.

## 2026-03-03 — Cycle #6 (combined concurrent load: TURN + WS + API)

- Environment: `test`
- Scenario (simultaneous):
  - `200 WS clients`
  - `200 TURN relay allocations`
  - `60 rps API`

### TURN media profile (Opus-like target)

- Tool profile: `turnutils_uclient -m 200 -n 10000 -l 100 -z 20 -c -e 8.8.8.8 -r 3480`.
- Approx payload bitrate per flow: `100 bytes / 20 ms` ~= `40 kbps` (within requested `32-48 kbps` band).
- Approx aggregate payload target for 200 flows: `~8 Mbps`.

### Component results

- TURN run (`timeout 180`): PASS by timeout (`exit 124` expected), `error 508=0`, `Forbidden=0`.
- WS run (`200 unique users`, `180s`):
  - connected: `200/200` (failures `0`)
  - sent: `19,116`
  - ack: `19,164`
  - nack: `0`
  - errors: `0`
- API run (`autocannon -R 60 -d 180`):
  - total requests: `10,693` (`200` only)
  - avg latency: `106.43 ms`
  - p50: `82 ms`, p97.5: `402 ms`, p99: `543 ms`

### Parallel telemetry (same window)

- TURN sockets (`/proc/net`):
  - baseline: `udp=17`, `tcp=17`
  - during load plateau: `udp=264`, `tcp=64`
  - post-run before reset: `udp=217`, `tcp=17`
  - after reset: `udp=17`, `tcp=17`

- Container CPU/RSS peaks observed:
  - `boltorezka-turn`: CPU up to `0.72%` in sampled window, RSS up to `27.26MiB`
  - `boltorezka-api-test`: CPU up to `25.56%`, RSS up to `141.1MiB`
  - `boltorezka-db-test`: CPU up to `4.24%`
  - `boltorezka-redis-test`: CPU up to `1.99%`

- NetIO deltas (sample window):
  - `boltorezka-api-test`: from `~1.01GB/2.60GB` to `~1.07GB/3.03GB` (approx `+60MB` rx, `+430MB` tx)
  - `boltorezka-turn`: minor change (`~260kB/236kB` -> `~278kB/254kB`) due local-generator harness path.

### Decision

- Combined target scenario is sustainable in test under current config.
- API is the dominant resource consumer in this mixed run; TURN remained low CPU in sampled interval.
- TURN socket behavior remained stable for `200` allocations with this profile and returned to baseline after restart.

## 2026-03-03 — Cycle #7 (10-minute combined run, same profile)

- Environment: `test`
- Simultaneous scenario (10 minutes):
  - `200 WS clients` (`WS_LOAD_DURATION_SEC=600`)
  - `200 TURN allocations` (`timeout 600`)
  - `60 rps API` (10 x 60s windows)

### TURN profile (Opus-like target)

- `turnutils_uclient -m 200 -n 10000 -l 100 -z 20 -c -e 8.8.8.8 -r 3480`
- Target payload bitrate per flow: `~40 kbps` (`100 bytes / 20 ms`), aggregate `~8 Mbps`.

### Results

- TURN (`600s`): PASS by timeout (`exit 124` expected), `error 508=0`, `Forbidden=0`.
- WS (`600s`):
  - connected: `200/200` (failures `0`)
  - sent: `53,190`
  - ack: `53,362`
  - nack/errors: `0/0`
  - chatMessages: `5,082,201`
- API (`60 rps`, minute windows):
  - total requests: `35,865`
  - avg latency mean (10 min): `89.25 ms`
  - p95 mean (minute-level): `283.9 ms`
  - p99 mean (minute-level): `364.7 ms`
  - worst minute: `p95=494 ms`, `p99=620 ms`
  - errors/timeouts: `0/0`

### CPU p95/p99 (sampled window)

- Sampling source: container monitor every 10s (available samples range `10..60`).
- `boltorezka-api-test`: avg `4.16%`, p95 `7.21%`, p99 `7.96%`, max `8.31%`.
- `boltorezka-turn`: avg `0.03%`, p95 `0.05%`, p99 `0.06%`, max `0.06%`.
- `boltorezka-db-test`: avg `1.50%`, p95 `4.92%`, p99 `5.45%`, max `5.66%`.
- `boltorezka-redis-test`: avg `1.31%`, p95 `2.56%`, p99 `2.79%`, max `2.85%`.

### NetIO and sockets

- API NetIO grew during run (from baseline `~1.07GB/3.03GB` to monitor-end `~1.46GB/5.49GB`).
- TURN NetIO in this harness remained low-variance due local path specifics.
- TURN socket samples in captured monitor window remained at `udp=17`, `tcp=17`.

### Decision

- 10-minute mixed profile is stable at target load (`200 WS + 200 TURN + 60 rps API`).
- API remains primary resource hotspot; TURN CPU headroom is high for this synthetic profile.

## 2026-03-03 — Operational baseline (derived from cycles #5/#6/#7)

### Recommended operating caps (test baseline)

- Mixed steady profile: `200 WS + 200 TURN allocations + 60 rps API` for at least `10 min`.
- TURN planning cap for this synthetic profile: use `~300` as conservative upper bound.
- TURN `m=500` is over-limit in current setup (`error 508` observed), do not use as normal operating target.

### Suggested alert thresholds (initial)

- API latency guardrail for this profile: alert if minute-level `p99 > 700 ms` for `>=3` consecutive minutes.
- API error guardrail: alert on any non-zero minute `errors/timeouts` during steady `60 rps` run.
- TURN allocation guardrail: alert on first appearance of `error 508` in TURN logs.

### Notes

- These limits are valid for current `test` stack shape and this harness profile (Opus-like `~40 kbps` payload path).
- Re-validate caps after infra changes (TURN range, host limits, Docker/Desktop version, API/DB release updates).

## 2026-03-15 - Cycle #8 (desktop media permissions regression/rollback)

- Environment: `test` desktop runtime (`ELECTRON_RENDERER_URL=https://test.boltorezka.gismalink.art`).
- Trigger: после добавления агрессивных Electron permission handlers (`setPermissionCheckHandler`/`setPermissionRequestHandler`) UI показывал баннер "разрешите доступ к устройствам", микрофон/камера не активировались.

### Root cause

- Global permission interception в Electron main блокировал нормальный `getUserMedia` flow для renderer.

### Fix

- Удалены over-restrictive handlers `setPermissionCheckHandler` и `setPermissionRequestHandler` из `apps/desktop-electron/src/main.cjs`.
- Сохранен только `setDisplayMediaRequestHandler` для screen-share path.
- Electron процесс перезапущен после rollback.

### Result

- Manual verification: PASS.
- Баннер доступа к устройствам исчез, медиа-устройства снова работают.

## 2026-03-17 - Cycle #51 (runtime transport centralization targeted smoke)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/desktop-unsigned-mode` (`6ed844e`)

### Rollout + postdeploy status

- `TEST_REF=origin/feature/desktop-unsigned-mode npm run deploy:test:smoke`
  - deploy phase: PASS
  - postdeploy aggregate: FAIL (independent gate `smoke:desktop:update-feed` -> `latest.json failed after 3 attempts: fetch failed`)

### Targeted runtime transport gate (server-side)

- Command context: `ssh mac-mini 'cd ~/srv/boltorezka && set -a && source .deploy/smoke-auth.env && set +a && ...'`
- `smoke:realtime`: PASS (`ok=true`, transient retries on attempts `1/3`, `2/3`)
- `smoke:livekit:token-flow`: PASS (`ok=true`, `reconnectTokenRotated=true`, `sameRoomAcrossTokens=true`)
- `smoke:desktop:runtime`: PASS (`runtime=desktop`, `platform=darwin`, `electronVersion=35.7.5`)

### Decision

- Runtime transport refactor targeted gate: PASS.
- Плановый пункт `4.7 / targeted test smoke` закрыт.

## 2026-03-17 - Cycle #52 (test rollout with server-side desktop build)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Build ref: `origin/feature/desktop-unsigned-mode` (`4ca3ddd`)
- Rollout command:
  - `TEST_REF=origin/feature/desktop-unsigned-mode ENABLE_DESKTOP_BUILD=1 DESKTOP_CHANNEL=test DESKTOP_SIGNING_MODE=unsigned DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art npm run deploy:test:smoke`

### Build/publish stage

- Server-side desktop build: PASS (`apps/desktop-electron`, darwin arm64, ad-hoc signing)
- Published test artifacts:
  - `desktop/test/latest.json`
  - `desktop/test/mac/latest-mac.yml`
  - `desktop/test/<sha>/Boltorezka-mac-arm64.zip`

### Postdeploy smoke

- `smoke:sso`: PASS
- `smoke:api`: PASS
- `smoke:auth:session`: PASS
- `smoke:web:version-cache`: PASS (`sha=4ca3ddd...`)
- `smoke:desktop:update-feed`: PASS (`channel=test`, `sha=4ca3ddd...`)
- `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`, `callSignalIdempotencyOk=true`)

### Decision

- `deploy:test:smoke` cycle: PASS.
- Desktop update feed gate восстановлен в green для `test` после включения server-side desktop build/publish.

## 2026-03-17 - Cycle #53 (desktop download manifest contract activation)

- Environment: local web build + published `test` manifest endpoints
- Build ref: `origin/feature/desktop-unsigned-mode` (`f1a5ace` baseline before UI contract patch)

### Contract checks

- `GET https://test.boltorezka.gismalink.art/desktop/test/latest.json`: PASS
  - contains `channel=test`, `sha=4ca3ddd...`
  - contains artifact entries with `url`/`urlPath` for macOS binaries (`Boltorezka-mac-arm64.zip`, `.dmg`)
- Frontend mapping updated in `ServerProfileModal`:
  - download href resolution priority: `url` -> `urlPath` -> `relativePath + sha`
  - platform card keeps `Coming soon` fallback when no artifact exists

### Validation

- `npm --prefix apps/web run build`: PASS

### Decision

- Desktop download source contract is active and robust for current publish manifest format.
- Plan items for active `Download` button (available platform) and manifest-driven link building are closed.

## 2026-03-17 - Cycle #54 (manual rollback validation with desktop build)

- Environment: `test` (`https://test.boltorezka.gismalink.art`)
- Rollout baseline: `TEST_REF=origin/feature/desktop-unsigned-mode` -> SHA `6ad9d69`
- Rollback target: `TEST_REF=4ca3ddd2bebd62782a9cff2b7729b4eaf0c4e736`
- Common flags:
  - `ENABLE_DESKTOP_BUILD=1`
  - `DESKTOP_CHANNEL=test`
  - `DESKTOP_SIGNING_MODE=unsigned`
  - `DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art`

### Baseline rollout result (`6ad9d69`)

- `deploy:test:smoke`: PASS
- `smoke:desktop:update-feed`: PASS (`channel=test`, `sha=6ad9d69...`)
- `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Rollback rollout result (`4ca3ddd`)

- `deploy:test:smoke`: PASS
- `smoke:desktop:update-feed`: PASS (`channel=test`, `sha=4ca3ddd...`)
- `smoke:realtime`: PASS (`ok=true`, `reconnectOk=true`)

### Decision

- Manual rollback path in `test` is operational and reproducible for desktop release flow.
- M3 пункт `Rollback runbook verified on test` закрыт evidence-циклом.

## 2026-03-17 - Cycle #55 (test->test auto-update end-to-end)

- Environment: `test` desktop updater feed + packaged mac app from server-first publish.
- Feature ref: `origin/feature/desktop-unsigned-mode`.

### Root-cause fixes before rerun

- Fixed packaged updater runtime dependency:
  - `electron-updater` moved from `devDependencies` to `dependencies` in `apps/desktop-electron/package.json`.
- Fixed packaged app updater metadata on server publish:
  - `scripts/deploy/build-desktop-server-and-publish.sh` now injects `app-update.yml` into `.app/Contents/Resources`.

### Validation flow

1. Baseline publish to test:
   - SHA `c4afd0e...`, app version `1.0.0-test.20260317.2043`.
2. Launch baseline packaged app from published snapshot with updater env:
   - `ELECTRON_UPDATE_CHANNEL=test`
   - `ELECTRON_UPDATE_FEED_BASE_URL=https://test.boltorezka.gismalink.art/desktop`
   - `ELECTRON_UPDATE_AUTO_DOWNLOAD=1`
   - `ELECTRON_UPDATE_POLL_INTERVAL_MS=10000`
   - `ELECTRON_DESKTOP_UPDATE_TRACE_OUT=/tmp/desktop-update-trace.jsonl`
3. Publish next test build (same branch, new timestamp version):
   - app version `1.0.0-test.20260317.2046`.
4. Confirm updater trace state transitions in running baseline app.

### Evidence

- Trace confirms updater enabled in packaged app (`event=enabled`, `autoDownload=true`).
- After next publish, trace confirms automatic flow:
  - `event=available` (`availableVersion=1.0.0-test.20260317.2046`)
  - `event=download-progress` (`percent` from ~24 to `100`)
  - `event=downloaded` (`downloadedVersion=1.0.0-test.20260317.2046`)

### Decision

- M3 criterion `test->test update passes automatically` validated and closed.
