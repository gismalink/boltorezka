# План: Chat Attachments v2 (all formats, multi-file, progress, retention)
Date: 2026-05-05
Scope: Расширение вложений чата для room chat и DM: множественные файлы, отображение прогресса/формата, лимит до 1GB, pre-send удаление вложений, политика backup/retention для больших файлов, единый конфиг лимитов и медиа-политик.

## 0) Контекст

- Текущий upload flow уже есть: init -> object PUT -> finalize.
- Сейчас в web composer одновременно поддерживается только один pending file/image.
- На backend есть серверные лимиты и allowed MIME через env-конфиг.
- Есть отдельные настройки chat image policy (max side, quality, max data URL), но они разнесены по разным местам.
- Нужны новые требования продукта:
  - поддержка всех форматов файлов (в рамках конфигурируемого allowlist);
  - мультизагрузка (больше одного файла за раз);
  - прогресс загрузки и отображение формата файла;
  - удаление вложений до отправки сообщения;
  - лимит размера до 1GB;
  - backup не должен включать файлы больше 25MB;
  - файлы больше 25MB должны храниться только 7 дней;
  - все ключевые лимиты должны быть вынесены в единый конфиг.
  - для DM нужен отдельный режим передачи файла ("передать", не attachment), без постоянного хранения файла на сервере.

## 1) Цели

- Реализовать стабильный upload UX для multi-file вложений с визуальным прогрессом по каждому файлу.
- Ввести централизованный конфиг лимитов (chat image policy + file upload/retention/backup thresholds).
- Обеспечить операционные гарантии:
  - файлы >25MB автоматически удаляются через 7 дней;
  - backup flow не включает файлы >25MB.
- Сохранить совместимость существующего API/сообщений и не ломать текущие вложения.
- Добавить DM P2P file transfer (single-file per transfer session) с явным accept flow и отдельной нижней панелью сессий.

## 2) Workstreams

### 2.1 Backend API и модель данных

- [x] Расширить контракт upload/finalize для пакетного сценария (батч attach перед send) без ломки одиночного режима.
- [x] Ввести в metadata вложения признак класса размера (`small` <=25MB, `large` >25MB) и `expiresAt` для large.
- [x] Добавить server-side валидацию размера до 1GB (через конфиг), единый код ошибок для oversize.
- [ ] Уточнить определение типа вложения: не ограничивать продукт до image/document/audio, хранить MIME и category вычислять отдельно для UI.
- [ ] Сохранить обратную совместимость выдачи attachments для уже существующих сообщений.

### 2.2 Frontend composer UX

- [x] Перевести composer с single pending attachment на список pending attachments.
- [x] Добавить multi-select и drag/drop нескольких файлов за раз.
- [x] Для каждого pending файла показывать:
  - имя;
  - MIME/формат;
  - размер;
  - статус (`queued`, `uploading`, `uploaded`, `failed`);
  - прогресс (0-100%).
- [x] Разрешить удаление любого pending файла до отправки.
- [x] Отправка сообщения должна прикладывать все успешно загруженные вложения одним action.
- [x] Обработать частичные ошибки: часть файлов загрузилась, часть нет (clear UX и retry).

### 2.2.1 Composer panel redesign (переверстка под референс)

- [x] Переверстать панель отправки сообщений под референсный макет (из скриншота):
  - блок панели внизу с усиленным blur/overlay эффектом;
  - отдельная строка предпросмотра pending-вложений над полем ввода;
  - chips вложений с типом (`.jpg`, `.doc`), размером и кнопкой удаления (`x`);
  - слева компактная кнопка attach/clip;
  - справа круглая кнопка send (floating внутри панели);
  - multiline input с корректным auto-grow и без наезда на chips.
- [x] Сохранить текущую семантику и hotkeys (`Enter` отправка, `Shift+Enter` перенос), не ломая существующий flow.
- [x] Добавить адаптив для mobile/desktop:
  - mobile: chips не перекрывают input, горизонтальный скролл chips при переполнении;
  - desktop: стабильные отступы, фиксированная зона кнопок attach/send.
