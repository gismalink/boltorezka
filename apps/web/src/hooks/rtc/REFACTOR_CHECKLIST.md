# Чеклист Рефакторинга RTC

Цель: сохранить предсказуемость RTC runtime при glare/reconnect/нагрузке и параллельно снизить сложность поддержки за счет модульности и тестов.

## Завершенная База

- [x] Политика офферов вынесена в `voiceCallOfferPolicy.ts`.
- [x] Флаги/состояние negotiation вынесены в `voiceCallNegotiationState.ts`.
- [x] Удален legacy compatibility re-export слой из `hooks/*`.
- [x] Жизненный цикл peer context (create/dispose) вынесен в `voiceCallPeerLifecycle.ts`.
- [x] Восстановление peer (reconnect/stats) вынесено в `voiceCallPeerRecovery.ts`.
- [x] Локальные media constraints/acquisition/attach вынесены в `voiceCallLocalMedia.ts`.
- [x] Синхронизация room targets и resync timer вынесены в `voiceCallTargetSync.ts`.
- [x] Dispatch слоя сигналов вынесен в `voiceCallSignalDispatch.ts`.
- [x] Жизненный цикл peer map вынесен в `voiceCallPeerRegistry.ts`.
- [x] Общий helper поиска RTP sender вынесен в `voiceCallUtils.ts`, дубли удалены.

## Оставшийся Рефакторинг

- [x] Внутренности `startOffer` в `useVoiceCallRuntime.ts` разделены на этапы:
  - [x] preflight checks
  - [x] создание local description и отправка
  - [x] post-send bookkeeping/metrics
- [x] Вынести обработку очереди candidates из `useVoiceCallRuntime.ts` в отдельный helper/модуль.
- [x] Укрупнить связанные media effects в `useVoiceRuntimeMediaEffects.ts`, чтобы уменьшить overlap:
  - [x] синхронизация audio track/device
  - [x] синхронизация video track/effects
- [x] Добавить документацию по переходам в `voiceCallNegotiationState.ts` (жизненный цикл флагов и ожидаемый порядок).

## Оптимизация И Усиление Надежности

- [x] Сделан устойчивый flush pending ICE (обработка частичных ошибок через `Promise.allSettled`).
- [x] Добавлен ограниченный размер очереди `pendingRemoteCandidates` во входящем ICE пути (`voiceCallSignalHandlers.ts`).
- [x] Добавлены per-reason cadence buckets в `voiceCallOfferPolicy.ts`/runtime, чтобы `video-sync` не блокировал manual recovery.
- [x] Добавить структурированные offer lifecycle логи (`created`, `sent`, `settled`, `failed`) в `useVoiceCallRuntime.ts`.
- [x] Добавить трассировку glare-решений в `voiceCallSignalHandlers.ts` (`ignore` vs `rollback` с peer IDs).

## Расширение Тестового Покрытия

- [x] Создан `voiceCallOfferPolicy.test.ts`.
- [x] Создан `voiceCallPeerRecovery.test.ts`.
- [x] Создан `voiceCallSignalHandlers.test.ts` (glare, rollback, nack handling).
- [x] Создан `voiceCallPeerConnectionHandlers.test.ts` (ICE/state/track events).
- [x] Создан `voiceCallLocalMedia.test.ts` (constraints/device paths/failures).
- [x] Создан `voiceCallPeerRegistry.test.ts` (status derivation/create/close).
- [x] Создан `voiceCallTargetSync.test.ts` (target add/remove/resync timer).
- [x] Создан `voiceCallUtils.test.ts` (candidate parse + ICE gather settle behavior).
- [x] Создан `voiceCallPeerLifecycle.test.ts` (context create/dispose cleanup).
- [x] Создан `useVoiceRuntimeMediaEffects.test.ts` (watchdog/device/effects sync).

## Усиление Smoke/Deploy

- [x] Улучшить ожидание событий в `scripts/smoke/smoke-realtime.mjs` (adaptive polling/backoff).
- [x] Добавить опциональный строгий режим порога `OfferRateLimited` для race-сценариев.
- [ ] Добавить явные ICE relay assertions в 3-way smoke сценарий.
- [ ] Добавить опциональный extended postdeploy smoke gate в `scripts/deploy/postdeploy-smoke-test.sh`.

## Валидационные Гейты

- [x] `apps/web`: `npm run build`
- [x] `apps/web`: `npm run test`
- [x] `scripts/smoke`: `node --check scripts/smoke/smoke-realtime.mjs`
- [x] test deploy: `TEST_REF=origin/feature/video-stream-investigation npm run deploy:test:smoke`
- [x] явный 3-way smoke:
  - [x] `set -a; source .deploy/smoke-auth.env; set +a`
  - [x] `SMOKE_CALL_SIGNAL=1 SMOKE_CALL_RACE_3WAY=1 SMOKE_CALL_CAMERA_TOGGLE_RECONNECT=1 SMOKE_RECONNECT=1 npm run smoke:realtime`

## Примечания По Верификации

- Server-side валидация завершена `2026-03-05` в `~/srv/boltorezka` для `origin/feature/video-stream-investigation`.
- Результат явного 3-way smoke: `race3WayOk=true`, `race3WayReconnectOk=true`, `cameraToggleReconnectOk=true`.
- Область работ остается только `test`; `prod` вне scope до явного подтверждения.
