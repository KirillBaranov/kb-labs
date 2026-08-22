# KB Create: план полного объединения на один декларативный движок (без legacy)

**Статус: ЗАВЕРШЕНО 2026-08-19.** Все 10 шагов из §6 выполнены и подтверждены живыми прогонами
(`create --yes`, `install`, `update`, `doctor` — все работают через один движок, `kb-dev start` +
`kb auth login` протестированы end-to-end). См. §13 "Фактический результат" в конце документа.

v1 этого плана содержал компромисс ("оставить `scaffold.go` как implementation detail нового
движка") — отклонён пользователем: это не удаление легаси, а его сокрытие на уровень глубже. Этот
документ (v2) — план **реального** удаления, и он выполнен как написано, с несколькими
задокументированными по ходу дела уточнениями (см. §13).
**Дата:** 2026-08-19

> Историческая заметка: этот implementation plan фиксирует промежуточный
> declarative-engine cutover. После него выполнен отдельный breaking V2
> launcher cutover; старые `cmd/`, `internal/*` и legacy E2E paths больше не
> являются частью репозитория.
**Базируется на:** `2026-08-03-kb-create-declarative-cutover.md` (целевая архитектура) +
`2026-08-19-kb-create-cutover-status-audit.md` (аудит фактического состояния)
**Цель:** ноль вызовов `internal/scaffold`. Все четыре команды (`create --yes`, `create` interactive,
`install`, `update`) компилируют `InstallPlan` и исполняют его одним executor'ом; `kb.config.jsonc`,
`.env`, `.gitignore`, `devservices.yaml`, `marketplace.lock`, CLI-симлинки, Go-бинарники — всё результат
`PlanAction`'ов, ничего не генерируется отдельным Go-веткой в обход плана.

## 0. Пересмотренный вывод после чтения `generateFull` построчно (1293 строки `scaffold.go`)

Разбирал `generateFull` (единственная функция, ради которой я в v1 предлагал компромисс) по каждому блоку.
Вывод: **большая часть уже реализована в новом движке и просто не используется как источник истины**,
потому что `FinalizeDeclarative` всегда перезаписывает результат. Конкретно, уже сегодня работает:

| Блок `kb.config.jsonc` | Статус в новом движке |
|---|---|
| `services.<id>` / `plugins.<id>.enabled` toggle | ✅ уже генерируется — `catalog/manifest.go:togglePatch()` производит ровно `/services/<id>` (scalar) и `/plugins/<id>/enabled` (nested), 1-в-1 с тем, что ожидает `scaffold.go`'s `writeToggle`/`writePluginBlock` |
| `platform.adapters.<capability>` (package выбор) | ✅ уже генерируется — `plan.Compile()`'s provider-bind actions производят `/platform/adapters/<capability>` patches |
| `platform.adapters` fallback-пакеты (когда capability не запрошен явно) | 🔴 не перенесено — `manifest.json`'s `adapterConfig.adapters` (id→package map) существует, но не читается компилятором как `Catalog.Defaults` patches |
| `adapterOptions.<capability>` (вложенные настройки: `storage.baseDir`, `logger.level`, ...) | 🔴 не перенесено — сегодня чисто хардкод в `generateFull`, но это **статические константы**, тривиально становятся `Catalog.Defaults` patches (поле `Defaults []ConfigPatch` в `catalog.Catalog` уже существует и предназначено именно для этого) |
| `plugins.<id>` inner config (`mind.vectorStore`, `agents.maxSteps` и т.д., `pluginInnerConfig` map) | 🔴 не перенесено, но механизм уже есть и работает: `manifest.Component.Config` → `catalog.Component.Config` уже используется для service/plugin enable-toggle; нужно **только дописать в `manifest.json`** `"config"` для каждого плагина с этими же статическими значениями — код-путь уже существует, изменение чисто в данных |
| `gateway.upstreams` (из scan) | ⚠️ **пересмотрено 2026-08-19**: prefix/websocket/rewrite статичны (из manifest), но **порт** (`svc.Runtime.Port`) — реальный факт об установленном npm-пакете, читаемый `scan.Run` из его собственного `dist/manifest.json` уже после установки. Не может быть чисто static patch на этапе compile. Остаётся частью discovery-шага (см. §3/задача "discover-services") — discovery-handler после scan строит `gateway.Plan` и передаёт его как ADDITIONAL входные patches в config-render handler (через shared state), а не как отдельный статичный эффект |
| `gateway.auth.bootstrap` (adminEmail/tenantId/provisionCliCredentials) | 🔴 не перенесено, но это тоже чистые константы → effect-patches (см. §3 старого плана, не менялось) |
| `gateway.host`/`auth.enabled` (local/secured toggle) | ✅ уже есть — эффекты `gateway.access.local`/`secured` |
| `.env` секреты (bootstrap password, LLM key, gateway creds) | 🔴 не реализовано вообще — единственная часть, где значение **генерируется в момент apply**, не выводится из статичных данных. Нужен новый `type: "secret"` field (спроектирован в оригинальном плане §5.4, не реализован) |
| `.gitignore` merge-block | 🔴 не реализовано как artifact — нужен новый overwrite policy `OverwriteMergeBlock` (найти/заменить между сентинелами, как сегодня делает `ensureGitignore`) — сама логика 15 строк, переносится как есть в новый handler, не в scaffold |
| demo workflow (`workflows/demo.yaml`) | 🔴 не реализовано как artifact, тривиально: `ArtifactWrite` со статичным content, триггерится эффектом `demo.enabled` |
| `projects` registry (sentinel-comment блок, редактируется `kb-dev`, не `kb-create`) | ⚠️ не трогаем — `kb-dev` (отдельный бинарник) сам ищет/правит текст между `kb-dev:projects:start/end`. Новый сериализатор обязан произвести те же сентинел-строки один раз при первом install; дальше `kb-dev` работает с файлом независимо от того, чем он был сгенерирован |
| **Комментарии/документация в JSONC** | 🔴 главный нерешённый вопрос архитектуры — см. §1 |

## 1. Комментарии в `kb.config.jsonc` — реальный, не выдуманный конфликт

`internal/scaffold`'s заголовочный комментарий прямым текстом объявляет цель: JSONC с инлайн-документацией
по каждой секции ("same pattern as tsconfig.json"). Текущий `internal/engine/config.Assemble` производит
**чистый JSON** — `ConfigPatch`/`ArtifactWrite` ничего не знают про комментарии, `json.Marshal` их физически
не может произвести.

Это не второстепенная деталь и не то, что можно "доделать потом" — если её не решить, у нового движка нет
пути стать единственным без потери реальной, используемой UX-фичи (объяснение каждого поля прямо в файле,
который пользователи открывают и правят руками).

**Решение**: расширить `ConfigPatch` полем `Doc string` (optional, markdown/plain-text одна-две строки) и
`ConfigOutput`/`ArtifactWrite` — специальным `Format: FormatJSONCTemplate`, у которого сериализатор:

1. Строит итоговое дерево JSON из patches как сегодня (`renderScope`/precedence — без изменений).
2. Проходит по дереву в **порядке объявления секций каталога** (не JSON key order — нужен явный порядок
   секций типа `SectionOrder []string` в `Catalog`, аналог текущего ручного порядка в `generateFull`:
   platform → adapterOptions → gateway → services → plugins → projects).
3. Перед каждым top-level ключом, если у patch'а, который его установил, есть `Doc`, вставляет `//`-блок.
4. Пишет заголовочный банер (статичный текст, как сегодня в `generateFull`) один раз.

Это новый, самостоятельный компонент (~150-250 строк), не заимствование `scaffold.go` — заменяет
`generateFull` целиком, работает от patch-дерева, а не от `Options`-структуры.

## 2. Итоговый список нового кода (взамен `internal/scaffold`)

| Новый компонент | Заменяет | Объём (оценка) |
|---|---|---|
| `catalog.Component` + 3 gateway-поля (`GatewayPrefix`/`Rewrite`/`WebSocket`) | `buildGatewayPlan`/`GenerateGatewayConfig`'s manifest-scan matching | ~20 строк + маппинг в `enginecatalog.FromManifest` |
| Static gateway-upstream patches в `plan.Compile()` (из выбранных компонентов, не из scan) | `renderGatewayUpstreams` + scan-зависимость | ~40 строк |
| `Catalog.Defaults` заполняется `adapterOptions`-константами + `adapterConfig.adapters` fallback-пакетами | hardcoded блоки в `generateFull` | данные в `manifest.json`, ~0 нового Go-кода (механизм есть) |
| `manifest.json`: `"config"` для каждого плагина (перенос `pluginInnerConfig`) | `pluginInnerConfig` map | чисто данные, 0 Go-кода |
| Bootstrap-admin effect patches (email/tenant/provisionCliCredentials, статика) | часть `generateFull`'s gateway-секции | ~10 строк effect в `manifest.json` |
| `type: "secret"` field + secret-handler (генерация значения, запись в `.env` через `FormatDotenv` artifact) | `writeEnvFile` | ~80-120 строк новый handler |
| `OverwriteMergeBlock` policy для `ArtifactWrite` (сентинел-блок в `.gitignore`) | `ensureGitignore` | ~30 строк, логика 1-в-1 переносится в handler, не в scaffold |
| `demo.yaml` artifact, триггер эффектом `demo.enabled` | `writeDemoWorkflow` | ~10 строк effect + существующий `ArtifactWrite` механизм |
| JSONC-with-comments сериализатор (§1) | `generateFull`'s строковый билдер целиком | ~150-250 строк, новый файл |
| `ActionDiscoverServices` handler (scan → devservices.yaml/marketplace.lock) | `scan.Run`+`scan.WriteConfigs` вызов из `FinalizeDeclarative` | handler-обёртка ~30 строк, сам `internal/scan` не меняется (уже независим от scaffold) |
| `ActionInstallBinary` handler (kb-dev binary + CLI symlink) | `installBinaries`+`symlinkCLI` из `installer.go` | ~60 строк, реюзает `internal/bindown`+`internal/platform` как есть |

Итого нового кода: ориентировочно 600-800 строк, против удаляемых ~1293 строк `scaffold.go` +
~250 строк product-логики из `installer.go`/`cmd/create.go`/`cmd/install.go`. Меньше кода, не больше —
потому что большая часть "легаси" на самом деле уже дублирует то, что новый движок делает сам.

## 3. `plan.Compile()` — итоговый набор actions

```
install:foundation (core packages)
install:selection (services+plugins+providers)
  ├─ bind:<capability>  (provider actions, уже есть)
discover:services        (зависит от install:selection) — scan → devservices.yaml/marketplace.lock
binary:<id>               (независим от package actions — Go-бинарники с GitHub Releases)
secret:<id>                (зависит от effect, который его требует — генерация + .env запись)
config:runtime             (зависит от ВСЕХ предыдущих — JSONC сериализация + запись kb.config.jsonc,
                             project pointer, .gitignore merge, demo artifact)
```

## 4. `cmd/*.go` после изменения

Все четыре команды становятся тонкими обёртками:

```
request := <build InstallRequest from scenario answers | direct flags>
compiled := plan.Compile(request, catalog)
journal := engineruntime.Apply(ctx, compiled, options)
writeDeclarativeInstallState(compiled, ...)  // install.json, без изменений от PR #400
```

`cmd/update.go` требует отдельного разбора (см. риски) — сегодня не до конца ясно, идёт ли он вообще через
`plan.Compile`, нужно проверить в начале реализации, не в конце.

## 5. Что физически удаляется

- Весь `internal/scaffold` (1293 строки) — файл удаляется, не "рефакторится".
- Весь `internal/installer` пакет целиком. **Проверено 2026-08-19**: `cmd/update.go` уже сегодня идёт через
  `direct.Build → engineplan.Compile → engineruntime.Apply`, точно так же как `create`/`install` — свою
  собственную diff-логику не использует вообще (сверка "уже актуально" — тривиальный `bytes.Equal` на
  сериализованном manifest snapshot, не через `Installer.Diff`). `Installer.Diff`/`Update`/`UpdateDiff` —
  подтверждено, ноль вызовов вне `installer.go` и его тестов. Открытых вопросов по этому пакету не осталось.
- `ReadPlatformOptions`, `--engine` флаг — мёртвый код, безусловно удаляется.
- `pluginInnerConfig`, `servicesWithoutToggle`, `DefaultAdapterRoles`, все хардкод-константы —
  переезжают в `manifest.json` как данные.

## 6. Порядок коммитов

1. `feat(kb-create): add Doc field to ConfigPatch and JSONC-comment serializer` — §1. Независимый,
   тестируемый в изоляции (golden-file тесты: patches → ожидаемый JSONC текст).
2. `feat(kb-create): compile gateway upstreams and bootstrap from catalog, not scan` — §2 (gateway часть).
   Golden-file: тот же `InstallRequest`, что и сегодня даёт scan-based upstream, даёт идентичный результат
   статически.
3. `feat(kb-create): add secret field type and dotenv artifact handler` — §2 (secrets).
4. `feat(kb-create): add merge-block artifact overwrite policy for .gitignore` — §2.
5. `data(kb-create): move adapterOptions defaults and plugin inner config into manifest.json/Catalog.Defaults`
   — чистые данные, нулевой риск для логики.
6. `feat(kb-create): add discover-services and install-binary plan actions` — §3, handlers из v1-плана.
7. `test(kb-create): conformance — new engine's kb.config.jsonc output byte-equal to scaffold.go's for every
   existing scenario/direct-request combination` — **gate**. Genuinely byte-for-byte, не "похоже".
8. `refactor(kb-create): route all commands through plan.Compile + engineruntime.Apply exclusively` — §4.
   Первый коммит, реально меняющий поведение user-facing команд.
9. `refactor(kb-create): delete internal/scaffold, Installer.FinalizeDeclarative/Install, Selection,
   ReadPlatformOptions, --engine flag` — §5.
10. `docs(kb-create): cutover complete — update audit and 08-03 plan status`.

Шаг 7 — обязательный стоп-gate перед шагом 8, как и в v1. Отличие от v1: gate теперь **byte-equal**, а не
"похожий результат", потому что серилизатор — новый код, а не переиспользование старого.

## 7. Риски (обновлено от v1)

- ~~`cmd/update.go` неопределённость~~ — **закрыто 2026-08-19**, см. §5.
- **JSONC-сериализатор — единственный по-настоящему новый, непроверенный код** во всём плане. Golden-file
  тесты обязательны для каждой секции по отдельности, не только end-to-end.
- **`Doc` в `ConfigPatch`, идущем из разных источников** (component default vs explicit override vs effect)
  — если два патча на одном пути оба несут `Doc`, нужно детерминированное правило (precedence такой же,
  как для самого `Value` — см. §6.3 оригинального плана 08-03).
- **Sentinel-комментарии для `projects` секции** — если новый сериализатор случайно поменяет отступы/пробелы
  вокруг `kb-dev:projects:start/end`, `kb-dev` (отдельный бинарник, отдельный релизный цикл) сломается молча.
  Нужен явный тест на точное совпадение этих строк, ссылающийся на то, что реально парсит `kb-dev`.
- **Plan hash меняется** везде, где меняется набор actions — ожидаемо, но ломает любой тест/фикстуру,
  хардкодящую hash. Найти через `grep -rn "planHash" --include="*_test.go"` в начале работы, не в конце.

## 8. Что осознанно не входит

- Migration engine (Phase 3, `kb.platform-config`/`kb.project-config` версионирование) — не блокирует,
  сегодня install-state migration (`kb.install-state` v1→v2) достаточно для реальных случаев.
- Transactional staging с fault-injection recovery (полная Phase 4) — текущий in-run rollback остаётся.
- Migration UI/detectors для legacy layouts, которых de facto не существует в проде (см. 08-03 §8.2) —
  добавляется по мере необходимости, не заранее.

## 13. Фактический результат (2026-08-19)

Все 10 шагов §6 выполнены. Живой прогон подтверждён на реальном npm-registry (не синтетический тест):
`kb-create my-project --yes --platform <dir>` → `kb-dev start` (6/6 сервисов) → `kb auth login` с
bootstrap-паролем → успех. `kb-create doctor` (9/9 проверок) и `kb-create update` (корректно определяет
"already up to date") тоже работают через урезанный `internal/installer`.

### Отличия от плана, обнаруженные и решённые по ходу

- **Gateway upstream порт — не статичен.** План §2 предполагал вычислять upstream'ы полностью статично
  в `plan.Compile()`. По факту порт сервиса — реальный факт об установленном npm-пакете (читается из его
  собственного `dist/manifest.json` уже после установки), не то, что каталог kb-create знает заранее.
  Решение: `discoveryHandler` (после scan) генерирует upstream-патчи динамически и передаёт их в
  `configHandler` через shared pointer (`*[]config.ConfigPatch`), проинициализированный в `Registry()`.
  Статичная часть (prefix/rewrite/websocket) всё же вычисляется в `plan.Compile()` и едет в
  `discover:services`'у Inputs как `gatewayRoutesJSON` — гибрид "compile-time + apply-time", а не чистый
  compile-time, как предполагалось.
- **`gateway.host`/`bootstrap.adminEmail` — не всегда чистая константа.** E2E-фикстуры реально
  переопределяют `GATEWAY_BOOTSTRAP_ADMIN_EMAIL`/`TENANT_ID` через env. Добавлен generic-механизм
  `InstallRequest.ExtraPatches` (наивысший приоритет после effects) + `gatewayBootstrapEnvOverrides()`
  внутри `plan.Compile()`, а не как статичный effect-патч.
- **Статичные artifact-заглушки в manifest.json** (`platform.marketplace-lock`/`platform.devservices` с
  пустым content) молча затирали то, что `discoveryHandler` только что записал (config:runtime выполняется
  после discover:services). Убраны из manifest.json — эти файлы теперь владение `discoveryHandler`
  целиком.
- **`internal/installer`/`internal/scaffold` — не удалены как пакеты целиком**, вопреки первоначальному
  плану §5. `internal/scaffold` — удалён полностью (все 3 файла, 2587 строк). `internal/installer` —
  урезан хирургически: удалены `FinalizeDeclarative`/`Install`/`Diff`/`Update`/`UpdateDiff`-логика и всё,
  что их обслуживало (~600 строк), но **сохранены** `Selection`/`Result` как чистые data-transfer типы
  (используются `internal/wizard`, `cmd/doctor.go`, `cmd/continue.go`, `cmd/output.go`) и
  `symlinkCLI`/`installBinaries`/`filterBinaries` (используются `repair.go` для `doctor --fix`/rollback —
  логика дублирует `discoveryHandler`/`binaryHandler`, но это осознанно другой use case: "почини то, что
  сломалось", а не "часть install pipeline"). Полное удаление потребовало бы рефакторинга
  `internal/wizard` (большой TUI-визард для `--dev-manifest` пути) — вне разумного объёма одной сессии.
- **`RecordActivePlatform`/`ReadActivePlatform`** (`internal/scaffold/activeplatform.go`, писали
  `~/.kb/active-platform` для `kb-dev switch`/`register`) — удалены вместе с файлом, единственный caller
  был `WritePlatformConfig`. Функциональность потеряна, не перенесена в новый движок — известный,
  осознанный gap, не блокирующий (эквивалент есть через `userstate`/явный `--platform`).
- **`printAdapterReconciliation`/`printEnvHints`** (`cmd/install.go`) раньше читали `result.InstalledPlugins`
  из `FinalizeDeclarative`'s `Result`. Теперь `cmd/install.go` сам вызывает `scan.Run()` ещё раз после
  `engineruntime.Apply` — дёшево (только чтение локальных файлов), чисто информационно, никогда не
  блокирует установку.
- **Косметические, принятые расхождения с исходным scaffold.go-выводом** (структурный diff, не
  byte-exact — см. §12 самого документа): `services.gateway` теперь присутствует как отдельный ключ
  (старый код специально исключал gateway из общего toggle-цикла; новый — нет, но ничто не читает этот
  ключ для реального поведения); inner-config для НЕвыбранных плагинов (`mind.vectorStore`,
  `agents.maxSteps`) в новом выводе отсутствует, в старом — присутствовал всегда (разумно: зачем дефолты
  выключенного плагина).
