# KB Create: полный декларативный cutover launcher’а

**Статус:** implementation-ready architecture plan после ревью
**Дата:** 2026-08-03
**Область:** `tools/kb-create`, product catalog, scenarios, config assembly, update и migrations
**Связанные решения:** ADR-0012, ADR-0013, ADR-0027, ADR-0032, ADR-0035
**Совместимость:** runtime legacy-код удаляется после cutover; существующие пользовательские данные мигрируются

## 1. Цель

Убрать product/business logic из Go-кода `kb-create` и оставить один
декларативный путь установки и обновления.

```text
KB Labs manifests + user/direct input
                  ↓
          normalized catalog
                  ↓
            InstallRequest
                  ↓
             InstallPlan
                  ↓
   ConfigAssembly + ArtifactIntents
                  ↓
       crash-safe plan execution
```

Manifest-контракты должны описывать:

- сценарии, страницы и поля launcher’а;
- варианты, defaults, visibility и validation;
- reusable product effects;
- component selection и provider preferences;
- config contributions;
- secret/env bindings;
- artifacts;
- completion contract;
- versioned migrations для config и launcher state.

Go должен только загружать и валидировать контракты, интерпретировать generic
операции, компилировать детерминированный plan и выполнять его.

## 2. Зафиксированные архитектурные решения

Эти решения являются частью контракта. Их нельзя оставлять на усмотрение
реализации отдельных фаз.

### 2.1. Trust model

Launcher, product catalog, scenarios, migrations и устанавливаемые KB Labs
components контролируются командой KB Labs. Поддержка hostile third-party
scenario/migration manifests не является целью.

При этом воспроизводимость обязательна:

- каждый catalog имеет schema version, product version и digest;
- plan хранит точный catalog digest;
- update не делает silent fallback на другой catalog;
- migration journal хранит IDs и digests применённых migrations;
- local/dev override всегда отражается в plan source metadata.

### 2.2. Один machine-readable config contract

Scope, ownership, types и merge semantics config paths не дублируются между
Go launcher и TypeScript runtime.

Канонический versioned config contract является частью product catalog либо
отдельного generated artifact:

```text
config contract
  ├─ path schemas
  ├─ scope rules
  ├─ ownership rules
  ├─ merge semantics
  └─ validation constraints
       ↓                    ↓
   Go launcher        TypeScript runtime
```

Текущий `CONFIG_FIELD_SCOPE` должен генерироваться или загружаться из этого
контракта. Ручная параллельная policy map в Go запрещена.

### 2.3. User project config автоматически не переписывается

`project/.kb/kb.config.jsonc` считается user-owned целиком. Автоматические
install/update/migration не перезаписывают его и не меняют байты файла.

Это сохраняет:

- комментарии;
- форматирование;
- порядок полей;
- неизвестные поля;
- ручные пользовательские настройки.

Legacy project values, которые нужно представить в новой schema, проецируются
в отдельный launcher-managed system overlay:

```text
project/.kb/kb.config.jsonc                    user-owned, untouched
project/.kb/generated/kb-create.overlay.jsonc launcher-owned migration projection
project/.kb/overlays/*.jsonc                  user overlays, applied later
```

Runtime загружает system overlay отдельным явным шагом после base project config,
но до `.kb/overlays/*.jsonc`. Приоритет не зависит от имени файла и общей
лексикографической сортировки. Таким образом:

- generated migration projection может адаптировать legacy representation;
- явно заданное пользователем значение в более позднем overlay выигрывает;
- исходный legacy config остаётся доступным для ручной проверки;
- JSONC CST/AST editor не требуется.

Если target path уже явно задан пользователем в base config, migrator не
перетирает его projection’ом. Он сохраняет user value и пишет diagnostic.

Если migration невозможно выразить безопасным overlay без изменения смысла,
update блокируется с proposed diff. Автоматического destructive rewrite нет.

### 2.4. Launcher-owned данные мигрируются напрямую

Следующие данные launcher может изменять:

- `platform/.kb/kb.config.jsonc`;
- `.kb/install.json`;
- launcher-managed system overlay `.kb/generated/kb-create.overlay.jsonc`;
- launcher journals/locks;
- явно launcher-owned generated artifacts.

