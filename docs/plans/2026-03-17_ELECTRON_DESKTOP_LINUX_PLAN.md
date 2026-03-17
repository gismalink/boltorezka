# Electron Desktop Linux Plan (2026-03-17)

Цель: вынести Linux-направление в отдельный backlog (v1.1+), не смешивая его с текущим v1 release path.

Источник переноса:
- `docs/plans/2026-03-13_ELECTRON_DESKTOP_PLAN.md`

## 1) Scope

- [ ] Linux release как production target.

## 2) Packaging Decisions

- [ ] Выбрать release targets (AppImage / deb / rpm) и policy поддержки.
- [ ] Зафиксировать update/distribution path для Linux артефактов.
- [ ] Определить требования к signing/notarization-эквиваленту для Linux delivery.

## 3) CI and Delivery

- [ ] Добавить Linux build/publish job в desktop artifacts pipeline (когда Linux войдет в active scope).
- [ ] Добавить smoke contract для Linux download/update endpoints.

## 4) QA Matrix

- [ ] Определить минимальную матрицу дистрибутивов и версий.
- [ ] Пройти login/voice/camera/screen share/reconnect smoke на Linux packaged app.

## 5) Exit Criteria

- [ ] Linux ready-state documented в TEST_RESULTS + runbooks.
- [ ] Основной desktop план не содержит открытых Linux задач.
