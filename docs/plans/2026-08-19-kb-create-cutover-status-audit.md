# KB Create: аудит фактического состояния cutover'а и план завершения

**Статус: ИСПОЛНЕНО 2026-08-19.** План завершения (§5) выполнен целиком тем же днём — см.
`docs/plans/2026-08-19-kb-create-engine-unification-implementation.md` (implementation plan + §13
"Фактический результат"). Таблица фаз ниже обновлена по факту; текст TL;DR/разделов 1-4 оставлен как
исторический снимок состояния ДО работы этого дня — не переписывался задним числом.
**Дата:** 2026-08-19
**Триггер:** послерелизный post-publish user-journey smoke test (v2.116.16-binaries + platform canary) вскрыл, что
`kb-create` работает по двум параллельным, не до конца совместимым движкам конфигурации; чинился в PR #400
(`fix(kb-create): restore gateway bootstrap password + project install.json`).
**Связанный план:** `docs/plans/2026-08-03-kb-create-declarative-cutover.md` ("KB Create: полный декларативный
cutover launcher'а", фазы 0-7). Этот документ — статус-аудит того плана: что реально реализовано по состоянию
на 2026-08-19, а не повторное описание целевой архитектуры.

## TL;DR

PR #354 ("complete declarative launcher cutover", 2026-08-03) на самом деле реализовал только Phase 0-2
исходного плана (contract freeze, catalog/effects/config-contract, flow compiler) и частично Phase 6
(`create`/`install` формально проходят через compiler). Phase 3 (migration engine), Phase 4 (transactional
executor), Phase 5 (migrate product scenarios) и Phase 7 (delete legacy) **не начаты либо начаты на ~10%**.
В результате в коде сейчас живут **два движка рендеринга конфига одновременно**, они не эквивалентны по
функциональности, и ни один из трёх реальных пользовательских путей (`create --yes`, `create` interactive,
`install`) не проходит `Phase 6`-критерий "route through one core" полностью. Заголовок PR #354 — вводит в
заблуждение: cutover не completed, он **начат и заморожен в промежуточном, частично рабочем состоянии**.

## 1. Два движка, которые реально существуют в коде

### Движок A — `internal/scaffold` (legacy renderer)

Строковый генератор `kb.config.jsonc`/`.env`/`.gitignore` (`generateFull`, `WritePlatformConfig`,
`WriteProjectConfig`, `writeEnvFile`, `ensureGitignore` — [`internal/scaffold/scaffold.go`](../../tools/kb-create/internal/scaffold/scaffold.go)).
Вызывается **только** из `Installer.FinalizeDeclarative` / `Installer.Install`
([`internal/installer/installer.go`](../../tools/kb-create/internal/installer/installer.go)).

Помимо рендера конфига, `FinalizeDeclarative` — единственное место, которое делает:

- `scan.Run` + `scan.WriteConfigs` → генерация `devservices.yaml`, `marketplace.lock` (единственный caller
  `scan.Run` во всём модуле, вне тестов — `installer.go` и `cmd/install.go`, который сам вызывает
  `FinalizeDeclarative`);
- `symlinkCLI` → симлинк `kb`/`kb-dev` в `~/.local/bin` (единственный вызов вне `installer/repair.go`);
- `installBinaries` → скачивание Go-бинарников (`kb-dev`) из GitHub Releases;
- (после PR #400) генерацию bootstrap-admin (email/tenant/пароль) для non-local install с выбранным
  `gateway`-сервисом.

Ничего из этого списка не продублировано и не реализовано в Движке B.

### Движок B — `internal/engine/config` (новый, JSON-patch based)

Пакет буквально документирует себя как временный: *"the new engine is built in parallel until the cutover
is proven by conformance tests"* ([`assembly.go:1-4`](../../tools/kb-create/internal/engine/config/assembly.go)).
`Assemble`/`Write` применяют декларативные `ConfigPatch` к базовому JSON и материализуют `ArtifactWrite`.
Единственный consumer — `configHandler` в
[`internal/engine/handlers/handlers.go`](../../tools/kb-create/internal/engine/handlers/handlers.go), который
регистрируется в `executor.HandlerRegistry` вместе с `packageHandler` (install/update пакетов) и
`providerHandler` (bind provider). **Всего три типа action** — `ActionInstallPackage`, `ActionBindProvider`,
`ActionWriteConfig`. Скана node_modules, симлинков CLI и загрузки бинарников там нет и никогда не было.

## 2. Как это реально используется — по каждой команде

| Команда | Что выполняется | Итоговый файл кто пишет | Подтверждение |
|---|---|---|---|
| `kb-create <name> --yes` (`runDeclarativeCreate`) | 1) `executeFlowPlan` → Движок B пишет `kb.config.jsonc` 2) сразу следом `FinalizeDeclarative` → Движок A **полностью перезаписывает** тот же файл | Движок A (Движок B выполняется вхолостую) | [`cmd/create.go:150-175`](../../tools/kb-create/cmd/create.go) |
| `kb-create install --plugins=X` (`runDeclarativeInstall`) | Тот же паттерн: `engineruntime.Apply` (Движок B) → `FinalizeDeclarative` (Движок A) | Движок A | [`cmd/install.go:186-224`](../../tools/kb-create/cmd/install.go) |
| `kb-create update` | `FinalizeDeclarative` напрямую, Движка B тут вообще нет в явном виде | Движок A | [`cmd/update.go:154`](../../tools/kb-create/cmd/update.go) |
| `kb-create` **interactive** (`flowRunCmd`, нет `--yes`) | Только `executeFlowPlan` → `engineruntime.Apply` (Движок B) + `writeDeclarativeInstallState` (пишет только `install.json`). `FinalizeDeclarative` **не вызывается** | Движок B — и только он | [`cmd/flow.go:44-99`](../../tools/kb-create/cmd/flow.go) |
| `kb-create --engine` флаг | Объявлен (`cmd/create.go:38,56`), **нигде не читается** — dead flag, ничего не переключает | — | `grep flagEngine` находит только объявление |

