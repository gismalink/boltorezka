# Desktop Signing Readiness Runbook

Цель: подготовить и проверить signing/notarization pipeline для desktop release candidate без немедленного prod rollout.

Primary policy (2026-03-15):
- Server-first build/publish через GitOps checkout на сервере.
- GitHub Actions workflow используется как manual fallback/backup path.

## 1) Scope

Этот runbook покрывает readiness-подготовку:
- CI режим signed release candidate.
- Секреты для macOS signing/notarization и Windows signing.
- Проверку, что signed artifacts собираются и доступны как CI artifacts.

Публикация публичных download links и массовый rollout вне scope этого шага.

## 2) Workflow entrypoint

Используется workflow:
- `.github/workflows/desktop-artifacts.yml`

Важно:
- workflow запускается вручную (manual-only fallback), не на каждый push/PR.

## 2.0 Server-first entrypoint

Основной entrypoint на сервере:
- `scripts/deploy/build-desktop-server-and-publish.sh`

Пример запуска на сервере:
- `DESKTOP_CHANNEL=test DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/feature/electron-desktop-foundation "$PWD"`

Временный режим до готовности dev-аккаунтов (test-only):
- `DESKTOP_CHANNEL=test DESKTOP_SIGNING_MODE=unsigned DESKTOP_PUBLIC_BASE_URL=https://test.boltorezka.gismalink.art ./scripts/deploy/build-desktop-server-and-publish.sh origin/main "$PWD"`
- `DESKTOP_SIGNING_MODE=self-signed` допускается только в `test` (использует сертификат из keychain/окружения, если он доступен).
- Для `prod` разрешен только `DESKTOP_SIGNING_MODE=auto`.

Что делает server script:
1. Проверяет чистый repo.
2. Делает fetch + checkout detach на целевой ref.
3. Ставит зависимости web/desktop.
4. Собирает desktop (`dist:test`/`dist:prod`).
5. Публикует build в edge static web-root: `/ingress/static/boltorezka/<channel>/desktop/<channel>/<sha>/...`.
6. Обновляет channel manifest: `/ingress/static/boltorezka/<channel>/desktop/<channel>/latest.json`.
7. Генерирует mac updater feed: `/ingress/static/boltorezka/<channel>/desktop/<channel>/mac/latest-mac.yml` (+ `*-mac.zip`, `*.blockmap`).

Manual запуск (`workflow_dispatch`) с параметрами:
- `release_channel`: `test` | `prod`
- `signed`: `true`
- `create_release_draft`: `true|false`
- `signed_platforms`: `all` | `windows-only` | `mac-only`
- `windows_signing_provider`: `azure-oidc` | `pfx`

Поведение:
- при `signed=false` или push/PR: собираются unsigned/unpacked artifacts;
- при `signed=true`: запускается signed release candidate build (`dist:test` или `dist:prod`).
- при `signed=true` + `signed_platforms=windows-only`: mac job остается unsigned (не блокирует RC при отсутствии Apple secrets).
- при `signed=true` + `windows_signing_provider=azure-oidc`: Windows artifacts подписываются через Azure Artifact Signing по OIDC (без `DESKTOP_WIN_CSC_*`).
- при `signed=true`: после matrix-build запускается `github-release-chain` job (manifest + optional draft release).

## 2.1 Что именно делает GitHub в этой цепочке

Роль GitHub Actions:
1. Checkout исходников и фиксированная сборочная среда (`macos-latest`, `windows-latest`, Node 22).
2. Инъекция секретов signing/notarization только в signed path (через encrypted GitHub Secrets).
3. Запуск desktop build-команд и сборка артефактов для каждой платформы.
4. Публикация артефактов как immutable workflow artifacts.
5. Агрегация итогов в `desktop-release-manifest.json` (sha, channel, file list, run metadata).
6. Опционально: создание GitHub Draft Release и attachment собранных файлов.

Роль GitHub Releases (когда `create_release_draft=true`):
1. Создается draft tag вида `desktop-<channel>-<sha7>-run<run_number>`.
2. К draft release прикладываются все файлы из matrix artifacts.
3. Release остается draft, пока команда не даст отдельное подтверждение на публикацию.

Что GitHub НЕ делает автоматически в этом шаге:
- не выкатывает prod;
- не публикует артефакты в внешний CDN/feed storage;
- не подтверждает release quality вместо smoke/sign-off.

## 3) Required GitHub secrets

macOS:
- `DESKTOP_CSC_LINK`
- `DESKTOP_CSC_KEY_PASSWORD`
- `DESKTOP_APPLE_ID`
- `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`
- `DESKTOP_APPLE_TEAM_ID`

Windows:
- `DESKTOP_WIN_CSC_LINK`
- `DESKTOP_WIN_CSC_KEY_PASSWORD`