Для них используются backup, staging, atomic rename, journal и rollback.

### 2.5. Reusable effects вместо копирования patches

Сценарии не дублируют наборы config patches. Product catalog объявляет
переиспользуемые effects:

```json
{
  "id": "gateway.access.local",
  "config": [
    {
      "scope": "platform",
      "operation": "set",
      "path": "/gateway/host",
      "value": "127.0.0.1"
    },
    {
      "scope": "platform",
      "operation": "set",
      "path": "/gateway/auth/enabled",
      "value": false
    }
  ]
}
```

Scenario option только выбирает effect:

```json
{
  "value": "local",
  "label": "Local (no login)",
  "effects": ["gateway.access.local"]
}
```

Один effect может использоваться несколькими scenarios без дрейфа.

### 2.6. CI остаётся direct path

Human и Agent используют scenario flow. CI/direct install не эмулирует wizard
answers и не получает scenario defaults.

```text
Human → Scenario + Answers ───────┐
Agent → Scenario + Answers ───────┼→ InstallRequest → compiler → executor
CI    → DirectInstallRequest ─────┘
```

Общими являются normalized request, compiler, plan, assembly и executor.
Orchestration semantics остаются разными.

### 2.7. Execution является crash-safe, не глобально atomic

Package manager нельзя считать транзакционным. План не обещает невозможную
атомарность всей установки.

Контракт исполнения:

```text
inspect → compile → preflight → stage → apply packages
        → commit files/state → verify → complete
```

Config/artifact commit атомарен и rollback-able. Package changes после сбоя
могут потребовать resume/reconcile по journal.

## 3. Текущее состояние и удаляемая бизнес-логика

Сегодня один выбор представлен сразу в нескольких местах:

```text
legacy manifest step
  → wizard-specific state
  → Selection field
  → create.go branch
  → scaffold template
  → reverse parsing в update
```

Основные источники product logic:

- `internal/manifest/types.go`: legacy `Intent`, `IntentStep`, `IntentBundle`;
- `internal/wizard/wizard.go`: scenario-specific state и handlers;
- `internal/wizard/free_gateway.go`: hardcoded provider options;
- `cmd/create.go`: auth/local/bootstrap decisions;
- `internal/scaffold/scaffold.go`: полный hardcoded renderer;
- `cmd/update.go`: reverse parsing generated config;
- `internal/installer/installer.go`: product-specific `Selection` fields;
- legacy migration helpers в `scaffold.go`.

Все перечисленные product decisions должны переехать в manifests/effects.

## 4. Разделение manifest responsibilities

### 4.1. Component/entity manifests

Владеют техническими фактами:

- package и version;
- kind и stable ID;
- capabilities и requirements;
- config schema и defaults;
- secret requirements;
- commands;
- service metadata;
- собственные namespaced config contributions.

### 4.2. Product catalog

Владеет:

- catalog metadata и digest;
- core packages;
- normalized component index;
- provider preferences;
- reusable effects;
- output contracts;
- config contract;
- migration graphs;
- scenario references.

### 4.3. Scenario manifests

Владеют product flow:

- pages/sections/fields;
- copy;
- defaults;
- conditions;
- выбором components/providers/effects;
- completion contract.

Scenario не дублирует package names, capability facts и config patch bodies,
которые уже объявлены component manifests или reusable effects.

## 5. Scenario contract

### 5.1. Versioned schema

Новая schema: `kb.scenario/2`.

