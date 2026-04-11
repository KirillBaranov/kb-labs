# Test Plan: Critical Paths

> Отчёт по gap'ам в тестовом покрытии и план работ.
> Дата: 2026-04-11

## Текущее состояние

- **346 тестовых файлов** по монорепо
- Фреймворк: **Vitest 3.2.4**, пресеты в `infra/devkit/vitest/`
- Утилиты: `@kb-labs/shared-testing` (mockLLM, mockCache, mockStorage, testCommand, etc.)
- Покрытие **неравномерное**: core/runtime и agents — плотно, инфраструктурные слои — дырявые

---

## Приоритет 1 — Фундамент (без этого всё ломается молча)

### 1.1 CLI Runtime — middleware & context (0 тестов, ~30 файлов)

**Путь:** `cli/runtime/src/`

**Что тестировать:**
- `MiddlewareManager` — цепочка dispatch, порядок выполнения, error propagation
- `RuntimeContext` — создание контекста с presenter/output/logger
- Presenter modes — JSON vs text rendering (важно для machine-readable output)
- Formatter registry — выбор и применение форматов (table, markdown, yaml)
- Lifecycle hooks — init/destroy плагинов

**Тесты:**
```
cli/runtime/src/__tests__/
  middleware-manager.test.ts    — chain execution, ordering, error propagation, empty chain
  runtime-context.test.ts       — context creation, presenter selection, defaults
  presenter-json.test.ts        — structured output, error formatting
  presenter-text.test.ts        — human-readable output, colours, progress
  formatter-registry.test.ts    — format selection, unknown format fallback
  lifecycle-manager.test.ts     — init/destroy ordering, error in hook
```

---

### 1.2 Workspace Root Resolver (1 тест, 427 строк логики)

**Путь:** `core/workspace/src/root-resolver.ts`

**Что тестировать:**
- `resolvePlatformRoot()` — walk-up по FS, 6 fallback уровней
- `resolveProjectRoot()` — поиск `.kb/kb.config.json`
- `isInsidePnpmStore()` — детект виртуальных `.pnpm/` путей
- Workspace detection — `pnpm-workspace.yaml` для монорепо
- Env variable precedence — `KB_PLATFORM_ROOT`, `KB_PROJECT_ROOT`
- Composite `resolveRoots()` — оба резолвера вместе
- Edge cases: nested workspaces, все стратегии fail, symlinks

**Тесты:**
```
core/workspace/src/__tests__/
  resolve-platform-root.test.ts  — все 6 уровней fallback, pnpm store skip
  resolve-project-root.test.ts   — .kb/ detection, env vars, missing config
  resolve-roots.test.ts          — composite resolver, monorepo, installed mode
```

---

### 1.3 Discovery Manager (3 теста, 265 строк бизнес-логики)

**Путь:** `core/discovery/src/discovery-manager.ts`

**Что тестировать:**
- Lock file parsing — чтение `marketplace.lock`, невалидный формат
- Manifest loading — динамический import с 5s timeout, fallback
- SRI integrity verification — hash match, hash mismatch, missing hash
- Disabled plugin detection — пропуск disabled entries
- Manifest ID validation — mismatch между lock и реальным manifest
- Duplicate detection — два пакета с одним ID
- Entity kind extraction — CLI commands, REST routes, workflows, adapters
- Error recovery — missing package.json, corrupt manifest, empty lock

**Тесты:**
```
core/discovery/src/__tests__/
  discovery-manager.test.ts       — full discovery flow, disabled plugins, errors
  integrity-verification.test.ts  — SRI hash check, mismatch, missing
  manifest-loader.test.ts         — dynamic import, timeout, corrupt manifest
  marketplace-lock.test.ts        — CRUD operations, format validation
```

---

### 1.4 CLI Bootstrap — plugin dispatch (9 тестов, но dispatch path = 0)

**Путь:** `cli/bin/src/runtime/bootstrap.ts`

**Что тестировать:**
- `resolveCommand()` — group matching, manifest ID matching, ambiguous commands
- `dispatchPlugin()` — handler loading, context setup, execution
- `executeViaGateway()` — fallback через gateway HTTP
- Error mapping — exit codes, error presenter
- Early exits — `--help`, `--version`, `--limits`
- Middleware chain — `runtime.middleware.execute()` вызов

