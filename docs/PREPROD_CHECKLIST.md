# Boltorezka Pre-Prod Checklist

Чеклист перед запросом на rollout в `prod`.

## 1) Branch и Git

1. Feature-ветка смержена в `main`.
2. В diff нет секретов и `.env`.
3. Релевантные docs обновлены в том же наборе изменений.

## 2) Test env must-pass

1. `https://test.boltorezka.gismalink.art/health` отвечает `200` стабильно.
2. `SMOKE_API_URL=https://test.boltorezka.gismalink.art npm run smoke:sso` проходит.
3. Local auth отключен (`/v1/auth/register` и `/v1/auth/login` -> `410 SsoOnly`).
4. UI smoke пройден:
   - SSO login,
   - Complete SSO Session,
   - room join,
   - message send/receive в двух вкладках.
5. RBAC smoke пройден:
   - `super_admin` может промоутить пользователя в `admin`,
   - обычный `user` не может создавать комнату,
   - `admin` может создавать комнату.

## 3) Runtime и конфигурация

1. `AUTH_MODE=sso` в test/prod окружениях.
2. `AUTH_SSO_BASE_URL`:
   - test -> `https://test.auth.gismalink.art`
   - prod -> `https://auth.gismalink.art`
3. `ALLOWED_RETURN_HOSTS`:
   - test содержит `test.boltorezka.gismalink.art`
   - prod содержит `boltorezka.gismalink.art`
4. Edge ingress содержит маршруты для test/prod Boltorezka.
6. Realtime WebSocket использует short-lived `ws-ticket` (не bearer token в query).

## 4) Release decision gate

Перед `prod` должно быть:

1. Явное подтверждение владельца релиза.
2. Запись commit SHA и smoke-результата.
3. План rollback (команда + ответственный).

## 4.1) Merge + post-merge guardrails

1. Merge только из `feature/*` в `main` после успешного PR-review.
2. После merge повторить `test` проверку уже от `origin/main` (`deploy:test:smoke`).
3. Дополнительно прогнать extended realtime relay smoke (`SMOKE_CALL_SIGNAL=1`, 2 ws-ticket).
4. В `prod` идти только после явного подтверждения владельца релиза.
5. В `prod` выкатывать только `main` (никогда не feature-ветку).

## 5) Prod verification (после явного разрешения)

1. `curl -I https://boltorezka.gismalink.art/health` -> `200`.
2. Проверка SSO redirect на prod домене.
3. Короткий UI smoke (login -> room -> chat).
4. Логи без критичных ошибок в первые 10-15 минут.
