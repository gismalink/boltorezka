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

Поведение:
- при `signed=false` или push/PR: собираются unsigned/unpacked artifacts;
- при `signed=true`: запускается signed release candidate build (`dist:test` или `dist:prod`).

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
2. Дождаться завершения matrix (`macos-latest`, `windows-latest`).
3. Проверить, что artifacts загружены с suffix `signed`.
4. Зафиксировать результаты в `docs/status/TEST_RESULTS.md`.
5. При ошибке signing/notarization:
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