**Тесты:**
```
cli/bin/src/__tests__/
  resolve-command.test.ts       — exact match, group match, ambiguous, not found
  dispatch-plugin.test.ts       — handler loading, context, execution, errors
  execute-via-gateway.test.ts   — HTTP fallback, auth, timeout
  bootstrap-error-handling.test.ts — exit codes, JSON vs text errors
```

---

## Приоритет 2 — Сервисы (daemon bootstrap, state, marketplace)

### 2.1 State Daemon (1 тест, ~5 файлов)

**Путь:** `plugins/state/daemon/src/`

**Что тестировать:**
- Bootstrap sequence — `bin.ts` → `bootstrap.ts` → server ready
- HTTP server setup — middleware chain, route registration
- State CRUD — get, set, delete, list
- Concurrent access — race conditions при параллельных writes
- Persistence — state durability, restart recovery

**Тесты:**
```
plugins/state/daemon/src/__tests__/
  bootstrap.test.ts          — startup sequence, port binding, graceful shutdown
  state-operations.test.ts   — CRUD, key validation, large values
  concurrency.test.ts        — parallel writes, read-after-write consistency
```

---

### 2.2 Marketplace Install Flow (4 теста, 495 строк service)

**Путь:** `plugins/marketplace/core/src/marketplace-service.ts`

**Что тестировать:**
- `install()` — resolve → pnpm install → lock write → cache → afterInstall hook
- `uninstall()` — beforeUninstall hook → lock remove → cache clear → disk cleanup
- `link()` / `unlink()` — local development workflow
- `sync()` — glob-based auto-discovery монорепо пакетов
- `doctor()` — integrity check, signature validation
- `enable()` / `disable()` — toggle плагинов
- Error recovery — network fail, disk full, permission denied

**Тесты:**
```
plugins/marketplace/core/src/__tests__/
  install-flow.test.ts       — happy path, already installed, version conflict
  uninstall-flow.test.ts     — happy path, hooks, not found
  link-unlink.test.ts        — local linking, path resolution
  sync-discovery.test.ts     — glob patterns, monorepo packages
  doctor.test.ts             — integrity check, signature validation
  enable-disable.test.ts     — toggle, already enabled/disabled
```

---

### 2.3 Workflow Daemon — bootstrap & approvals

**Путь:** `plugins/workflow/daemon/src/`

**Что тестировать:**
- Daemon bootstrap — `bin.ts` startup, service wiring
- Approval lifecycle — request → pending → approved/rejected → execute
- Error recovery — scheduler failures, job crash, retry logic
- Host Agent connection — WebSocket setup, reconnect

**Тесты:**
```
plugins/workflow/daemon/src/__tests__/
  bootstrap.test.ts           — startup sequence, dependencies
  approval-lifecycle.test.ts  — full approval flow, timeout, rejection
  error-recovery.test.ts      — scheduler crash, job retry, dead letter
```

---

### 2.4 REST API — config & routes

**Путь:** `plugins/rest-api/core/src/`

**Что тестировать:**
- Config loading & validation — schema, merging from multiple plugins
- Route registration — multi-plugin route combination, conflicts
- `manifestToRegistryEntry()` — manifest → Studio registry transformation

**Тесты:**
```
plugins/rest-api/core/src/__tests__/
  config-loader.test.ts          — schema validation, merge, defaults
  route-registration.test.ts     — multi-plugin routes, conflicts, ordering
  studio-registry.test.ts        — manifest transformation, missing fields
```

---

## Приоритет 3 — Isolation & Safety

### 3.1 Sandbox (0 тестов, 74 файла)

**Путь:** `core/sandbox/src/`

**Что тестировать (выборочно, самое критичное):**
- `InprocessRunner` — context isolation, handler execution, cleanup
- Error handling — uncaught exceptions, unhandled rejections, crash reporter
- Cancellation — timeout enforcement, AbortSignal propagation
- IPC serializer — context round-trip для subprocess handlers

**Тесты:**
```
core/sandbox/src/__tests__/
  inprocess-runner.test.ts    — handler execution, context isolation, cleanup
  error-handling.test.ts      — uncaught exception, rejection, crash report
  cancellation.test.ts        — timeout, abort signal, cleanup after cancel
  ipc-serializer.test.ts      — serialize/deserialize context round-trip
```

> Profiling, time-travel, observability — отложить. Это dev-tools, не production path.

---

### 3.2 Tenant Rate Limiter (0 тестов)

**Путь:** `core/tenant/src/rate-limiter.ts`