```json
{
  "schema": "kb.scenario/2",
  "id": "custom",
  "title": "Custom platform",
  "selection": {
    "components": ["service:gateway", "service:studio"]
  },
  "pages": [
    {
      "id": "access",
      "title": "Studio access",
      "sections": [
        {
          "id": "gateway",
          "fields": [
            {
              "id": "access.mode",
              "type": "choice",
              "label": "How do you want to access Studio?",
              "default": "local",
              "options": [
                {
                  "value": "local",
                  "label": "Local (no login)",
                  "effects": ["gateway.access.local"]
                },
                {
                  "value": "secured",
                  "label": "Secured",
                  "effects": ["gateway.access.secured"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 5.2. Generic field vocabulary

Первоначальный закрытый набор:

- `directory`;
- `choice`;
- `multiChoice`;
- `provider`;
- `text`;
- `secret`;
- `confirm`.

Добавление нового field type означает generic UI capability, а не новый
product scenario handler.

### 5.3. Conditions и validation

Поддерживаются только declarative predicates:

- `equals`;
- `notEquals`;
- `exists`;
- `allOf`;
- `anyOf`;
- `not`.

Validation vocabulary:

- `required`;
- `nonEmpty`;
- `oneOf`;
- `pattern`;
- `minLength`/`maxLength`.

Arbitrary scripts и executable expressions запрещены.

### 5.4. Secrets

Secrets никогда не сериализуются в answers, plan или runtime config.

Field объявляет binding:

```json
{
  "id": "gateway.bootstrap.password",
  "type": "secret",
  "env": "GATEWAY_BOOTSTRAP_ADMIN_PASSWORD",
  "requiredWhen": {
    "path": "access.mode",
    "equals": "secured"
  }
}
```

State хранит только факт `configured: true` и binding metadata. Значение идёт
в secret store или project `.env` через typed secret artifact handler.

## 6. Effects и config assembly

### 6.1. Effect contract

Effect может объявлять:

- config patches;
- component additions/removals;
- provider preferences;
- artifacts;
- secret bindings;
- readiness requirements.

Effect ID стабилен и уникален в catalog.

### 6.2. Patch ownership

Manifest не задаёт произвольный owner. Compiler выводит owner из source:

```text
catalog:effect/gateway.access.local
component:service/gateway
provider:cache/state-broker
scenario:custom
launcher:platform-root
```

### 6.3. Patch precedence

Фиксированный порядок:

```text
config contract defaults
→ catalog defaults
→ selected component contributions
→ resolved provider contributions
→ selected reusable effects
→ explicit direct-request overrides
→ user project config/runtime overlays вне launcher assembly
```

Две записи одного path на одном уровне являются conflict, даже если значения
совпадают. Cross-level override разрешён только config contract policy.

### 6.4. Outputs

Assembly создаёт typed outputs:

- platform runtime config;
- project pointer при первом install;
- launcher-managed migration overlay;
- secret env artifact;
- workflows и другие generated artifacts;
- install state и provenance.

Каждый output имеет root, scope, ownership, overwrite policy и permissions.

## 7. Версионирование

Каждый subject версионируется независимо:

```text
kb.catalog/N
kb.scenario/N
kb.entity/N
kb.platform-config/N
kb.project-config/N
kb.install-state/N
kb.migration/N
```

Migration всегда содержит subject:

```json
{
  "schema": "kb.migration/1",
  "subject": "kb.install-state",
  "from": 1,
  "to": 2
}
```

Запрещено использовать одну общую `version` для нескольких независимых
контрактов.

Scenario schema migration нужна для разработки/release catalog, но launcher
после cutover принимает только текущую scenario schema. Legacy scenario
runtime compatibility не сохраняется.

Config/install-state migrations поддерживаются, потому что относятся к
пользовательским установкам и данным.

## 8. Declarative migration engine

### 8.1. Migration graph

Catalog содержит directed acyclic graph для каждого subject:

```text
kb.install-state:    1 → 2 → 3
kb.platform-config:  1 → 2
kb.project-config:   legacy-a → 1
                     legacy-b → 1
