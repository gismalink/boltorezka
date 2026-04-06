# Phase 0 - Границы MVP и ADR (Канон)

Дата фиксации: 2026-03-04  
Дата актуализации: 2026-03-09  
Статус: Действует для текущего MVP-контура

## 1) Границы MVP (утверждено)

### 1.1 Масштаб участников/комнат (MVP)

- Базовая media-топология в MVP: WebRTC P2P-first + TURN relay baseline.
- Практический консервативный контур планирования:
  - целевой активный voice/chat room: до `~50` relay-active участников;
  - в тестовых профилях наблюдались более высокие синтетические значения, но продуктовый лимит для MVP фиксируется консервативно.
- Для больших групп в MVP применяется policy: деление на несколько комнат/каналов, а не один oversized session.

### 1.2 Retention (MVP)

- Сообщения и room-данные хранятся в Postgres с операционными бэкапами.
- Эфемерные realtime-артефакты (presence/ws-ticket/session routing) остаются Redis-scoped и short-lived.
- Отдельный long-term pipeline хранения медиа в MVP не включен.

### 1.3 Платформы (MVP)

- Основная GA-цель текущего MVP-цикла: Web.
- iOS/macOS остаются post-MVP фазами и не входят в текущий release gate.

## 2) Сводка ADR (утверждено)

### ADR-001: Архитектура signaling

- Решение: единый backend runtime (API service) обслуживает HTTP API + WS signaling.
- Обоснование: ниже операционная сложность, понятная ownership-модель, достаточность для текущего масштаба.
- Следствие: split-service архитектура пересматривается только при подтвержденном scale pressure.

### ADR-002: Media-топология

- Решение: LiveKit-only media baseline в активном runtime-контуре.
- Обоснование: единая media-plane модель упрощает rollout/smoke и исключает неоднозначность mixed-topology поведения.
- Следствие: активные deploy/smoke профили не используют legacy `p2p/sfu` routing override.

### ADR-003: Auth/session модель

- Решение: SSO-first auth (`AUTH_MODE=sso`) + локальная JWT-сессия + short-lived ws-ticket для realtime handshake.
- Обоснование: централизованный identity flow и явная граница между web session и realtime ticket.
- Следствие: каждый rollout обязан проходить smoke по SSO + ws-ticket/realtime path.

### ADR-004: LiveKit full-transition baseline

- Решение: migration track завершен переходом на livekit-only baseline для активного runtime.
- Историческая пометка: предыдущие Stage 0-4 SFU/P2P материалы сохраняются как архив evidence и не используются как операционная каноника для новых rollout.
- Обоснование: единый media-plane baseline уменьшает количество conditional paths в API/Web и снижает риск регрессий при deploy.
- Следствие: release/readiness evidence по voice/video фиксируется в рамках livekit-only smoke/gate профиля.

## 3) Актуальное состояние к 2026-03-09

- Controlled rollout toggle-пакет (Phase 5) внедрен и используется как policy fallback.
- RTC hardening package (Phase 6.1-6.3) закрыт в test-контуре.
- Полный runtime-переход на LiveKit завершен в активном контуре (API/Web/scripts/infra livekit-only).
- Decision package по transition закрывается через `docs/plans/2026-03-09_LIVEKIT_FULL_TRANSITION_CHECKLIST.md`.
- SFU/P2P stage-материалы остаются в репозитории как исторический контекст и evidence.

## 4) Канонические ссылки

- Архитектурный baseline: `docs/architecture/ARCHITECTURE.md`
- Voice baseline: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Pre-prod gate: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
- Test/load evidence: `docs/status/TEST_RESULTS.md`
- LiveKit transition decision package: `docs/plans/2026-03-09_LIVEKIT_FULL_TRANSITION_CHECKLIST.md`

## 5) Что остается вне scope этого Phase 0 пакета

- Финальный SFU runtime design и завершенный migration timeline для production.
- Platform-specific hardening для iOS/macOS.
- Полный production abuse/security hardening package (идет в следующих фазах).
