# Desktop Handoff Deterministic Design (2026-03-14)

Status: Completed (design+implementation evidence closed, archived 2026-03-21)

Цель: убрать timer-based fallback из browser->desktop handoff и заменить его детерминированным протоколом завершения авторизации.

## 1) Проблема

Текущий flow использует таймер после `window.location.href = boltorezka://...`:
- если таймер слишком короткий, браузерный redirect может перебить deep-link;
- если слишком длинный, пользователь видит лишнюю паузу;
- поведение зависит от платформы/браузера/настроек OS.

Это недетерминированно и дает race-condition.

## 2) Требования

- Детерминированно открывать desktop после browser login.
- Не открывать web chats после успешного desktop handoff.
- Не требовать таймеров для определения успеха/неуспеха deep-link.
- Оставить browser-first SSO (RFC8252 pattern).

## 3) Варианты

### A) Protocol + explicit completion token (recommended)

Схема:
1. Browser получает `desktop_handoff_code`.
2. Browser открывает `boltorezka://...&attemptId=<id>`.
3. Electron принимает deep-link и вызывает backend `/v1/auth/desktop-handoff/exchange`.
4. После успешного exchange Electron отправляет browser-ack на backend:
   - `POST /v1/auth/desktop-handoff/complete` с `attemptId`.
5. Browser не использует таймеры, а polling/SSE ждет статус `complete` по `attemptId`.
6. После `complete` browser показывает completion-page.

Плюсы:
- полностью детерминированно;
- устойчиво к race и медленным обработчикам deep-link;
- легко диагностировать (attemptId trace).

Минусы:
- нужен новый endpoint + короткий polling/SSE.

### B) Protocol + hidden iframe + visibility heuristics

Схема:
- Пытаемся открыть deep-link через iframe/location + эвристики `visibilitychange`.

Плюсы:
- без backend изменений.

Минусы:
- по сути тоже эвристика, не гарантия;
- зависит от браузера и privacy policy.

### C) Loopback callback server в desktop

Схема:
- Desktop поднимает localhost callback, browser редиректит туда, desktop завершает auth.

Плюсы:
- стандартный deterministic desktop pattern.

Минусы:
- больше изменений в runtime/security/firewall;
- усложнение релиза и поддержки.

## 4) Выбор

Для текущего проекта выбрать Вариант A.

Причины:
- минимальный риск и минимальный архитектурный сдвиг относительно текущего custom protocol;
- хорошо ложится на уже существующий одноразовый handoff code;
- дает наблюдаемость и воспроизводимость.

## 5) Спецификация протокола (A)

Новые сущности:
- `attemptId` (uuid), создается в browser перед handoff.
- Redis key `auth:desktop-handoff-attempt:<attemptId>`:
  - status: `pending|completed|expired`
  - createdAt
  - completedAt
  - userId (optional for audit)

Новые endpoint'ы:
- `POST /v1/auth/desktop-handoff/attempt`
  - response: `{ attemptId, expiresInSec }`
- `GET /v1/auth/desktop-handoff/attempt/:attemptId`
  - response: `{ status }`
- `POST /v1/auth/desktop-handoff/complete`
  - body: `{ attemptId }`
  - вызывается desktop после успешного exchange

Frontend web:
- Убираем timer fallback.
- После deep-link стартуем polling status (1-2s, timeout 30-60s).
- На `completed` показываем completion-page.
- На timeout показываем controlled error page с CTA "Открыть desktop снова".

Desktop:
- После successful `completeDesktopHandoff` дергаем `.../complete` с `attemptId`.

## 6) Безопасность

- TTL для attempt (60-120s).
- Rate limits на create/status/complete.
- `attemptId` одноразовый, completion только для `pending`.
- Audit log: create/complete/expired.

## 7) План реализации

Phase 1:
- Backend: endpoints + Redis model + rate limit.
- Web: create attempt + polling + remove timer.
- Desktop: complete ack.

Phase 2:
- Smoke: deterministic handoff smoke (positive + timeout path).
- Docs: update desktop auth runbook.

## 8) Acceptance criteria

- Нет таймеров для определения handoff успеха.
- Browser никогда не показывает chat UI после desktop login handoff.
- При 20 последовательных входах нет race/misdirected account.
- Smoke deterministic handoff PASS на test.

## 9) Archive note

- Документ закрыт как design artifact после внедрения deterministic handoff протокола и подтверждающих test cycles в `docs/status/test-results/*`.
- Дальнейший operational tracking ведется через test-results и desktop runbooks.
