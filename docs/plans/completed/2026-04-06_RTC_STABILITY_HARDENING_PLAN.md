# План: RTC stability hardening (completed)
Date: 2026-04-06
Scope: Закрытие инкрементного RTC hardening трека (consistency/reconnect/visibility), включая observability, smoke/deploy gates и controlled rollback-переключатели.

## 0) Контекст

- RTC roadmap запускался как отдельный execution workstream для устранения регрессий по camera state, late join и reconnect.
- Работы велись в test-first режиме, с feature flags и обратимостью без code revert.
- На момент закрытия все phase-задачи и acceptance-пункты выполнены по зафиксированным evidence.

## 1) Цели

- Стабилизировать RTC поведение по state consistency, reconnect и media visibility.
- Встроить обязательные smoke/deploy gates для `call.initial_state` и camera-state convergence.
- Обеспечить контролируемый rollback через feature flags без отката кода.

## 2) Workstreams

### 2.1 State consistency foundation

- [x] Серверный canonical media-state store и `call.initial_state` replay на `room.join`.
- [x] Клиентский replay до обычных дельт и синхронизация UI карт первого рендера.

### 2.2 Negotiation reliability

- [x] Единый negotiation manager.
- [x] Offer retry budget + fairness queue (`manual`, `video-sync`, `ice-restart`).

### 2.3 Observability and gates

- [x] RTC counters/histograms (`offer/glare/reconnect/state-lag`).
- [x] Расширенные smoke-проверки late-join replay и camera convergence.
- [x] Postdeploy gate и CI wiring для replay-path.

### 2.4 Controlled rollout and rollback

- [x] Runtime feature flags: `initial_state_replay`, `negotiation_manager_v2`, `offer_queue`.
- [x] Rollback path без code revert через переключение flags.

## 3) Приоритеты

1. P0: State consistency + smoke/deploy gates.
2. P1: Negotiation reliability + observability.
3. P2: Controlled rollout и decision package синхронизация.

## 4) Acceptance criteria

- [x] 3 подряд test-прогона без пустых remote camera windows.
- [x] Мгновенное выключение remote camera в UI при `localVideoEnabled=false`.
- [x] Late join получает корректный media-state до первых delta-событий.
- [x] Rollback по feature flags без code revert.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.

## Evidence

- `docs/plans/completed/2026-04-06_RTC_STABILITY_HARDENING_PLAN.md`
- `docs/status/feature-log/2026-03-06.md`
- `docs/status/feature-log/2026-03-07.md`
- `docs/status/test-results/2026-03-26.md`