```

Compiler обязан найти ровно один migration path. Ноль или несколько путей —
structured error до любых side effects.

### 8.2. Legacy format detection

Legacy schema определяется детерминированно:

1. explicit schema marker;
2. install-state launcher version/source metadata;
3. exact fingerprint известного generated baseline;
4. structural discriminator из migration manifest;
5. иначе `legacy-unknown` и safe stop.

Нельзя выбирать migration только по наличию одного неоднозначного поля.

Catalog должен содержать fixtures/fingerprints всех опубликованных legacy
launcher layouts, которые поддерживает update.

### 8.3. Bootstrap ownership для legacy

Для установок без provenance:

- exact match с известным generated baseline считается launcher-owned;
- известные generated paths конкретной launcher version считаются managed,
  только если их значения совпадают с baseline;
- отличающееся значение считается user-modified;
- неизвестный path считается user-owned;
- неоднозначный path не меняется и создаёт conflict diagnostic.

После первой успешной migration создаётся полноценный provenance snapshot.

### 8.4. Ограниченный migration DSL

Базовый набор операций:

- `add`;
- `replace`;
- `remove`;
- `copy`;
- `move`;
- `test`;
- `setIfMissing`;
- `mergeObject`;
- `mapValue`.

Predicates:

- `exists`;
- `equals`;
- `typeIs`;
- `allOf`/`anyOf`/`not`.

Для каждой операции schema фиксирует поведение при missing path, null, type
mismatch и existing target. Операции обязаны быть детерминированными.

`split`, arbitrary templates, scripts и product-specific Go handlers не входят
в первую версию. Сложная migration выражается несколькими guarded operations.
Если выразить её невозможно, сначала расширяется общий DSL и его schema.

### 8.5. Project migration projection

Migration project config выполняется in-memory, но результат не записывается
обратно в user file.

Migrator вычисляет минимальный overlay, содержащий только target-schema values,
которые нужны для эквивалентного effective config.

Правила:

- existing user target value выигрывает;
- unknown fields не копируются в generated overlay и продолжают жить в base;
- obsolete source fields остаются в user file, но runtime использует target
  projection;
- launcher overlay содержит source schema, target schema, migration IDs и
  source content hash;
- если source hash изменился, projection пересчитывается;
- пользовательские overlays применяются после launcher overlay.

### 8.6. Launcher-owned migration

Platform config и install state мигрируются непосредственно:

1. read;
2. detect schema;
3. resolve unique chain;
4. apply in-memory;
5. validate target schema;
6. stage backup и target;
7. commit atomic rename;
8. verify read-back;
9. record journal/provenance.

## 9. Update contract

### 9.1. Desired state

Новый install state хранит:

```json
{
  "schema": "kb.install-state/2",
  "mode": "scenario",
  "scenarioId": "custom",
  "answers": {
    "access.mode": "local"
  },
  "catalog": {
    "version": "...",
    "digest": "..."
  },
  "configSchemas": {
    "platform": 2,
    "project": 2
  },
  "lastPlanHash": "...",
  "provenance": []
}
```

Direct install state хранит normalized direct request вместо scenario/answers.

### 9.2. Update flow

```text
lock
→ inspect current state/files/catalog
→ detect and plan migrations
→ resolve desired state from saved scenario answers or direct request
→ compile complete new InstallPlan
→ validate ownership/conflicts
→ show plan
→ stage config/artifacts/backups
→ apply package actions
→ commit launcher-owned files and managed overlay
→ verify effective config and readiness
→ commit install state/journal last
→ unlock
```

### 9.3. Force semantics

`--force` не означает “создать пустые options и перетереть config”.

Он означает явный reset desired state:

- scenario mode: применить defaults текущей версии scenario;
- direct mode: применить catalog defaults плюс explicit direct flags;
- user project config и user overlays не меняются;
- launcher-managed projection пересобирается;
- reset отображается в plan до выполнения.

### 9.4. Drift

До update сравниваются:

- current launcher-owned file hash;
- previous generated baseline/provenance;
- current user project hash;
- managed overlay source hash;
- catalog digest;
- saved plan hash.

User drift не исправляется автоматически. Managed drift либо пересобирается по
plan, либо блокируется, если ownership неоднозначен.

## 10. Crash-safe execution и recovery

### 10.1. Preflight

До side effects проверяются:

- manifest/catalog schemas;
- unique migration paths;
- config conflicts;
- artifact path safety;
- permissions;
- disk space;
- package availability;
- target config validation;
- возможность создать backups/staging files.

### 10.2. Staging

Все launcher-owned file outputs сначала материализуются в transaction staging
directory на том же filesystem, что и targets.

Journal создаётся до первой mutation и содержит:

- transaction ID;
- plan hash;
- old/new catalog digest;
- staged targets;
- backups;
- action status;
- rollback status.

### 10.3. Commit order

1. package actions;
2. generated runtime config/artifacts;
3. managed migration overlay;
4. effective-config/readiness verification;
5. install state и provenance;
6. transaction complete marker.

Install state коммитится последним, поэтому он никогда не утверждает, что
незавершённый plan успешно применён.

### 10.4. Failure behavior

- file commits откатываются из backup;
- package actions используют handler rollback, когда доступно;
- необратимые package changes остаются в `needs-reconcile` journal state;
- следующий запуск предлагает resume/reconcile, а не начинает новый plan;
- user-owned files не участвуют в rollback, потому что launcher их не меняет.

## 11. Фазы реализации

### Phase 0 — Contract freeze

- определить `kb.catalog/2`, `kb.scenario/2`, `kb.migration/1`,
  `kb.install-state/2`;
- создать единый config contract;
- зафиксировать reusable effect schema;
- зафиксировать patch precedence/conflicts;
- зафиксировать migration DSL semantics;
- зафиксировать transaction/recovery state machine;
- собрать inventory всех hardcoded product decisions и назначить каждому
  manifest destination;
- запретить добавление новой scenario-specific логики в legacy path.

Exit criteria: schemas и fixtures review-approved; unresolved architectural
TODO отсутствуют.

### Phase 1 — Catalog, effects и config contract

- расширить normalized catalog effects/migrations/config contract;
- генерировать/загружать scope policy в TypeScript runtime;
- убрать ручное дублирование config policy;
- добавить catalog digest/source metadata;
- добавить строгую catalog validation;
- добавить effect conflict validation.

Exit criteria: catalog полностью самодостаточен до package installation.

### Phase 2 — Flow compiler

- расширить generic `flow.Field` и `flow.Option`;
- разрешать option → effect references;
- компилировать scenario state в normalized `InstallRequest`;
- сохранять только non-secret answers;
- реализовать Human и Agent conformance;
- оставить CI на `DirectInstallRequest`.

Exit criteria: ни один новый scenario не требует Go handler.

### Phase 3 — Migration engine и legacy adoption

- реализовать version graph resolver;
- реализовать ограниченный DSL;
- добавить legacy detectors/fingerprints/fixtures;
- реализовать conservative ownership bootstrap;
- реализовать managed project overlay projection;
- реализовать migration journal;
- мигрировать legacy install state;
- мигрировать legacy platform config;
- описать project config projections.

Exit criteria: каждая опубликованная legacy layout имеет fixture и ровно один
safe migration path либо явно объявлена unsupported с actionable diagnostic.

### Phase 4 — Transactional executor

- добавить transaction staging;
- preflight всех outputs до mutations;
- backup/rollback file set;
- resume/reconcile journal;
- commit install state last;
- verify effective config после overlay application;
- recovery tests с fault injection после каждого action.

Exit criteria: любой injected failure приводит к previous usable state либо
явному resumable `needs-reconcile`, но не к ложному success.

### Phase 5 — Migrate product scenarios

Перевести в manifests/effects:

- `explore`;
- `release`;
- `commit`;
- `ai-review`;
- `plugin-author`;
- `custom`;
- extensions;
- LLM/provider setup;
- Studio access;
- gateway auth/bootstrap;
- analytics/telemetry;
- completion contracts;
- adapter defaults;
- plugin-specific defaults;
- service toggles/routes.

Exit criteria: hardcode inventory закрыт полностью; для каждой старой branch
указан manifest/effect/migration replacement.

### Phase 6 — Route commands through one core

- `create` → scenario compiler;
- `agent` → scenario compiler;
- `install` → direct compiler;
- `update` → migration + saved desired state + common compiler;
- все команды → common executor;
- Cobra commands становятся thin wrappers;
- сохраняется новый install state/provenance.

Exit criteria: legacy path не используется production invocations.

### Phase 7 — Breaking cutover и удаление legacy

После conformance и migration journeys удалить:

- legacy wizard implementation;
- legacy `Intent`, `IntentStep`, `IntentBundle`;
- scenario-specific step handlers/state;
- `Selection` product fields (`LocalMode`, `LLMProvider` и аналоги);
- `create.go` product branches;
- `generateFull` и scaffold renderer;
- `pluginInnerConfig`;
- `servicesWithoutToggle`;
- `DefaultAdapterRoles` и hardcoded fallbacks;
- `ReadPlatformOptions` reverse parser;
- `migrateLegacyProjectConfig`;
- `reconcileLegacyUpstreams`;
- legacy/default selection paths;
- engine feature flag и compatibility runtime.

Migration manifests/fixtures остаются: это data compatibility, не legacy
runtime implementation.

Exit criteria: один flow/plan/executor path и один product catalog.

## 12. Тестовая стратегия

### 12.1. Contract validation

- schema versions;
- duplicate IDs;
- unknown effects/components/providers;
- unknown field/migration operations;
- invalid JSON pointers;
- invalid scopes;
- secret leakage;
- cyclic/ambiguous migration paths;
- effect conflicts;
- config contract drift между Go и TypeScript.

### 12.2. Determinism

- одинаковые inputs дают одинаковый `InstallRequest`;
- одинаковый request/catalog дают одинаковый `InstallPlan` и `planHash`;
- map iteration не влияет на output;
- catalog source/fallback отражается в hash/metadata;
- Human и Agent с одинаковыми answers дают одинаковый request;
- Direct request не получает scenario defaults.

### 12.3. User config preservation

- project config остаётся byte-for-byte идентичным;
- комментарии/format/order сохраняются;
- unknown fields сохраняются;
- existing user target path выигрывает;
- user overlay выигрывает у managed overlay;
- managed overlay пересчитывается при source hash change;
- невозможная projection блокирует update без mutations.

### 12.4. Legacy migration matrix

Для каждой поддерживаемой released layout:

- fixture исходного install state;
- fixture platform config;
- fixture project config;
- expected detector;
- expected migration chain;
- expected managed overlay;
- expected target state;
- expected provenance;
- idempotent second run.

Отдельные cases:

- exact generated legacy config;
- user-modified generated field;
- unknown field;
- ambiguous layout;
- missing migration;
- conflicting target path;
- platform == project;
- platform != project.

### 12.5. Transaction fault injection

Инъекция сбоя:

- после lock;
- после journal create;
- после staging;
- после package install;
- после каждого file rename;
- перед/после effective verification;
- перед install-state commit;
- после install-state commit до complete marker.

Каждый test проверяет rollback или resumable recovery.

### 12.6. Scenario journeys

Для каждого scenario:

```text
scenario → answers → request → plan → execute
         → effective config → update → migration/recompile → verify
