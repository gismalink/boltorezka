# Runbook On-Call и Triage для Desktop

Цель: единый и воспроизводимый порядок действий при инцидентах desktop-клиента в `test`/`prod` без ad-hoc решений.

## 1) Классы инцидентов

- Проблема update/distribution: недоступен feed, сломан `latest` manifest, зависает auto-update.
- Проблема auth/session: цикл SSO handoff, неконсистентный logout, неожиданный session move.
- Проблема RTC/media: не работают mic/camera/screenshare, нестабильный reconnect, кейс `WS=ok/RTC=fail`.
- Проблема runtime/security: неожиданные внешние переходы, подозрение на неправильный preload/IPC.

## 2) Первые 10 минут

1. Подтвердить окружение и версию, где наблюдается проблема.
2. Зафиксировать build SHA и канал:
- маркер версии/сборки в desktop UI или логах;
- SHA из `/desktop/<channel>/latest.json`.
3. Выполнить обязательные быстрые проверки:
- `curl -I <base>/health`
- `npm run smoke:desktop:update-feed` (с `SMOKE_WEB_BASE_URL=<base>`)
- `npm run smoke:realtime`
4. Открыть server-логи за соответствующий интервал (`docker compose logs --tail=120 <service>`).

## 3) Desktop-диагностика

Для RTC-инцидентов собрать строки из call log:
- `transport runtime=... api=... ws=... publicOrigin=...`
- `livekit signal raw=...`
- `livekit signal resolved=...`

Для update-инцидентов собрать updater trace (если включен):
- `ELECTRON_DESKTOP_UPDATE_TRACE_OUT=<path>`
- ожидаемая цепочка: `available -> download-progress -> downloaded`

## 4) Матрица решений

- P0/P1 инцидент в `prod`:
1. Остановить любые действия по продвижению релиза.
2. Запустить rollback на known-good SHA через GitOps flow.
3. Зафиксировать incident и rollback evidence.

- Регрессия только в `test`:
1. Заморозить `prod`.
2. Воспроизвести в `test` и исправить в feature-ветке.
3. Повторно прогнать targeted smoke + postdeploy smoke.

## 5) Ссылки для rollback

- Pre-prod decision и owner-модель: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
- Deploy flow и policy: `docs/runbooks/RUNBOOK_TEST_DEPLOY.md`
- Update channels и rollback детали: `docs/runbooks/DESKTOP_UPDATE_CHANNELS_RUNBOOK.md`

## 6) Фиксация evidence

Каждый инцидентный цикл обязательно добавлять в:
- `docs/status/TEST_RESULTS.md`

Минимальные поля:
- окружение,
- build ref/SHA,
- упавший gate,
- root cause,
- mitigation,
- итоговое решение.
