# Electron Desktop Windows Plan (2026-03-17)

Цель: вынести и закрыть все незавершенные Windows-специфичные задачи из основного desktop-плана без блокировки текущего macOS/test delivery.

Источник переноса:
- `docs/plans/2026-03-13_ELECTRON_DESKTOP_PLAN.md`

## 1) Scope

- [ ] Запуск Boltorezka как standalone desktop app (Windows).
- [ ] Проверить media permissions на Windows.
- [ ] Закрыть Windows 10/11 QA matrix: login, voice, camera, screen share, reconnect.

## 2) Signing and Release

- [ ] Для test сохранить рабочий self-signed/pfx path как baseline.
- [ ] Для prod подготовить trusted-signing readiness (Azure OIDC/secrets) как release-grade gate.
- [ ] Подтвердить signed Windows artifact chain (build -> sign -> publish -> download/update smoke).

## 3) Validation Checklist

- [ ] Smoke: startup + auth + join + voice handshake.
- [ ] Smoke: mute/unmute + input/output switch.
- [ ] Smoke: camera + screen share start/stop.
- [ ] Smoke: reconnect after network flap.
- [ ] Smoke: forced update/recovery path.

## 4) Evidence and Exit Criteria

- [ ] TEST_RESULTS содержит PASS-циклы для Windows media + update + signing chain.
- [ ] Runbook/plan notes синхронизированы с финальным Windows decision (self-signed test / trusted-signing prod).
- [ ] Пункты Windows в основном плане можно закрыть ссылкой на PASS evidence здесь.

## 5) Next Action

- [ ] Выполнить manual Windows media permissions validation на packaged клиенте и зафиксировать evidence.
