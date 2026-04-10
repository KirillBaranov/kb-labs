# ADR-0009: Flatten Plugin Template Structure to KB Labs Standard

**Date:** 2025-11-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-30
**Tags:** [architecture, refactoring, plugin-template]

## Context

The plugin-template repository initially adopted a Domain-Driven Design (DDD) layered architecture with `domain/`, `application/`, `infrastructure/`, and `shared/` folders. While theoretically sound, this structure introduced several problems:

### Problems with DDD Layers

1. **Navigation Complexity**: For a small template (18 TypeScript files), 4 layers created excessive indirection
2. **Path Alias Pollution**: Required 8 TypeScript path aliases (`@app/domain/*`, `@app/application/*`, etc.) just to avoid deep imports
3. **Inconsistency with KB Labs Ecosystem**: Other KB Labs products (devlink, mind, workflow) use functional organization, not DDD
4. **Onboarding Friction**: New plugin developers had to learn DDD concepts before writing their first plugin
5. **Over-engineering**: Template showcases "hello world" functionality—DDD layers are overkill

### KB Labs Standard Folders

The KB Labs ecosystem requires support for multiple product surfaces:
- **CLI** - Command-line interface commands
- **REST** - REST API handlers
- **Studio** - Studio UI widgets and layouts
- **Workflows** - Custom plugin workflows (future)
- **Jobs** - Cron and background jobs (future)

The previous structure had no clear place for workflows and jobs, requiring additional refactoring as features grow.

### Alternatives Considered

**Alternative 1: Keep DDD, add workflow/jobs folders**
- ❌ Would increase complexity further (6+ top-level folders)
- ❌ Doesn't solve navigation or path alias issues

**Alternative 2: Hybrid DDD + functional**
- ❌ Mixing paradigms creates confusion
- ❌ Inconsistent with ecosystem patterns

**Alternative 3: Flat functional structure (chosen)**
- ✅ Matches devlink-core and other KB Labs products
- ✅ Clear folder-to-surface mapping
- ✅ Room for future growth (workflows, jobs)
- ✅ Zero path aliases needed

## Decision

**Adopt functional folder organization aligned with KB Labs ecosystem standards.**

### New Structure

```
packages/plugin-template-core/
├── cli/              # CLI commands
│   └── commands/
│       ├── run.ts    # Command implementation
│       └── flags.ts  # Flag definitions
├── rest/             # REST API handlers
│   ├── handlers/
│   └── schemas/
├── studio/           # Studio UI widgets
│   └── widgets/
├── core/             # Business logic
│   ├── greeting.ts   # Domain entities
│   └── create-greeting.ts  # Use cases
├── utils/            # Shared utilities
│   ├── logger.ts
│   └── constants.ts
├── workflows/        # Custom workflows (placeholder)
├── jobs/             # Background jobs (placeholder)
├── index.ts          # Main barrel export
├── manifest.v2.ts    # Plugin manifest
└── setup-handler.ts  # Setup operation
```

### Mapping: Old → New

| Old DDD Structure | New Functional Structure |
|-------------------|--------------------------|
| `domain/entities/greeting.ts` | `core/greeting.ts` |
| `application/use-cases/create-greeting.ts` | `core/create-greeting.ts` |
| `infra/adapters/logger.ts` | `utils/logger.ts` |
| `shared/constants.ts` | `utils/constants.ts` |
| `cli/commands/hello/run.ts` | `cli/commands/run.ts` |
| `cli/commands/hello/flags.ts` | `cli/commands/flags.ts` |
| `setup/handler.ts` | `setup-handler.ts` |

### Configuration Changes

**tsconfig.json** - Remove all path aliases:
```diff
- "paths": {
-   "@app/shared": ["src/shared/index.ts"],
-   "@app/domain": ["src/domain/index.ts"],
-   "@app/application": ["src/application/index.ts"],
-   "@app/infra": ["src/infra/index.ts"]
- }
+ // No path aliases needed
```

**package.json** - Add functional exports:
```json
{
  "name": "@kb-labs/plugin-template-core",
  "exports": {
    ".": "./dist/index.js",
    "./cli": "./dist/cli/index.js",
    "./rest": "./dist/rest/index.js",
    "./studio": "./dist/studio/index.js",
    "./core": "./dist/core/index.js",
    "./utils": "./dist/utils/index.js"
  }
}
```

