# Electron Desktop Windows Plan (2026-03-17)

Цель: вынести и закрыть все незавершенные Windows-специфичные задачи из основного desktop-плана без блокировки текущего macOS/test delivery.

Источник переноса:
- `docs/plans/2026-03-13_ELECTRON_DESKTOP_PLAN.md`

## 1) Scope

- [x] Запуск Datowave как standalone desktop app (Windows) подтвержден на уровне CI packaging/signing chain (signed RC windows-only, PASS).
- [ ] Проверить media permissions на Windows.
- [ ] Закрыть Windows 10/11 QA matrix: login, voice, camera, screen share, reconnect.

## 2) Signing and Release

- [x] Для test сохранить рабочий self-signed/pfx path как baseline (validated, PASS).
- [ ] Для prod подготовить trusted-signing readiness (Azure OIDC/secrets) как release-grade gate.
- [x] Подтвердить signed Windows artifact chain (build -> sign -> publish -> download/update smoke) для test self-signed/pfx path.

## 3) Validation Checklist

- [ ] Smoke: startup + auth + join + voice handshake.
- [ ] Smoke: mute/unmute + input/output switch.
- [ ] Smoke: camera + screen share start/stop.
- [ ] Smoke: reconnect after network flap.
- [ ] Smoke: forced update/recovery path.

## 4) Evidence and Exit Criteria

- [ ] TEST_RESULTS содержит PASS-циклы для Windows media + update + signing chain.
- [x] Runbook/plan notes синхронизированы с финальным Windows decision (self-signed test / trusted-signing prod).
- [x] Пункты Windows в основном плане можно закрыть ссылкой на PASS evidence здесь.

## 5) Next Action

- [ ] Выполнить manual Windows media permissions validation на packaged клиенте и зафиксировать evidence.

Progress note (2026-03-21, sync with TEST_RESULTS):
- Цикл #56 зафиксировал PASS для `windows-only signed RC` в test с default `pfx` signing provider.
- `trusted-signing` для prod остается отдельным release-grade блокером до заполнения Azure OIDC/secrets.
- Windows-specific runtime/media validation на реальном packaged Windows клиенте остается обязательным незакрытым шагом.