- [x] Обеспечить доступность (a11y):
  - фокус-стили на chips/buttons;
  - клавиатурное удаление выбранного attachment;
  - aria-label для кнопок удаления/attach/send.
- [x] Не ломать текущие data-agent-id/селекторы для browser smoke (если используются в composer).

### 2.3 Upload transport и прогресс

- [x] Перейти на transport с upload progress callback для object PUT (XHR/fetch+stream, где поддерживается).
- [x] Добавить retry-политику для network ошибок upload (без дублирования finalize).
- [x] Гарантировать идемпотентность finalize в multi-file сценарии.
- [x] Добавить client telemetry по этапам upload (init/put/finalize, latency, failure code).

### 2.4 Конфигурация лимитов (единый конфиг)

- [x] Создать отдельный конфиг-модуль для chat/media ограничений (не смешивать с разрозненными константами).
- [x] Перенести туда текущие chat image policy параметры.
- [x] Добавить новые параметры:
  - `CHAT_UPLOAD_MAX_SIZE_BYTES` (по умолчанию 1GB);
  - `CHAT_LARGE_FILE_THRESHOLD_BYTES` (25MB);
  - `CHAT_LARGE_FILE_RETENTION_DAYS` (7);
  - `CHAT_BACKUP_MAX_FILE_SIZE_BYTES` (25MB);
  - allowlist MIME/расширений.
- [x] Обеспечить согласованность web + api + ops (одни и те же значения по умолчанию и документация).
  - прогресс: API foundation сделан (единый `chat-media-config` + admin policy читает те же значения).
  - прогресс: в host env/compose добавлены `CHAT_LARGE_FILE_THRESHOLD_BYTES`, `CHAT_LARGE_FILE_RETENTION_DAYS`, `CHAT_BACKUP_MAX_FILE_SIZE_BYTES` для test/prod.
  - прогресс: image policy (`CHAT_IMAGE_*`) явно прокинута в test/prod compose с defaults, синхронизированными с web/api.

### 2.5 Retention и cleanup

- [ ] Реализовать плановый cleanup job для large-файлов по `expiresAt` (удаление объекта + cleanup ссылок).
- [x] Добавить dry-run режим и отчетность cleanup (сколько найдено/удалено/ошибок).
- [x] Добавить метрики retention cleanup и алерты на рост ошибок удаления.

### 2.6 Backup политика файлов

- [ ] Зафиксировать отдельный file-backup flow для chat objects (если включен в окружении).
- [ ] Добавить жесткий фильтр: backup включает только файлы <=25MB.
- [ ] Проверить, что текущие DB backup scripts не затрагивают object storage файлы.
- [ ] Обновить scheduler job/env и runbook с явным описанием порога 25MB.

### 2.7 Документация и rollout

- [ ] Обновить contracts и API docs по новому multi-file flow.
- [x] Обновить ops runbooks: upload limits, retention cleanup, backup filter.
- [ ] Добавить migration note для уже существующих вложений и rollback steps.

### 2.8 DM P2P transfer (без хранения файла на сервере)

- [ ] Ввести новый тип действия в DM: `file_transfer.offer` (не attachment сообщения).
- [ ] Передача одного файла за одну сессию transfer:
  - отправитель выбирает файл и отправляет offer;
  - получатель нажимает `Принять`;
  - получатель выбирает путь сохранения;
  - после подтверждения стартует передача.
- [ ] Реализовать сигналинг через существующий realtime канал, payload только metadata/control (без file body).
- [ ] Передачу данных делать через WebRTC DataChannel (P2P), с fallback на relay (TURN) при невозможности прямого канала.
- [ ] Не сохранять передаваемый файл в object storage; сервер участвует только в сигналинге/relay трафика.
- [ ] Добавить контроль целостности (checksum) и статус завершения.

#### 2.8.1 UX: новая нижняя панель передачи в DM (по референсу)