**Что тестировать:**
- Rate limit enforcement — quota, window, burst
- Quota reset — time-based, manual
- Multi-tenant isolation — tenant A не влияет на tenant B

**Тесты:**
```
core/tenant/src/__tests__/
  rate-limiter.test.ts    — enforcement, reset, burst, multi-tenant isolation
```

---

## Приоритет 4 — Установка платформы (kb-create happy path)

Установка — первый контакт пользователя с продуктом. Если тут ломается, дальше никто не дойдёт.

### Полный happy path (9 шагов)

```
kb-create [dir] [--yes] [--demo]
  │
  ├─ 1. Wizard           → Selection (platformDir, projectCWD, services, plugins, consent)
  ├─ 2. Project Detection → ProjectProfile (languages, PM, frameworks, monorepo)
  ├─ 3. Telemetry Init    → Client (deviceId, credentials) | Nop
  ├─ 4. Manifest Load     → Manifest (core + services + plugins + binaries)
  │                         fallback: remote → local file → embedded
  ├─ 5. Installation
  │     ├─ 5a. mkdir platformDir
  │     ├─ 5b. init logger → .kb/kb.install.log
  │     ├─ 5c. detect PM (pnpm | npm)
  │     ├─ 5d. pnpm add <all packages>     ← single invocation, критично
  │     ├─ 5e. install binaries (kb-dev, kb-devkit) → ~/.local/bin/
  │     ├─ 5f. scan node_modules → .kb/marketplace.lock + .kb/devservices.yaml
  │     ├─ 5g. symlink kb CLI → ~/.local/bin/kb
  │     └─ 5h. write .kb/kb.config.json (0600)
  ├─ 6. Scaffold          → .kb/kb.config.jsonc (adapters, services, plugins)
  │                         + demo: .kb/workflows/demo.yaml
  ├─ 7. First Commit      → (if git repo + dirty) offer `kb commit commit`
  ├─ 8. Claude Assets     → .claude/skills/*, CLAUDE.md merge, .claude/.kbstate.json
  └─ 9. Output            → summary, next steps, telemetry flush
```

### Что уже есть по тестам (Go)

| Файл | Покрывает |
|------|-----------|
| `detect_test.go` | язык, PM, frameworks |
| `pm_test.go` | npm/pnpm command construction |
| `config_test.go` | config marshaling |
| `claude_test.go` | skill copy, CLAUDE.md merge/strip |
| `manifest/loader_test.go` | fallback chain (remote → local → embedded) |
| `wizard_test.go` | state machine |
| `scaffold_test.go` | config generation |
| `installer_test.go` | install orchestration |
| `scan_test.go` | manifest scanning |
| `e2e_test.go` | `--yes` happy path, doctor, status |

### Что НЕ покрыто

**Критичные gap'ы:**

1. **Package install failure & recovery** — что происходит когда `pnpm add` падает на середине? Нет rollback тестов
2. **Manifest scan edge cases** — scanner.js timeout (30s), пустой node_modules, битые package.json
3. **Config write integrity** — concurrent writes, disk full, permissions
4. **Binary install fallback** — download fail → continue, checksum mismatch
5. **Symlink creation** — existing symlink, broken symlink, no ~/.local/bin/
6. **Demo workflow scaffolding** — demo.yaml generation, consent → adapter selection
7. **Claude assets edge cases** — missing devkit, manifest schema mismatch, existing user skills preservation
8. **First commit flow** — не git repo, нет изменений, kb не в PATH

**E2E gap'ы:**

9. **Full demo scenario** — `kb-create --demo --yes` → services start → `kb commit` → workflow runs
10. **Upgrade scenario** — запуск `kb-create` на уже установленную платформу
11. **Custom preset** — выбор конкретных services/plugins, проверка что только они установлены
12. **Different PM** — npm vs pnpm, проверка что оба работают

**Тесты для написания:**

```
tools/kb-create/
  internal/installer/
    recovery_test.go          — pnpm fail mid-install, cleanup verification
    binary_fallback_test.go   — download fail, checksum mismatch, continue

  internal/scan/
    scan_edge_test.go         — timeout, empty modules, corrupt package.json

  internal/scaffold/
    demo_scaffold_test.go     — demo.yaml, consent→adapter mapping

  internal/claude/
    upgrade_test.go           — existing skills preserved, managed section replaced
    missing_devkit_test.go    — graceful skip when devkit not installed

  internal/demo/
    first_commit_test.go      — not git, no changes, kb not in PATH

  e2e/
    demo_e2e_test.go          — full --demo --yes → verify files, config, scan result
    upgrade_e2e_test.go       — re-run on existing platform → no data loss
    custom_preset_e2e_test.go — specific services/plugins → only those installed
    npm_e2e_test.go           — same flow but with npm instead of pnpm
```

