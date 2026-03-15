# Desktop Signing Readiness Runbook

Цель: подготовить и проверить signing/notarization pipeline для desktop release candidate без немедленного prod rollout.

## 1) Scope

Этот runbook покрывает readiness-подготовку:
- CI режим signed release candidate.
- Секреты для macOS signing/notarization и Windows signing.
- Проверку, что signed artifacts собираются и доступны как CI artifacts.

Публикация публичных download links и массовый rollout вне scope этого шага.

## 2) Workflow entrypoint

Используется workflow:
- `.github/workflows/desktop-artifacts.yml`

Manual запуск (`workflow_dispatch`) с параметрами:
- `release_channel`: `test` | `prod`
- `signed`: `true`
- `create_release_draft`: `true|false`

Поведение:
- при `signed=false` или push/PR: собираются unsigned/unpacked artifacts;
- при `signed=true`: запускается signed release candidate build (`dist:test` или `dist:prod`).
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

Примечание:
- сертификаты/ключи хранятся только в GitHub Secrets;
- в репозиторий не коммитим p12/пароли/токены.

## 4) Readiness check sequence

1. Запустить `desktop-artifacts` вручную:
   - `release_channel=test`
   - `signed=true`
   - `create_release_draft=false` (или `true`, если нужен draft в Releases)
2. Дождаться завершения matrix (`macos-latest`, `windows-latest`).
3. Проверить, что artifacts загружены с suffix `signed`.
4. Проверить наличие artifact `desktop-release-manifest-<sha>`.
5. Если `create_release_draft=true`, проверить появление draft release и вложений.
6. Зафиксировать результаты в `docs/status/TEST_RESULTS.md`.
7. При ошибке signing/notarization:
   - проверить заполнение secrets,
   - проверить валидность сертификатов,
   - перезапустить workflow после исправления.

## 5) Promotion policy

- `test` signed RC: допустим для валидации smoke/release gate.
- `prod` signed RC: только после явного sign-off и готовности M4.
- Нет automatic prod rollout из readiness шага.

## 6) Exit criteria (readiness)

- Signed build проходит минимум на одном successful cycle по каждой платформе.
- Артефакты доступны в CI и пригодны для ручной проверки.
- Результат зафиксирован в test results и desktop plan.