- [ ] В DM добавить отдельную нижнюю панель под composer (`p2p transfer rail`), не смешивая с attach chips.
- [ ] Содержимое панели:
  - слева индикатор активных сессий (`P2P-<count>`);
  - карточки transfer-сессий с filename, размером, статусом и прогрессом;
  - action-кнопки по состоянию: `Accept`, `Decline`, `Cancel`, `Retry`, `Open folder`.
- [ ] Статусы карточек:
  - `waiting for accept`, `accept?`, `preparing`, `transferring`, `paused`, `failed`, `transferred`, `canceled`.
- [ ] Для входящего offer перед стартом показывать confirm и безопасные file metadata (name/size/type/sender).
- [ ] Desktop-first UX: диалог выбора пути сохранения перед стартом потока.
- [ ] Mobile/web fallback: если прямой выбор пути недоступен, использовать download flow с системным сохранением.

#### 2.8.2 Техническая реализация (этапы)

- [ ] MVP (DM only):
  - single-file transfer;
  - online-to-online;
  - без resume, с базовым retry на handshake.
- [ ] Hardening:
  - chunked transfer + backpressure;
  - resume from offset после обрыва;
  - rate limiting и timeout политики;
  - метрики длительности/ошибок/успешности.
- [ ] Security:
  - anti-spam/rate limits на offers;
  - лимиты concurrent transfer per user/DM;
  - валидация metadata и безопасный рендер filename.
- [ ] Out of scope для первой версии:
  - group one-to-many fan-out transfer;
  - offline delivery;
  - multi-file в одной transfer-сессии.

## 3) Приоритеты

1. P0: Backend+Frontend multi-file upload с прогрессом и pre-send удалением.
2. P0: Единый конфиг лимитов + лимит 1GB.
3. P1: Retention cleanup для >25MB (7 дней).
4. P1: Backup policy для файлов <=25MB.
5. P1: DM P2P transfer rail + single-file direct transfer.
6. P2: Расширенная observability и отчеты.

## 4) Acceptance criteria

- [x] Пользователь может выбрать и прикрепить более одного файла за раз.
- [x] До отправки сообщения можно удалить любой pending файл.
- [x] В UI видны формат файла и прогресс загрузки по каждому файлу.
- [x] Панель отправки визуально и структурно соответствует референсу (chips над input, attach слева, send справа, clean spacing).
- [x] При большом количестве вложений панель не ломает layout и остается кликабельной на mobile/desktop.
- [ ] Сервер принимает файлы до 1GB и корректно отклоняет больше лимита.
- [ ] Файлы >25MB автоматически получают TTL 7 дней и удаляются cleanup job.
- [ ] Backup flow не включает файлы >25MB.
- [x] Все лимиты вынесены в единый конфиг и задокументированы.
- [x] Smoke test для test/prod проходит без регрессий отправки сообщений и вложений (test validated; desktop update feed шаг отдельно с known issue).
- [ ] В DM доступен новый action `Передать файл` (не attachment).
- [ ] Получатель подтверждает прием и выбирает путь сохранения до старта передачи.
- [ ] В DM нижняя панель передачи отображает активные/завершенные transfer-сессии и их статусы.
- [ ] Файл не сохраняется в server object storage; transfer работает через signaling + p2p/relay.

## 5) Ограничения выполнения

- Все rollout изменения сначала только в `test`.
- До выполнения acceptance в `test` изменения не переходят в `prod`.
- Изменения API делаются с обратной совместимостью (single-file старый клиент не ломается).
- Cleanup/backup задачи для удаления объектов запускаются сначала в dry-run.
- P2P transfer сначала выкатывается только для DM и только под feature-flag.

## 6) План выполнения (этапы)

1. Stage A: Design/Contracts
- Утвердить формат batch attachments и lifecycle статусы.
- Зафиксировать unified config schema.

2. Stage B: Backend foundation
- Лимиты 1GB, metadata size-class/expiresAt, finalize для batch.
- Метрики и коды ошибок.

3. Stage C: Frontend composer v2
- Multi-file queue, progress UI, pre-send remove, partial error handling.
- Composer panel redesign под референс + responsive/a11y pass.