### Последствие для `--yes` / `install` / `update`

Работает "случайно правильно", потому что вся реальная работа (scan → devservices.yaml/marketplace.lock,
symlink kb/kb-dev, binaries, bootstrap-admin) есть только в Движке A, а Движок A выполняется вторым и
выигрывает запись файла. Цена — двойная работа и риск: если Движок B когда-нибудь начнёт писать поле, которого
нет в Движке A (или наоборот), поведение будет зависеть от порядка перезаписи, а не от источника истины.

### Последствие для интерактивного wizard'а — не подтверждено живым прогоном, но по коду:

После `kb-create` (TTY, без `--yes`) отсутствуют:

- `devservices.yaml` / `marketplace.lock` — не генерируются (`scan.Run` не вызывается);
- симлинки `kb`/`kb-dev` в `~/.local/bin` (`symlinkCLI` не вызывается) — то есть **CLI, установленный
  интерактивным wizard'ом, недоступен в PATH**;
- `kb-dev` бинарник вообще не скачивается (`installBinaries`/`compiled.Binaries` не читается нигде в
  `flow.go`/`engineruntime`);
- bootstrap-admin для `access.mode: secured` (дефолт wizard'а) — эффект `gateway.access.secured`
  ([`internal/manifest/manifest.json`](../../tools/kb-create/internal/manifest/manifest.json)) ставит только
  `gateway/auth/enabled: true`, без seed админа — пользователь получает включённую авторизацию без единого
  способа залогиниться.

**Это не проверено эмпирически** (интерактивный wizard требует TTY, в текущей сессии не воспроизведён), но
код настолько прямолинеен (три action-хендлера, ни один не пересекается с Движком A), что вероятность иного
поведения крайне мала. Рекомендация — первый пункт плана ниже: подтвердить через `--engine`-агентский протокол
или headless TTY эмуляцию, прежде чем расширять фикс.

## 3. Статус фаз плана `2026-08-03-kb-create-declarative-cutover.md`

**Обновление 2026-08-19 (конец дня):** Фазы 5 и 6 доведены до состояния, достаточного для реального
единого пути (не 100% буквального текста плана 08-03, но функционально полные — см. implementation-plan
§13 для точных отличий). Фаза 7 выполнена хирургически (см. implementation-plan §13: `internal/scaffold`
удалён полностью, `internal/installer` урезан, а не удалён целиком — обоснование там же). Строки ниже —
исходный снимок на начало дня, статусы в них НЕ актуальны для конца дня.

| Фаза | Заявлено | Фактический статус (начало дня 2026-08-19) | Основание |
|---|---|---|---|
| 0 — Contract freeze | schemas/fixtures review-approved | ✅ похоже сделано | `kb.scenario/2`, `kb.install/1` схемы существуют и используются |
| 1 — Catalog, effects, config contract | catalog самодостаточен до установки пакетов | 🟡 частично | catalog/digest есть, но effects всего 2 штуки (см. Phase 5) |
| 2 — Flow compiler | ни один новый scenario не требует Go handler | ✅ похоже сделано | `engineflow.BuildInstallRequest`, generic `Field`/`Option` есть |
| 3 — Migration engine и legacy adoption | version graph resolver, DSL, legacy detectors, managed overlay | 🔴 ~10% | В `manifest.json` есть ровно одна миграция: `kb.install-state` v1→v2. Миграций `kb.platform-config`/`kb.project-config` нет вообще |
| 4 — Transactional executor | staging, resume/reconcile journal, verify effective config, fault-injection recovery | 🟡 частично | `executor.go` умеет rollback **в рамках одного запуска** (handler-declared rollback), но нет staging directory / resume после падения между запусками |
| 5 — Migrate product scenarios | explore, release, commit, ai-review, plugin-author, custom, LLM/provider, Studio access, **gateway auth/bootstrap**, analytics/telemetry, adapter defaults, plugin defaults, service toggles | 🔴 ~5% | Эффектов всего 2: `gateway.access.local`/`secured` — только host+auth.enabled toggle. **"gateway auth/bootstrap" явно в списке фазы 5 и явно не сделан** — это первопричина найденного бага |
| 6 — Route commands through one core | create/agent → scenario compiler; install → direct compiler; **все команды → common executor**; Cobra становится thin wrapper | 🔴 не выполнен | `create --yes`/`install`/`update` дергают common executor (Движок B), но ЗАТЕМ **всё равно** дергают `FinalizeDeclarative` (Движок A) для реальной работы — это не "thin wrapper", это двойной путь |
| 7 — Breaking cutover, удаление legacy | удалить `generateFull`, `Selection` product fields, `ReadPlatformOptions`, engine feature flag и т.д. | 🔴 не начат | `scaffold.go`/`generateFull` жив и обязателен; `ReadPlatformOptions` — **мёртвый код** (не вызывается нигде, включая `update.go`) — забыт, не удалён; `--engine` флаг — тоже мёртвый, не удалён |

## 4. Конкретные находки этой сессии (для контекста)

Все ниже — **симптомы незавершённости Phase 5/6/7**, не независимые баги:

1. **`generateBootstrapAdminPassword()`** была объявлена в `cmd/create.go`, но вызов удалён коммитом
   `1bb66dfb7` ("complete declarative launcher cutover") — функция осталась мёртвой. Починено в PR #400
   (перенесено в `Installer.FinalizeDeclarative`, т.е. **обратно в Движок A**, не в Движок B/effects —
   это тактический фикс, не решение архитектурной проблемы).
2. **`ReadPlatformOptions`** в `scaffold.go` — аналогичный мёртвый код, оставшийся от предыдущей ревизии
   `update`, никем не вызывается. Не трогал (вне scope PR #400).
3. **`--engine`** флаг — объявлен, не читается нигде. Не трогал.
4. **`.kb/install.json` не писался в project dir** (только в platform dir) — тоже симптом того, что
   `writeDeclarativeInstallState` (единственная общая точка между всеми путями) была написана для
   single-directory предположения и не учла split platform/project из более раннего PR #366/#367.

## 5. Рекомендованный план (в порядке приоритета)

### 5.1. Немедленно (эта неделя) — остановить кровотечение, не трогая архитектуру

- ✅ Сделано в PR #400: bootstrap-admin для `create --yes`/`install`.
- Подтвердить эмпирически состояние интерактивного wizard'а (раздел 2, последний абзац) — headless прогон
  через agent-протокол (`engineagent.CompilePlan` + `CommandApply`, без TTY) с последующей проверкой
  `devservices.yaml`/`marketplace.lock`/`~/.local/bin/kb`/bootstrap.
- Если подтвердится — **временный тактический фикс**: заставить `flowRunCmd` тоже вызывать
  `FinalizeDeclarative` после `executeFlowPlan`, как это уже делают `create --yes`/`install`. Это не решает
  архитектурный долг, но останавливает "интерактивный wizard производит нерабочую установку" немедленно, тем
  же способом, каким уже "случайно правильно" работают остальные пути.
- Пометить `--engine` флаг и `ReadPlatformOptions` как известный dead code (issue/TODO), не удалять молча —
  могут быть побочные зависимости в тестах/агентском протоколе.

### 5.2. Phase 5 — доперенести "gateway auth/bootstrap" в effects (устраняет тактичность фикса из PR #400)

- Добавить в `manifest.json` effect `gateway.access.secured` **secret binding** для
  `GATEWAY_BOOTSTRAP_ADMIN_PASSWORD` по образцу `docs/plans/2026-08-03-...md` §5.4 (`type: "secret"`,
  `env: "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD"`, `requiredWhen: {path: "access.mode", equals: "secured"}`).
  Значение генерируется исполнителем (`config.Write`/новый secret artifact handler), не Go-веткой в
  `cmd/create.go`.
- Добавить артефакт `gateway.auth.bootstrap` (adminEmail/tenantId) как `ArtifactWrite`/patch эффекта, а не
  как отдельные поля `scaffold.Options`.
- Только после этого можно удалить bootstrap-код из `Installer.FinalizeDeclarative`, добавленный в PR #400 —
  раньше нельзя, иначе снова регрессия.

### 5.3. Phase 6 — реально объединить пути (главный архитектурный кусок)

Перенести в Движок B (или в общий шаг executor'а, вызываемый из `handlers.Registry`) то, что сейчас есть
только в `FinalizeDeclarative`:

- `scan.Run`/`scan.WriteConfigs` как новый action kind (`ActionScanManifests` или встроить в
  `ActionWriteConfig` post-step) — единственный источник `devservices.yaml`/`marketplace.lock`;
- `symlinkCLI`/`installBinaries` как action kind (`ActionInstallBinary`/`ActionLinkCLI`), управляемый тем же
  `compiled.Binaries`, который сейчас молча игнорируется вне `installer.go`.

Только когда все три (`create --yes`, `create` interactive, `install`) реально проходят через ОДИН набор
action-хендлеров — можно убрать двойной вызов `FinalizeDeclarative` после `executeFlowPlan`.

### 5.4. Phase 3/4 — миграции и transactional executor

Не блокируют текущую работоспособность (единственная существующая миграция `kb.install-state` покрывает
реальный кейс), но нужны раньше Phase 7 (удаление legacy retire-парсера конфигов). Отдельный трек, не
приоритет прямо сейчас.

### 5.5. Phase 7 — удаление legacy

Только после 5.3 подтверждён conformance-тестами на всех трёх путях. Раньше — запрещено по правилу самого
плана 2026-08-03 (§14: "Удаление отдельных legacy полей до готовности contracts, migration matrix и recovery
path запрещено").

## 6. Что НЕ делать

- Не удалять `scaffold.go`/`FinalizeDeclarative` до того, как Движок B закроет паритет по scan/symlink/
  binaries — иначе `--yes`/`install` сломаются полностью (сейчас это единственный работающий путь).
- Не чинить `access.mode`/bootstrap точечно в Движке B без миграции остальной логики (5.2) — иначе получится
  третий, ещё один частичный путь вместо объединения.
- Не запускать `go test ./...` (в т.ч. `-short`) в `tools/kb-create` без исключения `./e2e` — пачка тестов
  пишет в реальный `$HOME` (см. отдельную memory-заметку `kb-create-e2e-test-pollutes-real-home`), что не
  относится к этому плану, но легко словить при работе над этой темой.
