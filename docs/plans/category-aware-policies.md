# Category-Aware Development Policies

## Цель

Система сама определяет правила для задачи на основе затронутых категорий. Разработчик/агент участвует только на входе (задача) и выходе (approve/reject). Всё между — автоматика.

## Модель

```
"Add retry to mind search"
  ↓
DETECT     → plugins/kb-labs-mind → category: plugins
  ↓
POLICY     → plugin policy: sdk-only deps, plugin.js eslint, full QA
  ↓
SETUP      → branch: code/add-retry-mind-search, draft PR with plugin checklist
  ↓
EXECUTE    → dev-cycle workflow (plan → implement → review loop → QA → commit)
  ↓
VALIDATE   → boundary check, impact analysis, QA regressions
  ↓
DELIVER    → PR ready, notify owner
  ↓
OWNER      → approve/reject/rework
```

## Category Config

```json
// .kb/categories.json
{
  "categories": {
    "platform": {
      "paths": ["platform/*"],
      "eslint": "node",
      "qa": "full",
      "review": "ai",
      "release": "semver",
      "branchPrefix": "code",
      "policies": {}
    },
    "infra": {
      "paths": ["infra/*"],
      "eslint": "node",
      "qa": "full",
      "review": "ai",
      "release": "semver",
      "branchPrefix": "code",
      "policies": {}
    },
    "plugins": {
      "paths": ["plugins/*"],
      "eslint": "plugin",
      "qa": "full",
      "review": "ai",
      "release": "semver",
      "branchPrefix": "code",
      "policies": {
        "sdk-only-deps": true
      }
    },
    "templates": {
      "paths": ["templates/kb-labs-plugin-template"],
      "eslint": "plugin",
      "qa": "full",
      "review": "ai",
      "release": "semver",
      "branchPrefix": "code",
      "policies": {
        "sdk-only-deps": true
      }
    },
    "sdk": {
      "paths": ["platform/kb-labs-sdk"],
      "eslint": "node",
      "qa": "full",
      "review": "ai+manual",
      "release": "semver-strict",
      "branchPrefix": "release",
      "policies": {
        "no-breaking-without-major": true,
        "no-rollback-minor-patch": true,
        "api-compat-check": true,
        "require-migration-guide-on-major": true
      }
    }
  },

  "policyDefinitions": {
    "sdk-only-deps": {
      "description": "Package can only depend on @kb-labs/sdk + own internal packages",
      "enforcement": "eslint",
      "preset": "plugin.js"
    },
    "no-breaking-without-major": {
      "description": "Cannot remove or rename exported symbols without major version bump",
      "enforcement": "pre-merge",
      "check": "api-compat-diff"
    },
    "no-rollback-minor-patch": {
      "description": "Cannot decrease minor/patch version once published",
      "enforcement": "pre-merge",
      "check": "version-check"
    },
    "api-compat-check": {
      "description": "Run API compatibility diff before merge",
      "enforcement": "pre-merge",
      "check": "api-diff"
    },
    "require-migration-guide-on-major": {
      "description": "Major version bump requires migration guide document",
      "enforcement": "pre-merge",
      "check": "migration-guide-exists"
    }
  }
}
```

## Интеграция в существующий flow

### dev-start (обогащённый)

```
pnpm start "задача"
  ↓
  1. Workspace status (existing)
  2. NEW: Detect affected categories
     - Parse task description (LLM or keyword matching)
     - Or ask user: "Which repo? [plugins/kb-labs-mind]"
  3. NEW: Load category config → merge policies
  4. Create branch with correct prefix (code/ vs release/)
  5. Create PR with category-specific template
  6. Save context + policies to .kb/tmp/current-task.json
```

### dev-done (обогащённый)

```
pnpm done
  ↓
  1. Load context + policies (existing)
  2. Find changed repos (existing)
  3. NEW: Validate policies:
     - sdk-only-deps → run eslint with plugin preset
     - api-compat-check → run api-diff
     - no-breaking-without-major → check version bump
     - no-rollback → check version not decreased
  4. QA regressions (existing, type-aware)
  5. Impact analysis (existing)
  6. Sync + push + PR ready (existing)
```

### dev-cycle (обогащённый)

```
dev-cycle workflow now receives policies in input:
  --input='{"task":"...", "policies": ["sdk-only-deps", "api-compat-check"]}'

Agent is instructed via system prompt:
  "You are working on a plugin. You can ONLY import from @kb-labs/sdk."

Review gate applies category-specific rules.
```

## Policy Checks — Implementation

### sdk-only-deps
Already done: `devkit/eslint/plugin.js` with `no-restricted-imports`.

### api-compat-check
```bash
# Compare current exports with published version
pnpm kb sdk api-diff

# Implementation:
# 1. Get published package: npm pack @kb-labs/sdk@latest
# 2. Extract .d.ts files
# 3. Compare exported symbols: added/removed/changed
# 4. REMOVED or CHANGED = breaking → block unless --major
```

### no-rollback-minor-patch
```bash
# Compare current version with npm registry
CURRENT=$(node -e "console.log(require('./package.json').version)")
PUBLISHED=$(npm show @kb-labs/sdk version 2>/dev/null || echo "0.0.0")
# semver compare: CURRENT must be >= PUBLISHED
```

### require-migration-guide-on-major
```bash
# If version bump is major, check for docs/migrations/vX.md
VERSION=$(node -e "console.log(require('./package.json').version)")
MAJOR=$(echo $VERSION | cut -d. -f1)
[ -f "docs/migrations/v${MAJOR}.md" ] || exit 1
```

## Этапы реализации

### Phase 1: Category detection (быстро)
- `.kb/categories.json` config
- `detect-category.mjs` utility
- Integration in dev-start: auto-detect from repo path

### Phase 2: Policy validation in dev-done (medium)
- Policy runner: iterate policies → run checks → block/warn
- Integration in dev-done workflow: step between QA and sync

### Phase 3: SDK-specific checks (medium)
- `api-diff` tool: compare .d.ts exports with published
- `version-check`: semver comparison with registry
- Pre-merge block on violations

### Phase 4: Agent-aware policies (future)
- Pass policies to dev-cycle as agent constraints
- Agent system prompt includes boundary rules
- Agent auto-selects correct eslint preset

## Файлы

| Файл | Описание |
|------|----------|
| `.kb/categories.json` | Category → policy mapping |
| `scripts/detect-category.mjs` | Utility: path → category |
| `scripts/check-policies.mjs` | Policy runner |
| `.kb/workflows/dev-start.yml` | Uses detect-category |
| `.kb/workflows/dev-done.yml` | Uses check-policies |
| `infra/kb-labs-devkit/eslint/plugin.js` | Plugin boundary enforcement ✅ |
| `infra/kb-labs-devkit/eslint/node.js` | Platform/infra preset ✅ |

## Критерии готовности

1. `pnpm start "задача"` автоматически определяет категорию и применяет правила
2. `pnpm done` блокирует при нарушении policies (sdk breaking change без major)
3. ESLint ловит boundary нарушения в IDE (не в CI)
4. Агенты получают constraints через system prompt
5. Человек участвует только в start (задача) и finish (approve/reject)