4. Stage D: Retention + backup policy
- Cleanup large files (>25MB, 7 дней), backup фильтр <=25MB.

5. Stage E: Test rollout
- Deploy в test, e2e smoke + ручные сценарии (1 файл, N файлов, 1GB-1 byte, >1GB, mixed успех/ошибки).

Status: completed for current scope (batch finalize + multi-file queue + progress + retry).

Status update (2026-05-06): composer autosize (рост до 5 строк перед скроллом) выкачен по цепочке test -> prod.
Status update (2026-05-06): unified chat/media config + DM multi-attachment parity + DM paste dedupe выкачены по цепочке feature -> test -> main -> prod.

6. Stage F: DM P2P transfer MVP (test)
- Signaling events + DM transfer rail UI + single-file direct transfer.
- Ручные сценарии: accept/decline/cancel, sender abort, receiver disconnect, reconnect handshake.

7. Stage G: DM P2P hardening
- Resume/chunk tuning, retry policies, telemetry, abuse controls.

8. Stage H: Prod rollout
- Deploy в prod, мониторинг ошибок upload/ws, контроль cleanup/backup job.

## 7) Риски и смягчение

- Риск: рост нагрузки/трафика из-за 1GB uploads.
  - Митигация: rate limits, concurrent upload caps, observability по size buckets.
- Риск: удаление нужных large-файлов cleanup job.
  - Митигация: dry-run, safety window, логирование delete decisions.
- Риск: несовместимость старого UI/контракта.
  - Митигация: backward-compatible API и feature-flag rollout.
- Риск: P2P недоступен у части пользователей из-за NAT/Firewall.
  - Митигация: TURN relay fallback + явные статусы/ошибки для пользователя.
- Риск: очень большие transfer без resume приводят к частым срывам.
  - Митигация: chunked transport, resume from offset, ограничение скорости.

## 8) Техразбивка по файлам (composer redesign + attachments)

### 8.1 Frontend (web)

- `apps/web/src/components/chatPanel/sections/ChatComposerSection.tsx`
  - новая верстка composer-панели под референс;
  - chips-ряд pending-вложений над input;
  - сохранение mention picker / hotkeys / submit flow.
- `apps/web/src/styles.css`
  - стили glass/overlay панели;
  - стили chips (`ext/name/size/remove`);
  - mobile/desktop адаптив новой структуры.
- `apps/web/src/components/chatPanel/chatPanelTypes.ts`
  - расширение props под metadata pending file (size).
- `apps/web/src/components/ChatPanel.tsx`
  - прокидывание новых props в секцию composer.
- `apps/web/src/hooks/app/state/useWorkspaceChatVideoProps.ts`
  - вычисление и передача metadata pending file в ChatPanel.
- `apps/web/src/components/AppWorkspacePanels.tsx`
  - DM fallback-значения для новых props.

### 8.2 Backend/API (следующий этап)

- `apps/api/src/routes/chat-uploads.ts`
  - batch finalize/init contract и лимиты 1GB.
- `apps/api/src/routes/dm.ts`
  - синхронизация DM upload flow с batch/scenario.
- `apps/api/src/config.ts` (+ отдельный config-модуль)
  - единые лимиты upload/retention/threshold.

### 8.3 Ops/Retention/Backup (следующий этап)

- `scripts/ops/*` + scheduler jobs env
  - cleanup large-файлов по TTL;
  - backup-фильтр <=25MB.
- `docs/operations/*`
  - обновление runbook/checklist для cleanup+backup.

### 8.4 DM P2P transfer (новый этап)

- `apps/web/src/components/dm/*`
  - новая `transfer rail` панель снизу в DM.
- `apps/web/src/hooks/realtime/*`
  - signaling handlers для offer/accept/reject/cancel/progress/completed.
- `apps/web/src/services/*`
  - transport manager для WebRTC DataChannel transfer sessions.
- `apps/api/src/routes/realtime*.ts`
  - server-side relay signaling событий передачи (без хранения файла).
