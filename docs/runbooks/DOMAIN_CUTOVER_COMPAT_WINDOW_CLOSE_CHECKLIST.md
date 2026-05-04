# Domain Cutover Compatibility Window Close Checklist

Цель: закрыть последний legacy runtime хвост (`*.gismalink.art`) после окончания окна совместимости одним коротким проходом.

Политика:
- GitOps-only.
- Выполнять только после merge cleanup-коммита в `main`.
- Команды запускать на сервере через `ssh -t`.

## Preconditions (обязательно)

- Окно совместимости официально завершено или отменено решением владельца релиза.
- Cleanup-изменения уже в `origin/main` (никаких feature ref для `prod`).
- На сервере `~/srv/datowave` и `~/srv/edge` нет незакоммиченных ручных правок.

## Day-of Commands (ready-to-run)

1) Deploy cleanup в `prod` (из `main`):

```bash
ssh -t mac-mini 'cd ~/srv/datowave && PROD_REF=origin/main npm run deploy:prod'
```

2) Обязательный post-change smoke (SSO routing + redirect map + web static):

```bash
ssh -t mac-mini 'cd ~/srv/datowave && SMOKE_API_URL=https://datowave.com npm run smoke:sso:routing && SMOKE_REDIRECT_SCOPE=prod npm run smoke:redirect-map && SMOKE_API_URL=https://datowave.com SMOKE_WEB_BASE_URL=https://datowave.com npm run smoke:web:static'
```

3) Быстрый edge/runtime контроль (`prod`):

```bash
ssh -t mac-mini 'cd ~/srv/edge && ./scripts/test-smoke.sh --local prod'
```

## PASS criteria

- Все 3 команды завершились без ошибок (exit code `0`).
- `smoke:sso:routing` подтверждает редиректы на `https://auth.datowave.com/...`.
- `smoke:redirect-map` подтверждает ожидаемые redirect case для `prod` без loop и с сохранением path/query.
- `test-smoke.sh --local prod` показывает ключевые контейнеры в `Up` и завершает `== smoke: OK ==`.

## Evidence to record

- Добавить запись в `docs/status/test-results/2026-03-27.md` (или новый файл по дате выполнения) с:
  - UTC время,
  - `origin/main` SHA,
  - результат каждой из 3 команд,
  - итог: legacy cleanup `done`.
