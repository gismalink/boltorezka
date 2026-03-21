# План Миграции SFU (Decision Package)

Status: Completed (historical decision package, archived 2026-03-21)

Дата: 2026-03-07  
Дата актуализации: 2026-03-09
Статус: Stage 0-3 (current SFU profile) завершены в test; LiveKit Stage A-D в работе

Execution reference:
- `docs/plans/2026-03-06_SFU_STAGE0_EXECUTION_PLAN.md`
- `docs/plans/2026-03-08_TARGET_MODEL_CHECKLIST.md`
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`
- `docs/runbooks/SFU_STAGE2_CANARY_RUNBOOK.md`
- `docs/runbooks/SFU_STAGE3_DEFAULT_SFU_TEST_RUNBOOK.md`
- `docs/runbooks/SFU_STAGE4_PROD_READINESS_PACKAGE.md`

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
- Решение: выбран как migration pattern.

Вариант C: полный переход на SFU-only
- Плюсы: единая media-топология и предсказуемое поведение для больших комнат.
- Минусы: максимальный риск миграции и blast radius.
- Решение: отложен до стабилизации `LiveKit` baseline в test.

Принятое уточнение (2026-03-09):
- Целевой внешний SFU media-plane: `LiveKit` (self-hosted).
- Текущий встроенный SFU routing profile используется как промежуточный baseline и rollback path.

Историческая коррекция:
- Ранее отложенный выбор внешнего SFU движка (LiveKit/mediasoup/Janus) не имел зафиксированного архитектурного обоснования и рассматривается как временное тактическое решение периода стабилизации.
- Текущее решение (LiveKit как target) фиксирует возврат к исходной целевой модели с явными gate и rollback-планом.

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

Переходный контур (завершен):
- Stage 0-3 для текущего SFU profile в test завершены (dark launch/canary/default-sfu-test).

LiveKit контур (целевой):

Stage A: LiveKit foundation в test
- Развернуть LiveKit в test по GitOps.
- Зафиксировать env/ports/TLS и health-check в runbook.
- Подготовить rollback: отключение `mediaTopology=livekit` без code revert.

Stage B: Control-plane интеграция
- Реализовать server-side token minting (room/user scoped grants, TTL, trace fields).
- Добавить adapter lifecycle: `join`, `publish`, `subscribe`, `leave`, `reconnect`.
- Сохранить correlation IDs и idempotency требования в signaling.

Stage B status update (2026-03-09):
- Базовый token minting endpoint внедрен: `POST /v1/auth/livekit-token` (auth required, room access check, TTL grants, audit log fields).
- Следующий шаг Stage B: подключить `mediaTopology=livekit` transport adapter в runtime signaling flow.

Stage C: Canary и сравнение
- Включить `mediaTopology=livekit` для выбранных room/user в test.
- Сравнить `setup/reconnect/one-way incidents` против current SFU baseline.
- Обновить smoke/postdeploy gates для LiveKit path.

Stage C status update (2026-03-09):
- Добавлен автоматизированный compare gate `smoke:compare:sfu-livekit` (`scripts/smoke/compare-sfu-livekit-baseline.sh`).
- В `test` выполнен baseline compare на SHA `8b996e8`, артефакт: `~/srv/boltorezka/.deploy/compare-sfu-livekit-20260309T085858Z.md`.
- Результат: `sfu-current=pass`, `livekit-topology=pass`, livekit signaling guard `pass` (`LiveKitSignalingDisabled`).

Stage D: Default LiveKit в test -> prod readiness
- Перевести `test` default routing на `livekit` при выполнении quality gates.
- Сформировать pre-prod decision package с evidence и rollback drills.
- В `prod` только после явного approve и smoke от `main`.

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
- LiveKit artifacts: token minting audit logs + `compare-sfu-livekit-<timestamp>.md`.

## 11) Канонические ссылки

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/PHASE0_MVP_ADR.md`
- `docs/runbooks/VOICE_BASELINE_RUNBOOK.md`
- `docs/runbooks/SFU_STAGE1_DARK_LAUNCH_RUNBOOK.md`
- `docs/status/RTC_STABILITY_ROADMAP.md`

## 12) Archive note

- План закрыт как decision-package документ переходного периода.
- Итоговый runtime baseline зафиксирован как `livekit-only` в `docs/architecture/PHASE0_MVP_ADR.md` и закрыт чеклистом `docs/plans/completed/2026-03-09_LIVEKIT_FULL_TRANSITION_CHECKLIST.md`.
- Дальнейший operational tracking ведется через runbooks и `docs/status/test-results/*`.
