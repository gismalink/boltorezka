# Phase 0 - Границы MVP и ADR (Канон)

Дата фиксации: 2026-03-04  
Дата актуализации: 2026-03-08  
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

- Решение: единый backend runtime (`boltorezka-api`) обслуживает HTTP API + WS signaling.
- Обоснование: ниже операционная сложность, понятная ownership-модель, достаточность для текущего масштаба.
- Следствие: split-service архитектура пересматривается только при подтвержденном scale pressure.

### ADR-002: Media-топология

- Решение: WebRTC P2P + TURN relay baseline (`relay + turns:gismalink.art:5349?transport=tcp`).
- Обоснование: предсказуемость поведения в test/prod и устойчивость в ограниченных сетях.
- Следствие: ограничение по размеру комнат остается обязательным; SFU идет как post-MVP эволюция.

### ADR-003: Auth/session модель

- Решение: SSO-first auth (`AUTH_MODE=sso`) + локальная JWT-сессия + short-lived ws-ticket для realtime handshake.
- Обоснование: централизованный identity flow и явная граница между web session и realtime ticket.
- Следствие: каждый rollout обязан проходить smoke по SSO + ws-ticket/realtime path.

### ADR-004: SFU-first media baseline (post-MVP transition)

- Решение: для текущего migration track принят `SFU-first` подход - все глубокие проверки и отладка voice/video выполняются на baseline `mediaTopology=sfu`; legacy `p2p` остается только как rollback/compare path.
- Выбор media-plane: operational baseline закреплен за текущим SFU routing profile (`RTC_MEDIA_TOPOLOGY_DEFAULT=sfu` в test Stage 3), без подключения внешних SFU движков в этом цикле (варианты LiveKit/mediasoup/Janus отложены до отдельного ADR при изменении архитектуры runtime).
- Обоснование: снижение неоднозначности mixed-topology поведения, единый test baseline и детерминированные rollout/smoke gate.
- Следствие: release/readiness evidence по voice/video считается валидным только для SFU baseline; pre-prod пакет обязан включать SFU smoke + baseline compare `p2p vs sfu`.

## 3) Актуальное состояние к 2026-03-08

- Controlled rollout toggle-пакет (Phase 5) внедрен и используется как policy fallback.
- RTC hardening package (Phase 6.1-6.3) закрыт в test-контуре.
- Decision package по SFU зафиксирован: `docs/plans/SFU_MIGRATION_PLAN.md`.
- `SFU-first` решение зафиксировано в ADR-004 и операционных runbook Stage 3/4.
- Текущий документ остается источником MVP-ограничений до завершения SFU Stage 0.

## 4) Канонические ссылки

- Архитектурный baseline: `docs/architecture/ARCHITECTURE.md`
- Voice baseline: `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- Pre-prod gate: `docs/runbooks/PREPROD_DECISION_PACKAGE.md`
- Test/load evidence: `docs/status/TEST_RESULTS.md`
- SFU migration decision package: `docs/plans/SFU_MIGRATION_PLAN.md`

## 5) Что остается вне scope этого Phase 0 пакета

- Финальный SFU runtime design и завершенный migration timeline для production.
- Platform-specific hardening для iOS/macOS.
- Полный production abuse/security hardening package (идет в следующих фазах).