## Consequences

### Positive

1. **Simpler Navigation**: Developers find code faster—`cli/` for CLI, `rest/` for REST
2. **Zero Path Aliases**: No TypeScript configuration needed, just relative imports
3. **Ecosystem Consistency**: Matches devlink-core, mind-engine, workflow-runtime patterns
4. **Clear Growth Path**: Adding workflows/jobs is trivial—just populate the folders
5. **Reduced Cognitive Load**: No need to understand DDD to write a plugin
6. **Smaller Footprint**: 18 files in 7 folders vs 18 files in 4 DDD layers + aliases

### Negative

1. **Loss of DDD Boundaries**: No enforced separation between domain/application/infra
   - **Mitigation**: Small templates don't need strict boundaries; larger plugins can adopt DDD internally within `core/`
2. **Breaking Change for Existing Template Users**: Anyone who forked template must migrate
   - **Mitigation**: Template is new (v0.1.0), minimal adoption; migration guide provided

### Migration Path

**For Plugin Developers:**

If you forked the old template structure:

1. **Move files**:
   ```bash
   mv src/domain/entities/* src/core/
   mv src/application/use-cases/* src/core/
   mv src/infra/adapters/* src/utils/
   mv src/shared/* src/utils/
   ```

2. **Update imports**: Change `@app/*` to relative paths
   ```typescript
   // Before
   import { Greeting } from '@app/domain';
   import { createGreetingUseCase } from '@app/application';

   // After
   import { Greeting } from '../core/greeting.js';
   import { createGreetingUseCase } from '../core/create-greeting.js';
   ```

3. **Remove path aliases** from `tsconfig.json`

4. **Update manifest** paths:
   ```diff
   - handler: './cli/commands/hello/run#runHelloCommand'
   + handler: './cli/commands/run.js#runHelloCommand'
   ```

## Implementation

### Completed Changes (2025-11-30)

- ✅ Created new folder structure with KB Labs standard folders
- ✅ Moved 18 TypeScript files from DDD layers to functional folders
- ✅ Updated all imports (removed `@app/*` aliases, use relative paths)
- ✅ Removed 8 path aliases from tsconfig.json
- ✅ Updated package.json exports (added `/cli`, `/rest`, `/studio`, `/core`, `/utils`)
- ✅ Renamed package: `plugin-template-cli` → `plugin-template-core`
- ✅ Updated manifest.v2.ts with new handler paths
- ✅ Added placeholder folders: `workflows/`, `jobs/`
- ✅ Resolved export conflicts (setup `run` vs cli `run`)

### Stats

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Files** | 18 | 20 | +2 (placeholders) |
| **Folders (top-level)** | 4 DDD layers | 7 functional | +3 |
| **Path Aliases** | 8 | 0 | -8 (100% reduction) |
| **Lines Changed** | - | ~45 imports | Import updates only |

### Future Work

1. **Add lifecycle/ (or hooks/) folder** for plugin lifecycle handlers:
   - `lifecycle/setup.ts` - Plugin installation (currently `setup-handler.ts`)
   - `lifecycle/destroy.ts` - Plugin uninstallation/cleanup
   - `lifecycle/upgrade.ts` - Plugin version upgrades
   - `lifecycle/enable.ts` - Plugin activation
   - `lifecycle/disable.ts` - Plugin deactivation
   - **Decision needed**: `lifecycle/` (explicit) vs `hooks/` (shorter, common term)

2. **Populate workflows/** when custom plugin workflows are needed
3. **Populate jobs/** when cron/background jobs are needed
4. **Update template documentation** (getting-started.md, cli-guide.md, etc.)
5. **Create migration guide** for existing template users

## References

- [KB Labs DevLink Refactoring](../../kb-labs-devlink/docs/refactoring.md) - Similar refactoring applied to devlink-core
- [ADR-0001: Architecture and Repository Layout](./0001-architecture-and-repository-layout.md)
- [ADR-0003: Package and Module Boundaries](./0003-package-and-module-boundaries.md)
- Branch: `refactor/flatten-template-structure`
- Commits:
  - `refactor: flatten plugin-template structure to KB Labs standard`
  - `fix: update manifest paths and resolve export conflicts`

---

**Last Updated:** 2025-11-30
**Next Review:** 2026-01-30 (review after 2 months of usage)
