# Большой Чек-Лист Перехода К Целевой Voice/Video Модели
Скил - .github/skills/gitops/SKILL.md
Дата: 2026-03-08  
Контур по умолчанию: `test` (prod только после явного подтверждения)

Статусы ниже проставлены по текущему состоянию кода/доков на ветке `feature/video-stream-investigation`.

Decision note (2026-03-08): живые проверки подтверждают стабильный voice path (audio OK). Остаточные проблемы camera stream visibility в mixed-device сценариях переведены в целевой SFU track и не блокируют текущий pre-SFU hardening.
Strategy update (2026-03-08): принят курс `SFU-first` - сначала полный переход на SFU media-plane, затем полная фаза тестирования и отладки voice/video на новом baseline.
Validation note (2026-03-08): GitOps test rollout `deploy:test:sfu` на SHA `b5d5bc1` прошел `SMOKE_STATUS=pass`, включая strict `smoke:realtime:media` (targeted signaling, relay/udp selected, one-way incidents = 0).
Validation note (2026-03-08): подтверждена серия из 3 подряд зеленых `deploy:test:sfu` на SHA `152d11b` (`SMOKE_STATUS=pass`, `SMOKE_REALTIME_MEDIA_STATUS=pass`).
Validation note (2026-03-08): устранен TLS-cert volume mismatch для TURN (`edge_caddy_data` вместо пустого `ingress_caddy_data`); после этого `deploy:test:sfu` на SHA `0c0b8af` зеленый, а изолированный `turns`-only media smoke проходит без `iceCandidateError 701`.
Validation note (2026-03-08): в postdeploy добавлен обязательный TURN TLS handshake gate (`SMOKE_TURN_TLS_STATUS`), проверка подтверждена на SHA `d87a829` (`turn_tls=pass`).
Validation note (2026-03-08): ручная проверка voice успешна на 3 устройствах, включая 1 устройство из мобильной сети; checkpoint tags: `checkpoint-sfu-interim-working-2026-03-08`, `release-candidate-sfu-test-2026-03-08`.

## 0) Базовые инварианты (обязательно)

- [x] Все изменения идут через git + GitOps, без ручных правок на сервере.
- [x] Любой rollout сначала в `test`.
- [x] Перед `prod` есть актуальный smoke в `test`.
- [x] `prod` деплоится только из `main` после merge feature-ветки.
- [x] Серверный репозиторий clean перед deploy (`git status` чистый).
- [x] Используется `pull --ff-only` в deploy-процессе.
- [x] В `index.html` отключен долгий cache (`no-store/no-cache`).
- [x] Hash-ассеты кэшируются как `immutable`.
- [x] Единый build version (git SHA) прокинут в frontend и backend.
- [x] Клиентская проверка version mismatch включает auto-reload/refresh path.

## 1) TURN/Сеть (capacity baseline)

