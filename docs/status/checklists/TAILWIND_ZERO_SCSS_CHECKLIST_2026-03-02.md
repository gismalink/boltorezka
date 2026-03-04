# Tailwind Zero-SCSS Checklist (apps/web)

Дата: 2026-03-02
Ветка: `feature/tailwind-user-dock`

## Финальный чек-лист

- [x] Составлен аудит оставшихся SCSS-зависимостей в `apps/web/src/components`.
- [x] Создан единый стиль-бандл `apps/web/src/styles.css` (эквивалент прежних partials).
- [x] Точка входа переключена с `styles.scss` на `styles.css` в `apps/web/src/main.tsx`.
- [x] Удалены все SCSS-файлы в `apps/web/src` (`styles.scss` + `styles/*.scss`).
- [x] Проверено отсутствие SCSS-импортов в web-коде.
- [x] Проверено отсутствие `.scss` файлов в `apps/web/src`.
- [x] Запущена сборка `apps/web` после удаления SCSS.
- [x] Результат зафиксирован в `docs/status/FEATURE_LOG.md`.