Windows (Azure OIDC path, recommended):
- `AZURE_TRUSTED_SIGNING_CLIENT_ID`
- `AZURE_TRUSTED_SIGNING_TENANT_ID`
- `AZURE_TRUSTED_SIGNING_SUBSCRIPTION_ID`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME`

Примечание:
- сертификаты/ключи хранятся только в GitHub Secrets;
- в репозиторий не коммитим p12/пароли/токены.

### 3.1 UI template (placeholder values)

Ниже шаблон значений для заполнения через GitHub UI (`Settings -> Secrets and variables -> Actions`).

Важно:
- это примеры-заглушки, не реальные секреты;
- используйте ваши фактические сертификаты/пароли/ID;
- значения типа `*_CSC_LINK` ожидаются в формате base64 содержимого certificate файла.

| Secret name | Example placeholder |
|---|---|
| `DESKTOP_CSC_LINK` | `BASE64_P12_APPLE_CERT_PLACEHOLDER` |
| `DESKTOP_CSC_KEY_PASSWORD` | `APPLE_P12_PASSWORD_PLACEHOLDER` |
| `DESKTOP_APPLE_ID` | `apple-dev-account@example.com` |
| `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD` | `xxxx-xxxx-xxxx-xxxx` |
| `DESKTOP_APPLE_TEAM_ID` | `TEAMID1234` |
| `DESKTOP_WIN_CSC_LINK` | `BASE64_PFX_WINDOWS_CERT_PLACEHOLDER` |
| `DESKTOP_WIN_CSC_KEY_PASSWORD` | `WINDOWS_PFX_PASSWORD_PLACEHOLDER` |
| `AZURE_TRUSTED_SIGNING_CLIENT_ID` | `00000000-0000-0000-0000-000000000000` |
| `AZURE_TRUSTED_SIGNING_TENANT_ID` | `11111111-1111-1111-1111-111111111111` |
| `AZURE_TRUSTED_SIGNING_SUBSCRIPTION_ID` | `22222222-2222-2222-2222-222222222222` |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | `https://eus.codesigning.azure.net` |
| `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME` | `trusted-signing-account-name` |
| `AZURE_TRUSTED_SIGNING_CERT_PROFILE_NAME` | `trusted-signing-cert-profile` |

Минимальная self-check после заполнения:
- запустить `desktop-artifacts` с параметрами `release_channel=test`, `signed=true`;
- убедиться, что jobs `build-macos-latest` и `build-windows-latest` завершаются `success`.

Practical режим до готовности Apple-аккаунта:
- запускать `signed=true`, `signed_platforms=windows-only`, `windows_signing_provider=azure-oidc`.
- ожидаемое поведение: Windows проходит signed path, macOS проходит unsigned path без fail из-за отсутствующих Apple secrets.

Temporary test policy (до готовности коммерческих сертификатов):
- допускается self-signed/не fully-trusted signing только для внутреннего `test` канала и ограниченного RC smoke;
- допускается unsigned build (без подписи) только для внутреннего `test` канала и ограниченного RC smoke;
- для `prod` и статуса release-grade это `NO-GO`;
- обязательное действие: приобрести коммерческий Windows code-signing сертификат (OV/EV) и перевести pipeline на trusted signing path.

## 4) Readiness check sequence

1. На сервере выполнить server-first build script для `test` канала.
2. Проверить публикацию в static downloads и `latest.json` манифест.
3. Выполнить smoke/ручную проверку установки из server URL.
4. Зафиксировать результаты в `docs/status/TEST_RESULTS.md`.
5. При необходимости fallback выполнить GitHub manual workflow:
   - `release_channel=test`
   - `signed=true`
   - `create_release_draft=false` (или `true`, если нужен draft в Releases)
6. При ошибке signing/notarization:
   - проверить заполнение secrets,
   - проверить валидность сертификатов,
   - перезапустить workflow после исправления.

## 5) Promotion policy

- `test` signed RC: допустим для валидации smoke/release gate.
- `prod` signed RC: только после явного sign-off и готовности M4.
- Self-signed artifacts: допустимы только в `test`, запрещены для `prod`.
- Нет automatic prod rollout из readiness шага.

## 6) Exit criteria (readiness)

- Signed build проходит минимум на одном successful cycle по каждой платформе.
- Артефакты доступны в CI и пригодны для ручной проверки.
- Результат зафиксирован в test results и desktop plan.

## 7) Release-grade signing matrix

Матрица фиксирует minimum gates для release candidate перед следующим публичным desktop rollout.

| Platform | Signing gate | Verification gate | Status field |
|---|---|---|---|
| macOS (arm64/x64) | code sign + notarization + staple | install/open + update-check + smoke | `MAC_SIGNING_STATUS` |
| Windows 10/11 | code sign | install/open + SmartScreen sanity + smoke | `WIN_SIGNING_STATUS` |

Правило прохождения:
- `PASS` по обеим платформам обязателен для статуса release-grade.
- Если одна из платформ `FAIL`, итоговый статус: `NO-GO` для следующего desktop public release.

## 8) Release-grade evidence checklist

Заполнить после каждого signing cycle:

1. Commit/ref:
   - `<git-ref>`
2. Workflow/server run id:
   - `<run-id-or-marker>`
3. macOS:
   - signing: `PASS|FAIL`
   - notarization: `PASS|FAIL`
   - staple verification: `PASS|FAIL`
   - runtime smoke (packaged): `PASS|FAIL`
4. Windows:
   - signing: `PASS|FAIL`
   - install/open smoke: `PASS|FAIL`
   - runtime smoke (packaged): `PASS|FAIL`
5. Update channel verification:
   - `smoke:desktop:update-feed` (target channel): `PASS|FAIL`
6. Decision:
   - `GO|NO-GO`

Куда писать evidence:
- `docs/status/TEST_RESULTS.md` (cycle entry)
- `docs/status/feature-log/<date>.md` (release narrative)

## 9) Command skeletons for verification

macOS notarization/staple verification (на test RC артефакте):

- `spctl --assess --type execute --verbose <path-to-app-or-dmg>`
- `xcrun stapler validate <path-to-app-or-dmg>`

Windows signing sanity (на RC артефакте):

- `Get-AuthenticodeSignature <path-to-exe> | Format-List`

Важно:
- Эти команды используются только как verification layer поверх CI/server build pipeline.
- Источником rollout истины остаются GitOps scripts и documented smoke gates.