---

### 4.2 kb-dev — service lifecycle

**Путь:** `tools/kb-dev/`

**Что тестировать:**
- Start/stop/restart sequencing — dependency order, parallel start
- Health check — retry logic, timeout
- Signal handling — SIGTERM/SIGINT propagation
- Log streaming — real-time tailing

**Связь с kb-create:** после установки пользователь сразу запускает `kb-dev start`. Это продолжение happy path.

**Тесты:**
```
tools/kb-dev/
  internal/manager/
    lifecycle_test.go       — start → healthy → stop, dependency ordering
    restart_test.go         — restart preserves state, signal propagation

  cmd/
    start_stop_test.go      — CLI flags, port conflicts, already running

  e2e/
    services_e2e_test.go    — start all → health check → stop all → clean exit
```

---

## Приоритет 5 — Интеграционные / E2E тесты

### Сквозные сценарии

| # | Сценарий | Шаги | Проверяет |
|---|----------|------|-----------|
| **E2E-1** | **Полная установка** | `kb-create --yes` → verify files → `kb --version` → `kb-dev start` → health check → `kb-dev stop` | Весь happy path от install до running services |
| **E2E-2** | **Demo сценарий** | `kb-create --demo --yes` → `kb-dev start` → `kb commit commit` → verify AI commit message → `kb-dev stop` | Demo flow end-to-end |
| **E2E-3** | **Plugin install** | `kb marketplace install X` → plugin в lock → `kb <command>` доступна | install → discovery → CLI routing |
| **E2E-4** | **CLI pipeline** | `kb <plugin-command> --json` → middleware → handler → JSON output | Полный CLI pipeline |
| **E2E-5** | **Workflow lifecycle** | create workflow → schedule → trigger → execute → result | Workflow engine |
| **E2E-6** | **State persistence** | state set → restart daemon → state get = same value | State durability |
| **E2E-7** | **Upgrade** | `kb-create` на существующую платформу → данные сохранены, пакеты обновлены | Upgrade path |

### Инфраструктура для E2E

Нужно:
- Fixture directory с минимальным проектом (package.json + tsconfig.json)
- Локальный npm registry (verdaccio) для тестов без сети — `--registry http://localhost:4873`
- Cleanup hook: удаление platformDir после каждого теста
- Timeout: 120s на E2E тест (pnpm install может быть медленным)

---

## Порядок работы

```
Phase 1 (фундамент TS):
  1.2 Workspace Resolver     — маленький, критичный, быстро пишется
  1.3 Discovery Manager      — критичный, есть база для расширения
  1.1 CLI Runtime             — 0 тестов, но middleware manager < 60 строк
  1.4 CLI Bootstrap dispatch  — зависит от 1.1 и 1.3

Phase 2 (сервисы):
  2.1 State Daemon
  2.2 Marketplace Install
  2.3 Workflow Daemon
  2.4 REST API config

Phase 3 (safety):
  3.1 Sandbox (выборочно)
  3.2 Tenant Rate Limiter

Phase 4 (установка — Go):
  4.1 kb-create unit gaps     — recovery, scan edges, demo scaffold, claude upgrade
  4.2 kb-create E2E           — demo scenario, upgrade, custom preset, npm
  4.3 kb-dev unit gaps        — lifecycle, restart, signals

Phase 5 (интеграция):
  E2E-1 Полная установка      — самый важный тест во всём проекте
  E2E-2 Demo сценарий         — первое впечатление пользователя
  E2E-3..7 остальные сценарии
```

---

## Метрики успеха

- Все компоненты Priority 1 имеют ≥ 80% покрытие критичных путей
- Daemon bootstrap тесты проходят для state, workflow, marketplace
- Marketplace install → discovery → CLI command работает как интеграционный тест
- `kb-create --yes` → `kb --version` → `kb-dev start` → healthy — проходит как E2E
- Demo сценарий (`kb-create --demo --yes` → commit) — проходит как E2E
- Zero silent failures: каждый критичный path либо работает, либо выдаёт понятную ошибку
