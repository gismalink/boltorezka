# План Миграции SFU (Decision Package)

Дата: 2026-03-06  
Статус: Утвержден и переведен в исполнение (Stage 0 запущен 2026-03-06)

Execution reference:
- `docs/architecture/SFU_STAGE0_EXECUTION_PLAN.md`

## 1) Цель

Документ определяет, когда и как Boltorezka должна перейти от текущего P2P/TURN baseline к SFU-топологии: с измеримыми входными gate, политикой отката и поэтапным rollout.

## 2) Текущий baseline и ограничения

Текущий media baseline:
- Топология: WebRTC P2P + TURN relay-first.
- Hardening signaling/runtime: Phase 6.1-6.3 завершены.
- Toggle'ы controlled rollout (Phase 5):
  - `RTC_FEATURE_INITIAL_STATE_REPLAY`
  - `VITE_RTC_FEATURE_INITIAL_STATE_REPLAY`
  - `VITE_RTC_FEATURE_NEGOTIATION_MANAGER_V2`
  - `VITE_RTC_FEATURE_OFFER_QUEUE`

Наблюдаемые ограничения, требующие SFU-ready планирования:
- Сценарии 3-way race/live-room не находятся под strict-gate и могут оставаться нестабильными в текущем P2P-поведении.
- Сложность P2P растет нелинейно с размером комнаты, reconnect churn и смешанным качеством сети.
- Camera convergence и late-join consistency уже защищены gate, но масштабирование по-прежнему зависит от client-side mesh state.

## 3) Матрица решений

Вариант A: оставить только P2P
- Плюсы: минимальная немедленная стоимость реализации.
- Минусы: ограниченная масштабируемость комнат, рост сложности reconnect/signaling.
- Решение: отклонен как долгосрочный путь.

Вариант B: гибридная топология (P2P по умолчанию, SFU для больших комнат)
- Плюсы: безопасная миграция, сохраняет эффективность малых комнат, снижает риск.
- Минусы: сложность routing/control и двойная нагрузка на тестирование.
- Решение: выбран.

Вариант C: полный переход на SFU-only
- Плюсы: единая media-топология и предсказуемое поведение для больших комнат.
- Минусы: максимальный риск миграции и blast radius.
- Решение: отложен.

## 4) Входные gate для старта SFU-реализации

Работы по реализации стартуют, когда в test-контуре одновременно выполняются все условия:
1. Минимум 3 подряд успешных прогона `deploy:test:smoke` с включенным replay gate.
2. Отсутствие регрессий в smoke-assertions по `call.initial_state`.
3. Reconnect path остается стабильным (`call_reconnect_joined` наблюдается без критичных ошибок).
4. Нет активного rollback через Phase 5 feature toggles в течение 48 часов после последних RTC-изменений.

## 5) Целевая архитектура (гибрид)

Control plane:
- Текущий `boltorezka-api` остается источником истины для auth, room membership и signaling authorization.

Media routing:
- Добавить SFU-сервис как media plane для комнат выше порога.
- Сохранить TURN как fallback для ограниченных сетей.

Политика комнат:
- Малые комнаты: сохраняем P2P path.
- Большие/нестабильные комнаты: маршрутизируем через SFU.
- Routing decision должен быть детерминированным и отражаться в metadata room/session.

## 6) Этапы миграции

Stage 0: Готовность и контракты
- Определить SFU session contract (`join`, `publish`, `subscribe`, `leave`) и capability envelope для клиентов.
- Расширить схему observability SFU-специфичными метриками.

Stage 1: Dark launch в test
- Развернуть SFU только в test.
- Сохранить P2P как default.
- Ввести room-level switch `mediaTopology=sfu|p2p` в test tooling.

Stage 2: Canary-комнаты
- Включить SFU только для выбранных внутренних комнат/пользователей.
- Сравнить setup success, reconnect quality и camera consistency с P2P baseline.

Stage 3: Гибрид по умолчанию в test
- Автомаршрутизация комнат выше порога в SFU.
- Сохранить ручной rollback на P2P path.

Stage 4: Production readiness package
- Продвижение в prod только из `main` и только по явному подтверждению.
- Включить финальные evidence по rollout/rollback runbook.

## 7) Критерии успеха

Жесткие критерии:
- Realtime smoke остается зеленым при strict replay gate.
- Доля успешного call setup не деградирует относительно текущего baseline.
- Reconnect stability улучшается в многопользовательских сценариях.
- В canary-период не растет частота severe-инцидентов.

Операционные критерии:
- Четкий on-call triage flow для классов SFU-ошибок.
- Rollback выполняется без code revert.

## 8) Политика rollback

Операционные thresholds и пошаговый rollback flow зафиксированы в:
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`

Примеры триггеров rollback:
- устойчивая деградация call setup,
- reconnect failures выше порога,
- severe media one-way-audio/video incidents.

Действия rollback:
1. Отключить SFU room routing для test/prod контура.
2. Принудительно вернуть P2P path для новых сессий.
3. По возможности сохранить активные сессии до disconnect, затем rejoin на P2P.
4. Сохранить метрики и timeline инцидента для postmortem.

## 9) Риски и mitigation

Риск: сложность dual-topology.
- Mitigation: единый канонический источник routing decision и явные telemetry labels.

Риск: несовместимость client version во время rollout.
- Mitigation: сохранить version compatibility checks и cache/version smoke gates.

Риск: операционная нагрузка.
- Mitigation: поэтапный rollout с test-first политикой и scripted smoke enforcement.

## 10) Ответственность и evidence

Ответственные:
- Realtime/API: backend owner.
- WebRTC runtime: web owner.
- Deploy/runbook: operations owner.

Источники evidence:
- `docs/status/FEATURE_LOG.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- `docs/operations/SMOKE_CI_MATRIX.md`
- postdeploy summary и снапшоты Redis `ws:metrics:<day>`.

## 11) Канонические ссылки

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/PHASE0_MVP_ADR.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`
- `docs/status/RTC_STABILITY_ROADMAP.md`