- `apps/desktop-electron/*`
  - диалог выбора пути сохранения и сохранение входящего stream в файл.

## 9) Execution Notes (итерации)

- Iteration 1 (completed): composer panel redesign foundation
  - новая структура панели;
  - chips-строка и кнопки attach/send;
  - без batch upload (single pending attachment flow остается совместимым).
- Iteration 2 (completed): multi-file state + chips actions
  - переход с single pending file на queue.
  - реализовано: multiple file picker, queue chips, remove per chip.
  - текущий transitional send behavior: отправляется первый файл из очереди за submit.
- Iteration 3 (completed): upload progress + retries + batch finalize
  - реализовано: backend endpoint `/v1/chat/uploads/finalize-batch` + web client integration.
  - реализовано: multi-file send -> single message with multiple attachments.
  - реализовано: per-file progress UI (upload states + progress bar) + per-file retry action в chips.
  - реализовано: paste-очередь для скриншотов (повторный paste добавляет новый attachment, а не заменяет текущий).
  - реализовано: inline audio player для `audio/*` вложений в message timeline.
  - реализовано: расширенный allowlist mime/расширений (office/docs/archives/audio + exe/dmg) и обновленный file picker accept.
  - реализовано: UI polish composer (компактный textarea, вертикальный layout chips, абсолютный remove control).
  - реализовано: client telemetry события `chat.upload.init.ok`, `chat.upload.put.ok`, `chat.upload.finalize_batch.ok`, `chat.upload.batch.failed`.
  - реализовано: server-side idempotency guard для batch finalize (request hash + redis lock + replay cache).
  - test rollout выполнен, smoke web/api/realtime пройден (desktop update feed отмечен как отдельный known issue).
- Iteration 4 (planned): DM P2P transfer MVP
  - signaling protocol + transfer rail UI;
  - single-file offer/accept/save flow;
  - direct transfer without object storage persistence.

- Iteration 4.1 (completed): unified chat/media config foundation
  - вынесен API-модуль `chat-media-config` для image policy + upload/retention/backup лимитов;
  - `config.ts` переведен на единый источник chat/media defaults;
  - `/v1/admin/server/chat-image-policy` отдает значения из runtime config, а не напрямую из env.
  - `infra/.env.host.example` и `infra/docker-compose.host.yml` синхронизированы по новым retention/backup env-параметрам.
  - web/api/ops defaults синхронизированы по политике 1GB/25MB/7d, добавлен ops runbook `docs/operations/CHAT_OBJECT_STORAGE_POLICY_RUNBOOK.md`.
  - rollout test/prod завершен (серия merge-коммитов `b0a39cd`, `7f3524a`, `b6d4638`, `750bc42`), smoke post-deploy пройден.

- Iteration 4.2 (in progress): backend cleanup после rollout
  - убраны захардкоженные `50MB` caps в zod-схемах upload (room + DM);
  - effective limit целиком берется из runtime config `CHAT_UPLOAD_MAX_SIZE_BYTES` (default 1GB);
  - добавлен shared derived metadata layer для attachments: `sizeClass`/`expiresAt` в room/DM API payload и realtime attachments;
  - добавлен admin endpoint `POST /v1/admin/chat/uploads/large-retention-cleanup` (dry-run/apply, threshold + retentionDays + maxDelete);
  - добавлен ops script `scripts/ops/chat-large-retention-cleanup.sh` + runbook usage;
  - добавлен scheduler manifest `scripts/ops/scheduler/jobs/chat-large-retention-cleanup.env` (daily dry-run в test);
  - `slo-rolling-gate` расширен alert-порогом по retention delete failures (`SLO_LARGE_RETENTION_FAIL_30M_MAX`);
  - добавлена DB migration `0032_message_attachments_retention_metadata.sql` (`size_class` + `expires_at` + backfill + indexes);
  - retention cleanup query переключен на persisted `size_class`/`expires_at` (с fallback на старые записи без `expires_at`);
  - next: test rollout migration + dry-run evidence + controlled apply в test.
