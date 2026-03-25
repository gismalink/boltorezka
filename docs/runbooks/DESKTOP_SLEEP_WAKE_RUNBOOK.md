# Desktop Sleep/Wake Runbook (2026-03-13)

Цель: получить repeatable evidence, что desktop runtime корректно переживает sleep/wake и восстанавливается без потери базовой работоспособности.

## 1) Preconditions

- Актуальная ветка desktop (`feature/electron-desktop-foundation`) развернута в test.
- Базовые desktop smoke уже проходят (`desktop:smoke:m2:secure:diag`).
- Тест выполняется на реальном ноутбуке/desktop-хосте (не в CI).

## 2) Quick automated assist (non-strict)

```bash
SMOKE_WEB_BASE_URL=https://test.datowave.com \
SMOKE_DESKTOP_SLEEP_WAKE_WINDOW_MS=30000 \
npm run smoke:desktop:sleep-wake
```

Этот запуск проверяет pre/post runtime markers и выводит `suspendObserved=true|false`.

## 3) Evidence-grade run (strict suspend required)

```bash
SMOKE_WEB_BASE_URL=https://test.datowave.com \
SMOKE_DESKTOP_SLEEP_WAKE_WINDOW_MS=45000 \
SMOKE_DESKTOP_SLEEP_WAKE_SUSPEND_THRESHOLD_MS=5000 \
SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1 \
npm run smoke:desktop:sleep-wake
```

Порядок:
1. Запустить команду.
2. В течение окна `WINDOW_MS` перевести устройство в sleep.
3. Разбудить и разблокировать устройство.
4. Дождаться завершения smoke и статуса `ok`.

## 4) Full chain with sleep/wake (optional)

```bash
SMOKE_WEB_BASE_URL=https://test.datowave.com \
SMOKE_DESKTOP_SOAK_CYCLES=2 \
SMOKE_DESKTOP_SLEEP_WAKE_WINDOW_MS=45000 \
SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND=1 \
npm run desktop:smoke:m2:sleepwake
```

## 5) PASS criteria

- `smoke:desktop:sleep-wake` завершился `ok`.
- При strict режиме: `suspendObserved=true`.
- Runtime markers после wake: `runtime=desktop`, `platform!=empty`, `electronVersion!=empty`.
- Нет критичных runtime errors в выводе smoke.

## 6) Logging in status docs

После PASS добавить запись в:
- `docs/status/TEST_RESULTS.md`

Минимум полей:
- command,
- `windowMs`, `elapsedMs`, `suspendObserved`,
- итог `PASS/FAIL`.
