# Plugin Template Refactoring Guide

**Migration from DDD Layers to Functional Organization**

This guide documents the refactoring of `@kb-labs/plugin-template` from Domain-Driven Design (DDD) layered architecture to KB Labs functional folder organization.

---

## Table of Contents

- [Overview](#overview)
- [Why Refactor?](#why-refactor)
- [Before & After](#before--after)
- [Migration Steps](#migration-steps)
- [Breaking Changes](#breaking-changes)
- [Future Growth Path](#future-growth-path)

---

## Overview

**Date:** 2025-11-30
**Branch:** `refactor/flatten-template-structure`
**Status:** ✅ Complete
**ADR:** [ADR-0009: Flatten Plugin Structure](./adr/0009-flatten-plugin-structure.md)

### Key Changes

| Aspect | Before (DDD) | After (Functional) |
|--------|--------------|-------------------|
| **Folders** | 4 DDD layers | 7 functional folders |
| **Path Aliases** | 8 TypeScript aliases | 0 (relative imports) |
| **Package Name** | `plugin-template-cli` | `plugin-template-core` |
| **Files** | 18 TypeScript files | 20 (+ 2 placeholders) |
| **Navigation** | Layer-based | Surface-based |
| **Complexity** | High (DDD concepts) | Low (folder-to-feature mapping) |

---

## Why Refactor?

### Problems with DDD Layers

1. **Over-engineering**: 18-file "hello world" template doesn't need 4 architectural layers
2. **Navigation Complexity**: Finding CLI code required understanding DDD layer rules
3. **Path Alias Pollution**: 8 aliases (`@app/domain/*`, `@app/application/*`) for simple imports
4. **Ecosystem Inconsistency**: devlink-core, mind-engine use functional organization, not DDD
5. **Missing Surfaces**: No clear place for workflows, jobs (future KB Labs surfaces)

### Benefits of Functional Organization

1. **Discoverability**: CLI code in `cli/`, REST in `rest/`, Studio in `studio/`
2. **Simplicity**: Zero path aliases, just relative imports
3. **Consistency**: Matches devlink-core, workflow-runtime patterns
4. **Scalability**: Clear folders for workflows, jobs (future surfaces)
5. **Onboarding**: No DDD knowledge required—just navigate to surface folder

---

## Before & After

### Structure Comparison

#### Before: DDD Layers

```
packages/plugin-template-cli/src/
├── shared/                          # Cross-cutting utilities
│   ├── constants.ts
│   └── index.ts
├── domain/                          # Pure entities
│   ├── entities/
│   │   └── greeting.ts
│   └── index.ts
├── application/                     # Use cases
│   ├── use-cases/
│   │   └── create-greeting.ts
│   └── index.ts
├── infrastructure/                  # External adapters
│   ├── adapters/
│   │   └── logger.ts
│   └── index.ts
├── cli/                             # CLI surface
│   └── commands/
│       └── hello/
│           ├── run.ts
│           └── flags.ts
├── rest/                            # REST surface
│   ├── handlers/
│   └── schemas/
├── studio/                          # Studio surface
│   └── widgets/
├── setup/                           # Setup handler
│   └── handler.ts
├── index.ts
└── manifest.v2.ts
```

**Problems:**
- 🔴 4 DDD layers (shared, domain, application, infrastructure)
- 🔴 8 path aliases in tsconfig.json
- 🔴 Nested `cli/commands/hello/` folder (excessive nesting)
- 🔴 No place for workflows, jobs

#### After: Functional Folders

```
packages/plugin-template-core/src/
├── cli/                             # ✅ CLI surface
│   ├── commands/
│   │   ├── run.ts                   # Moved from cli/commands/hello/run.ts
│   │   ├── flags.ts                 # Moved from cli/commands/hello/flags.ts
│   │   └── index.ts
│   └── index.ts
├── rest/                            # ✅ REST surface
│   ├── handlers/
│   │   ├── hello-handler.ts
│   │   └── context.ts
│   ├── schemas/
│   │   └── hello-schema.ts
│   └── index.ts
├── studio/                          # ✅ Studio surface
│   ├── widgets/
│   │   ├── hello-widget.tsx
│   │   └── index.ts
│   └── index.ts
├── workflows/                       # ✅ Future: workflows surface
│   └── .gitkeep
├── jobs/                            # ✅ Future: jobs surface
│   └── .gitkeep
├── core/                            # ✅ Business logic
│   ├── greeting.ts                  # Moved from domain/entities/greeting.ts
│   ├── create-greeting.ts           # Moved from application/use-cases/create-greeting.ts
│   └── index.ts
├── utils/                           # ✅ Shared utilities
│   ├── logger.ts                    # Moved from infrastructure/adapters/logger.ts
│   ├── constants.ts                 # Moved from shared/constants.ts
│   └── index.ts
├── index.ts
├── manifest.v2.ts
└── setup-handler.ts                 # Moved from setup/handler.ts
```

**Improvements:**
- ✅ 7 functional folders (CLI, REST, Studio, Workflows, Jobs, Core, Utils)
- ✅ 0 path aliases (all relative imports)
- ✅ Flat structure (`cli/commands/run.ts` instead of `cli/commands/hello/run.ts`)
- ✅ Placeholder folders for workflows, jobs

### File Mapping

| Old DDD Path | New Functional Path | Reason |
|--------------|---------------------|--------|
| `domain/entities/greeting.ts` | `core/greeting.ts` | Domain entity → core business logic |
| `application/use-cases/create-greeting.ts` | `core/create-greeting.ts` | Use case → core orchestration |
| `infrastructure/adapters/logger.ts` | `utils/logger.ts` | Adapter → shared utility |
| `shared/constants.ts` | `utils/constants.ts` | Shared → utilities |
| `cli/commands/hello/run.ts` | `cli/commands/run.ts` | Flatten: remove `hello/` nesting |
| `cli/commands/hello/flags.ts` | `cli/commands/flags.ts` | Flatten: remove `hello/` nesting |
| `setup/handler.ts` | `setup-handler.ts` | Move to root (single file) |

### Import Changes

#### Before: Path Aliases

```typescript
// tsconfig.json
{
  "paths": {
    "@app/shared": ["src/shared/index.ts"],
    "@app/domain": ["src/domain/index.ts"],
    "@app/application": ["src/application/index.ts"],
    "@app/infra": ["src/infra/index.ts"]
  }
}

// cli/commands/hello/run.ts
import { createGreetingUseCase } from '@app/application';
import { DEFAULT_GREETING_TARGET } from '@app/shared';
import { createConsoleLogger } from '@app/infra';
```

#### After: Relative Imports

```typescript
// tsconfig.json
{
  // No path aliases needed
}

// cli/commands/run.ts
import { createGreetingUseCase } from '../../core/index.js';
import { DEFAULT_GREETING_TARGET } from '../../utils/index.js';
import { createConsoleLogger } from '../../utils/index.js';
```

---

## Migration Steps

### For Plugin Template Maintainers (Already Done)

This refactoring is already complete. The steps below are for reference and documentation.

#### Step 1: Create New Structure

```bash
cd packages/plugin-cli

# Create new functional folders
mkdir -p src-new/{cli/commands,rest,studio,core,utils,workflows,jobs}

# Add placeholder files
touch src-new/workflows/.gitkeep
touch src-new/jobs/.gitkeep
```

#### Step 2: Move Files

```bash
# Core business logic
cp src/domain/entities/greeting.ts src-new/core/greeting.ts
cp src/application/use-cases/create-greeting.ts src-new/core/create-greeting.ts

# Utilities
cp src/infrastructure/adapters/logger.ts src-new/utils/logger.ts
cp src/shared/constants.ts src-new/utils/constants.ts

# CLI
cp src/cli/commands/hello/run.ts src-new/cli/commands/run.ts
cp src/cli/commands/hello/flags.ts src-new/cli/commands/flags.ts

# Setup
cp src/setup/handler.ts src-new/setup-handler.ts

# Rest, Studio (already flat)
cp -r src/rest/* src-new/rest/
cp -r src/studio/* src-new/studio/
```

#### Step 3: Update Imports

```bash
# Update all @app/* imports to relative paths
# Example: @app/application → ../../core/index.js

# Files updated:
# - src-new/cli/commands/run.ts
# - src-new/core/create-greeting.ts
# - src-new/rest/handlers/hello-handler.ts
```

#### Step 4: Update Configuration

**tsconfig.json** - Remove path aliases:
```diff
  {
    "compilerOptions": {
      "noEmit": true,
-     "jsx": "react-jsx",
-     "paths": {
-       "@app/shared": ["src/shared/index.ts"],
-       "@app/domain": ["src/domain/index.ts"],
-       "@app/application": ["src/application/index.ts"],
-       "@app/infra": ["src/infra/index.ts"]
-     }
+     "jsx": "react-jsx"
    }
  }
```

**package.json** - Update exports and name:
```diff
  {
-   "name": "@kb-labs/plugin-template-cli",
+   "name": "@kb-labs/plugin-template-core",
    "exports": {
      ".": { "import": "./dist/index.js" },
      "./manifest": { "import": "./dist/manifest.v2.js" },
+     "./cli": "./dist/cli/index.js",
+     "./rest": "./dist/rest/index.js",
+     "./studio": "./dist/studio/index.js",
+     "./core": "./dist/core/index.js",
+     "./utils": "./dist/utils/index.js",
      "./studio/widgets/hello": { "import": "./dist/studio/widgets/hello-widget.js" }
    }
  }
```

**manifest.v2.ts** - Update handler paths:
```diff
  {
    cli: {
      commands: [
        {
-         id: 'hello',
+         id: 'template:hello',
-         handler: './cli/commands/hello/run#runHelloCommand'
+         handler: './cli/commands/run.js#runHelloCommand'
        }
      ]
    },
    setup: {
-     handler: './setup/handler.js#run'
+     handler: './setup-handler.js#run'
    }
  }
```

#### Step 5: Swap Directories

```bash
mv src src-old
mv src-new src
```

#### Step 6: Fix Conflicts

**Duplicate `run` export**:
```typescript
// index.ts
export * from './cli';        // exports run from cli/commands/run.ts
export * from './setup-handler';  // also exports run

// Fix: Use named export for setup
export { run as setupHandler } from './setup-handler';
```

**Add JSX support**:
```diff
  // tsconfig.build.json
  {
    "compilerOptions": {
+     "jsx": "react-jsx"
    }
  }
```

#### Step 7: Verify Build

```bash
pnpm --filter @kb-labs/plugin-template-core type-check
```

---

## Breaking Changes

### For Plugin Template Users

If you forked the old template structure, follow these migration steps:

#### 1. Update Imports

**Before:**
```typescript
import { Greeting } from '@app/domain';
import { createGreetingUseCase } from '@app/application';
import { createConsoleLogger } from '@app/infra';
import { DEFAULT_GREETING_TARGET } from '@app/shared';
```

**After:**
```typescript
import { Greeting } from '../core/greeting.js';
import { createGreetingUseCase } from '../core/create-greeting.js';
import { createConsoleLogger } from '../utils/logger.js';
import { DEFAULT_GREETING_TARGET } from '../utils/constants.js';
```

#### 2. Remove Path Aliases

Delete `paths` from `tsconfig.json`:
```diff
  {
    "compilerOptions": {
-     "paths": {
-       "@app/shared": ["src/shared/index.ts"],
-       "@app/domain": ["src/domain/index.ts"],
-       "@app/application": ["src/application/index.ts"],
-       "@app/infra": ["src/infra/index.ts"]
-     }
    }
  }
```

#### 3. Move Files

Use the file mapping table above to move files to new locations.

#### 4. Update Manifest

Update `manifest.v2.ts` handler paths:
- `./cli/commands/hello/run` → `./cli/commands/run.js`
- `./setup/handler` → `./setup-handler.js`

---

## Future Growth Path

### Scaling the Template

As your plugin grows, you can evolve the structure:

#### Phase 1: Simple (Current)
```
core/
├── greeting.ts
└── create-greeting.ts
```

#### Phase 2: Domain Organization
When `core/` exceeds 10 files:
```
core/
├── greeting/
│   ├── greeting.ts
│   └── create-greeting.ts
├── config/
│   ├── config.ts
│   └── load-config.ts
└── index.ts
```

#### Phase 3: Layered Core
When complexity demands strict boundaries:
```
core/
├── domain/         # Pure entities
│   ├── greeting.ts
│   └── config.ts
├── application/    # Use cases
│   ├── create-greeting.ts
│   └── load-config.ts
└── ports/          # Interface definitions
    └── logger.ts
```

### Adding New Surfaces

#### Workflows

```typescript
// workflows/hello-workflow.ts
import { defineWorkflow } from '@kb-labs/workflow-runtime';
import { createGreetingUseCase } from '../core/create-greeting.js';

export const helloWorkflow = defineWorkflow({
  id: 'template.hello',
  steps: [
    {
      id: 'greet',
      action: 'execute',
      handler: async (ctx) => {
        return createGreetingUseCase({ name: ctx.input.name });
      }
    }
  ]
});
```

#### Jobs

```typescript
// jobs/daily-greeting.ts
import { defineJob } from '@kb-labs/jobs-runtime';
import { createGreetingUseCase } from '../core/create-greeting.js';

export const dailyGreeting = defineJob({
  id: 'template.daily-greeting',
  schedule: '0 9 * * *', // 9 AM daily
  handler: async (ctx) => {
    const greeting = createGreetingUseCase({ name: 'Team' });
    ctx.logger.info(greeting.message);
  }
});
```

### Splitting Core

If `@kb-labs/plugin-template-core` grows too large, split into focused packages:

```
packages/
├── plugin-template-core/      # Main package (keeps everything)
├── plugin-template-engine/    # Extract: core business logic
├── plugin-template-api/       # Extract: REST handlers
└── plugin-template-ui/        # Extract: Studio widgets
```

**When to split:**
- Core exceeds 50 files
- Multiple teams own different surfaces
- Need independent versioning

---

## Summary

### Changes Applied

✅ **Structure**: DDD layers → Functional folders
✅ **Files**: 18 → 20 (+ 2 placeholders)
✅ **Path Aliases**: 8 → 0 (100% reduction)
✅ **Package Name**: `plugin-template-cli` → `plugin-template-core`
✅ **Imports**: `@app/*` → relative paths
✅ **Manifest**: Updated handler paths
✅ **Config**: Removed path aliases, added JSX support
✅ **Exports**: Added functional exports (/cli, /rest, /studio, /core, /utils)

### Impact

- **Simpler**: No DDD concepts, no path aliases
- **Discoverable**: Folder = Surface (cli, rest, studio)
- **Scalable**: Room for workflows, jobs, future surfaces
- **Consistent**: Matches devlink-core, mind-engine patterns

---

**Related Documentation:**
- [ADR-0009: Flatten Plugin Structure](./adr/0009-flatten-plugin-structure.md)
- [Architecture Guide](./architecture.md)
- [Getting Started](./getting-started.md)

**Last Updated:** 2025-11-30