- [x] TURN диапазон relay-портов по умолчанию: `30000-31000` (1001 порт).
- [x] Проверено совпадение диапазона в compose и `.env.host`.
- [x] Postdeploy smoke валидирует размер relay диапазона (`SMOKE_EXPECT_TURN_RANGE_SIZE=1001`) и падает при регрессии.
- [ ] На роутере/NAT проброшены UDP/TCP `30000-31000` + `3478` + `5349`.
- [ ] DNS и public IP для TURN актуальны (`TURN_EXTERNAL_IP`, домен/cert).
- [ ] TLS cert для `turns` валиден и не истекает в ближайшее окно релиза.
- [ ] `turns:5349?transport=tcp` работает из внешней сети.
- [ ] Проверен fallback `turn:3478?transport=tcp`.
- [ ] Проверен fallback `turn:3478?transport=udp`.
- [x] Нет `508 Cannot create socket` в нормальном тестовом профиле (подтверждено strict-by-default SFU smoke rollout'ами на `e49ccc4`).
- [ ] Метрика отказов allocation вынесена в операционный мониторинг.

## 2) Control Plane Контракты (API/WS)

- [x] Контракт `mediaTopology` стабилен и детерминирован.
- [x] Приоритет topology routing: `SFU_USERS` -> `SFU_ROOMS` -> `DEFAULT`.
- [x] `call.initial_state` содержит полную и непротиворечивую snapshot-модель.
- [x] Для late-join состояния участников/камер/микрофонов приходят консистентно.
- [x] WS rate-limit не ломает восстановление сессии.
- [x] Для `call.offer`/`call.answer`/`call.ice` `targetUserId` обязателен; room-wide broadcast call-сигналов запрещен.
- [x] Для `call.offer`/`call.answer`/`call.ice` включена transport-level идемпотентность (server dedupe по `requestId` + client-side защита от повторного применения).
- [x] Relay payload для `call.*` содержит корреляционные поля (`requestId`, `sessionId`, `traceId`) для сквозной диагностики.
- [x] Коды ошибок разделены: auth/permissions/topology/transport.
- [x] Ошибки коррелируются по `roomId`, `userId`, `sessionId`, `traceId`.
- [ ] Нет утечки приватных данных в WS payload и логи.

## 3) WebRTC Runtime Стабильность (клиент)

- [x] Есть periodic target reconciliation в connected-состоянии.
- [x] stale peer (disconnected) автопересоздается.
- [x] stale peer (connected без remote media) автопересоздается.
- [x] Offer churn ограничен антифлуд-политикой.
- [x] Reconnect имеет backoff и cap по попыткам.
- [x] `offer/answer` отправляются с `ack` tracking и bounded retry/backoff (не только `ICE`).
- [ ] Не возникает endless renegotiation loop.
- [ ] ICE restart path покрыт e2e smoke.
- [ ] При временной деградации сети сессия восстанавливается без ручного reload.
- [ ] Потеря WS в окне negotiation (`offer sent -> answer apply`) восстанавливается автоматически.
- [x] Локальные mute/camera toggles не триггерят лишние renegotiation.
- [x] Поток state-событий имеет идемпотентную обработку.

## 4) UI/UX Инварианты Для Камер

- [x] Отображение camera window привязано к статусу пользователя, а не к факту stream.
- [x] Если статус камеры `on`, но stream еще не приехал, показывается placeholder `Waiting for stream`.
- [x] Если статус камеры `off`, окно скрывается.
- [x] Призрачные окна отсутствуют (статусы чистятся по room presence).
- [x] При rejoin не остается stale карточек пользователей.
- [ ] Сетка камер стабильна при 3+ участниках и быстрых toggle (deferred: закрываем в полном SFU rollout).
- [ ] На mobile и desktop одинаковая логика видимости.

## 5) Observability И Диагностика

- [x] Для каждой сессии собираются setup/reconnect/fail counters.
- [x] Есть отдельные метрики one-way-audio и one-way-video.
- [x] Логируются ключевые RTC этапы: offer/answer/ice/connected/failed.
- [x] Есть разрез метрик по topology (`p2p`/`sfu`).
- [x] Есть разрез по сети (`udp`/`tcp`/`tls relay`).
- [x] RTC-логи маскируют candidate IP/port и приватные данные; raw candidate logging включается только debug-флагом (`WS_CALL_DEBUG_RAW_ICE=1`).
- [ ] Есть SLO-дэшборд: setup success, reconnect success, median join time.
- [ ] Настроены алерты на деградацию (rolling 5m/30m windows).
- [x] В runbook есть единый triage flow для инцидентов.

## 6) Тестовая Матрица (ручная + автоматическая)

- [ ] 1:1 desktop-desktop стабильность.
- [ ] 1:1 desktop-mobile стабильность.
- [ ] 3-way mixed devices (Mac + iPhone + Android/другой desktop).
- [ ] 4-6 участников с активными камерами и mute/unmute циклом.
- [ ] Late join/leave в активной комнате без рассинхрона.
- [ ] Переключение Wi-Fi -> LTE -> Wi-Fi без потери room state.
- [x] Проверка relay-only профиля (`iceTransportPolicy=relay`).
- [ ] Проверка mixed профиля (`all`) с приоритетом direct path.
- [x] Негативный контрактный тест: `call.*` без `targetUserId` отклоняется (`ValidationError`) и не релеится в комнату.
- [x] Тест идемпотентности `call.*`: дубликаты `offer/answer/ice` не вызывают повторного применения сигналов.
- [x] Тест устойчивости: WS reconnect в фазе negotiation не оставляет сессию в подвешенном состоянии.
- [x] Smoke на каждой test-выкатке (`deploy:test:smoke`).
- [x] Набор regression тестов для stale-peer recovery и offer policy.

## 7) SFU Эволюция До Целевой Модели

- [ ] Зафиксирован выбор SFU media-plane (LiveKit/mediasoup/Janus) с ADR.
- [x] Определен контракт интеграции SFU с текущим control plane.
- [x] Описан lifecycle: `join`, `publish`, `subscribe`, `leave`, `reconnect`.
- [ ] Определены лимиты комнат и adaptive policies на клиентах.
- [x] Реализован test-only dark launch SFU.
- [x] Введен room-level и user-level canary routing.
- [ ] Поднят shadow telemetry для сравнения P2P vs SFU.
- [x] Сформирован rollback без code revert (только конфиг/toggle).
- [x] Подготовлены playbook для частичных деградаций SFU.
- [ ] Достигнут критерий: SFU path не хуже P2P по setup/reconnect.
- [ ] Полный переход всех voice/video сессий на SFU завершен (без fallback на legacy P2P в штатном профиле).
- [ ] Решение `SFU-first` зафиксировано в ADR/runbook: глубокая voice отладка выполняется только после переключения baseline на SFU.

## 8) Безопасность И Надежность

- [ ] TURN credentials ротируются по расписанию.
- [ ] Нет захардкоженных секретов в репозитории.
- [x] JWT/SSO flow не использует `?token=` в URL callback.
- [x] Return URL проходит только через validated `state`.
- [x] Ограничены allowed origins/hosts для test/prod.
- [ ] Нагрузочные лимиты и anti-abuse меры задокументированы.

## 9) Release Readiness Gate Перед Prod

- [x] Минимум 3 последовательных зелёных test rollout + smoke.
- [ ] Нет критичных инцидентов в последние 48 часов.
- [x] Подготовлен release summary с метриками и рисками.
- [x] Rollback команда и ответственный подтверждены.
- [ ] Smoke-чеклист для prod готов до старта окна релиза.
- [ ] Принято явное подтверждение на `prod` rollout.

## 10) Post-Deploy Контроль

- [x] `docker compose ps` показывает все сервисы `Up`.
- [x] Логи API/TURN без критичных ошибок за первые 15-30 минут.
- [ ] Smoke `test`/`prod` проходит полностью.
- [ ] Мониторинг подтверждает отсутствие регрессий SLO.
- [x] Заполнен release log и postmortem-note (если были аномалии).

## 11) Реализация (текущий спринт)

- [x] S1. Зафиксировать 1001 relay-порт в `infra/docker-compose.host.yml`.
- [x] S2. Добавить fail-fast проверку размера TURN диапазона в `scripts/deploy/postdeploy-smoke-test.sh`.
- [x] S3. Добавить разрез telemetry по transport (`udp`/`tcp`/`tls relay`) в smoke summary (`SMOKE_REALTIME_MEDIA=1` в postdeploy).
- [x] S4. Добавить отдельные one-way-audio/one-way-video счетчики и включить в test gate (`SMOKE_REALTIME_MEDIA=1`, `SMOKE_FAIL_ON_ONE_WAY=1`).
- [x] S5. Обновить runbook evidence после живого multi-device прогона (Mac + iPhone + desktop): audio path OK; остаточные camera stream issues перенесены в SFU track.

## 12) Краткий План Исполнения (рекомендуемая последовательность)

1. Завершить полный rewrite voice/video на SFU media-plane и убрать зависимость от legacy P2P в штатном пути.
2. Закрыть control-plane контракты под SFU baseline (обязательный `targetUserId`, идемпотентность `call.*`, correlation IDs, `ack/retry` для SDP).
3. Зафиксировать post-rewrite baseline в `test` и включить shadow telemetry/SLO сигналы.
4. Провести полную матрицу тестирования и отладки voice/video уже на SFU (включая reconnect, mixed devices, relay-only/mixed профили).
5. Подтвердить критерии качества, rollback readiness и отсутствие критичных инцидентов.
6. Подготовить prod decision package и выполнить rollout только после явного approve.
