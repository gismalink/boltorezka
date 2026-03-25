# Desktop Update Channels Runbook

Цель: управлять desktop update-каналами (`test`/`prod`) и безопасно откатываться при проблемном релизе.

## 1) Каналы и feed layout

- Каналы:
  - `test` — fast channel для QA/стабилизации.
  - `prod` — stable channel для пользователей.
- Feed URL формируется в runtime:
  - `${ELECTRON_UPDATE_FEED_BASE_URL}/${ELECTRON_UPDATE_CHANNEL}/{platform}`
  - `platform`: `mac`, `win`, `linux`.

Пример:
- `https://test.datowave.com/desktop/test/mac`
- `https://datowave.com/desktop/prod/win`

## 2) Runtime policy

В `apps/desktop-electron/src/main.cjs`:
- update orchestration включается только в packaged app;
- при отсутствии `ELECTRON_UPDATE_FEED_BASE_URL` update-check отключается (safe no-op);
- `test` channel:
  - `allowPrerelease=true`
  - `allowDowngrade=true`
- `prod` channel:
  - `allowPrerelease=false`
  - `allowDowngrade=false`
- `autoInstallOnAppQuit=false` (ручной контроль окна релиза);
- polling по умолчанию: `20m` (`ELECTRON_UPDATE_POLL_INTERVAL_MS`).
- Safe apply: установка выполняется только по явному действию пользователя `Restart and update` (без авто-install в фоне).

## 3) Build commands

- Test artifacts:
  - `npm --prefix apps/desktop-electron run dist:test`
- Prod artifacts:
  - `npm --prefix apps/desktop-electron run dist:prod`

Важно:
- Подписание/notarization остается обязательным release-gate до публичного prod rollout.
- Upload артефактов выполняется в channel-специфичный путь feed storage.
- Для server-first publish обязательно сохранять `app-update.yml` внутри packaged `.app` (`Contents/Resources/app-update.yml`), иначе auto-download может падать с `ENOENT` даже при доступном `latest-mac.yml`.

## 4) Rollout flow

1. Собрать и подписать RC в `test`.
2. Опубликовать артефакты в `.../test/{platform}`.
3. Пройти desktop smoke + postdeploy smoke в `test`.
4. Зафиксировать evidence в `docs/status/TEST_RESULTS.md`.
5. После sign-off опубликовать в `.../prod/{platform}`.

## 4.1 Apply flow (desktop user path)

1. Desktop runtime получает `update-available`/`update-downloaded` через preload bridge.
2. В renderer показывается banner: `Desktop update is ready to install`.
3. Пользователь нажимает `Restart and update`.
4. Renderer вызывает `applyUpdate` -> main process вызывает `quitAndInstall`.
5. Приложение перезапускается уже на новой версии.

## 5) Rollback flow

Сценарий: проблемный update уже опубликован в канале.

1. Снять проблемный релиз из feed (или перезаписать feed на предыдущий стабильный version).
2. Для `test` допускается controlled downgrade (runtime policy already enabled).
3. Для `prod` использовать forward-fix релиз (новый стабильный build), не принудительный downgrade.
4. Проверить update-check на эталонных устройствах.
5. Записать incident/evidence в `docs/status/TEST_RESULTS.md`.

## 6) Env reference

- `ELECTRON_UPDATE_CHANNEL` = `test | prod`
- `ELECTRON_UPDATE_FEED_BASE_URL` = base URL feed storage
- `ELECTRON_UPDATE_POLL_INTERVAL_MS` = poll interval (0 disables periodic checks)
- `ELECTRON_UPDATE_AUTO_DOWNLOAD` = `1` to auto-download, default `0`

## 7) Acceptance criteria for M3 (non-download scope)

- Каналы `test/prod` формально отделены и управляются env policy.
- Runtime безопасно обрабатывает отсутствующий feed (без crash).
- Описан rollback-процесс для update канала.
- Для `test` подтвержден auto-download path (`available -> download-progress -> downloaded`) на packaged runtime.
