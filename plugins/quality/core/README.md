# @kb-labs/quality-core

Core business logic for KB Labs Quality Plugin. This package contains all the analysis and computation logic for monorepo quality analysis, separated from CLI and REST handlers.

## Architecture

This package follows the **commit-plugin** pattern where business logic is extracted into a separate `core` package:

```
quality-core/        # Business logic (this package)
quality-cli/         # CLI commands + REST handlers
quality-contracts/   # Shared types and schemas
```

## Modules

### `stats` - Monorepo Statistics
- `calculateStats(rootDir: string): Promise<StatsResult>`
- Package counting, LOC analysis, size calculation

### `health` - Health Scoring
- `calculateHealth(rootDir: string): Promise<HealthResult>`
- Dependency health, structure validation, grade A-F

### `dependencies` - Dependency Analysis
- `analyzeDependencies(rootDir: string): Promise<DependencyAnalysis>`
- Find duplicates, unused, missing workspace dependencies

### `build-order` - Topological Sort
- `calculateBuildOrder(rootDir: string): Promise<BuildOrderResult>`
- Topological sort with parallel build layers
- Circular dependency detection

### `graph` - Dependency Graph
- `buildDependencyGraph(rootDir: string): DependencyGraph`
- Tree view, reverse dependencies, impact analysis

## Usage

```typescript
import { calculateStats } from '@kb-labs/quality-core/stats';
import { calculateHealth } from '@kb-labs/quality-core/health';
import { analyzeDependencies } from '@kb-labs/quality-core/dependencies';

// In CLI command
const stats = await calculateStats(ctx.cwd);
ctx.ui.success('Stats calculated', { data: stats });

// In REST handler
const health = await calculateHealth(ctx.cwd);
return { score: health.score, grade: health.grade };
```

## Why Separate Core?

- **Reusability**: CLI, REST handlers, and Studio all use same logic
- **Testability**: Easy to unit test without CLI/REST overhead
- **Maintainability**: Business logic changes don't affect handlers
- **Type Safety**: Single source of truth for calculations

## License

MIT