```

Обязательные journeys:

- local/no-auth;
- secured/bootstrap;
- custom adapters;
- LLM provider + secret;
- Studio extension;
- plugin author;
- CI/direct install;
- update без changes;
- update с catalog/config migration;
- `--force` reset;
- recovery после interrupted update.

## 13. Критерии завершения

Cutover завершён, когда:

- product decisions отсутствуют в Go command/wizard/scaffold code;
- все product choices ссылаются на manifest effects;
- config scope/ownership имеет один machine-readable source;
- user project config никогда не переписывается автоматически;
- все поддерживаемые legacy layouts имеют deterministic migration path;
- update не восстанавливает intent reverse parsing’ом runtime config;
- install state хранит scenario answers либо direct request;
- executor crash-safe и имеет tested recovery;
- Human и Agent используют один scenario compiler;
- CI использует direct compiler и общий plan/executor;
- legacy runtime path удалён;
- engine flag удалён;
- hardcode inventory пуст;
- repo-wide search не находит scenario IDs/config defaults в Go за пределами
  generic fixtures/tests.

## 14. Рекомендуемый порядок коммитов

1. `docs(kb-create): freeze declarative catalog contracts`
2. `feat(kb-create): add shared config contract and generated runtime policy`
3. `feat(kb-create): add reusable catalog effects`
4. `feat(kb-create): compile scenario answers into install requests`
5. `feat(kb-create): add versioned migration graph and DSL`
6. `feat(kb-create): add legacy detection and ownership adoption`
7. `feat(kb-create): add managed project migration overlay`
8. `feat(kb-create): add transaction staging and recovery journal`
9. `feat(kb-create): migrate product scenarios and effects`
10. `refactor(kb-create): route create agent install and update through plans`
11. `test(kb-create): add migration matrix and fault-injection journeys`
12. `refactor(kb-create): delete legacy wizard and scaffold renderer`
13. `refactor(kb-create): delete legacy installer and update compatibility code`

Удаление отдельных legacy полей до готовности contracts, migration matrix и
recovery path запрещено. После их готовности legacy удаляется полностью одним
направленным cutover’ом по ADR-0035.
