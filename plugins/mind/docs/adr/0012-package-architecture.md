# ADR-0012: Package Architecture and Separation of Concerns

**Date:** 2025-10-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, process]

## Context

We need to implement KB Labs Mind as a headless context layer for AI-powered development workflows. The system should provide intelligent code indexing, dependency tracking, and context pack generation.

The system must integrate with the existing KB Labs ecosystem while maintaining clean separation of concerns and enabling both programmatic and CLI usage.

## Decision

We will implement KB Labs Mind as a monorepo with 4 core packages, following the established KB Labs ecosystem patterns:

```
packages/
  mind-core/        # Contracts, errors, token math, hashing, POSIX paths
  mind-indexer/     # Delta indexers: API, deps, git diff → .kb/mind/*.json
  mind-pack/        # Pack builder: indexes → MD/JSON context packs
  mind-adapters/    # Git helpers (diff, staged files)
```

CLI commands will be integrated into the existing `kb-labs-cli` repository following the established Command pattern.

## Rationale

### Package Separation Strategy

#### mind-core: Pure Utilities
- **Purpose**: Core types, utilities, and error handling
- **Dependencies**: None (pure package)
- **Exports**: Types, MindError, token estimation, hashing, POSIX paths
- **Reusability**: Can be used by any other package or external consumers

#### mind-indexer: Business Logic
- **Purpose**: Delta indexing for API, dependencies, and git changes
- **Dependencies**: mind-core, mind-adapters
- **Exports**: updateIndexes, initMindStructure
- **Responsibility**: Orchestrates indexing, manages time budgets, handles persistence

#### mind-pack: Context Generation
- **Purpose**: Builds context packs from indexed data
- **Dependencies**: mind-core, mind-indexer
- **Exports**: buildPack
- **Responsibility**: Section generation, budget management, formatting

#### mind-adapters: External Integrations
- **Purpose**: Git system integration
- **Dependencies**: mind-core
- **Exports**: gitDiffSince, listStagedFiles
- **Responsibility**: Safe git operations, structured data parsing

### CLI Integration Pattern

Following the established KB Labs ecosystem pattern:

- **Business Logic**: Lives in dedicated packages (kb-labs-mind)
- **CLI Commands**: Thin wrappers in kb-labs-cli that call package APIs
- **Separation**: Clear boundary between business logic and presentation
- **Reusability**: Packages can be used programmatically beyond CLI

### Benefits

1. **Modularity**: Each package has a single, clear responsibility
2. **Testability**: Packages can be tested in isolation
3. **Reusability**: Packages can be used independently
4. **Maintainability**: Clear boundaries and minimal dependencies
5. **Ecosystem Consistency**: Follows established KB Labs patterns
6. **Upgrade Path**: Easy to swap implementations (e.g., different tokenizers)

## Consequences

### Positive

- **Clean Architecture**: Clear separation of concerns
- **Easy Testing**: Each package can be tested independently
- **Reusability**: Packages can be used in different contexts
- **Maintainability**: Changes are localized to specific packages
- **Ecosystem Integration**: Follows KB Labs conventions
- **Programmatic Usage**: Packages can be used beyond CLI

### Negative

- **Complexity**: More packages to manage
- **Dependency Management**: Need to carefully manage package dependencies
- **API Design**: Requires careful API design between packages
- **CLI Coordination**: CLI integration requires coordination between repositories

### Mitigation Strategies

- **Clear APIs**: Well-defined interfaces between packages
- **Minimal Dependencies**: Each package has minimal, necessary dependencies
- **Comprehensive Testing**: Each package has its own test suite
- **Documentation**: Clear documentation for each package's purpose and API

## Implementation Details

### Package Dependencies

```typescript
// mind-core: No dependencies
// mind-adapters: @kb-labs/mind-core
// mind-indexer: @kb-labs/mind-core, @kb-labs/mind-adapters
// mind-pack: @kb-labs/mind-core, @kb-labs/mind-indexer
```

### CLI Integration

```typescript
// In kb-labs-cli/packages/commands/src/commands/mind/
export const mindInit: Command = {
  name: "init",
  category: "mind",
  describe: "Initialize Mind context layer",
  async run(ctx, argv, flags) {
    await initMindStructure(process.cwd());
    // ...
  }
};
```

### Package Structure

Each package follows the established KB Labs structure:

```
packages/mind-core/
  src/
    types/           # Core type definitions
    error/           # MindError class
    utils/           # Token, hash, path utilities
    defaults.ts      # Default configurations
    index.ts         # Public API exports
  package.json       # Dependencies and scripts
  tsconfig.json      # TypeScript configuration
  vitest.config.ts   # Test configuration
  tsup.config.ts     # Build configuration
```

### API Design Principles

1. **Pure Functions**: No side effects in core utilities
2. **Structured Errors**: Consistent error handling with codes
3. **Pluggable Interfaces**: Easy to swap implementations
4. **Fail-Open**: Errors don't crash the system
5. **Observability**: Comprehensive logging and metrics

## Testing Strategy

### Unit Tests
- Each package has comprehensive unit tests
- Test fail-open behavior
- Test edge cases and error conditions
- Test pluggable interfaces

### Integration Tests
- Test package interactions
- Test CLI command execution
- Test end-to-end workflows

### E2E Tests
- Test complete workflows with fixtures
- Test real-world scenarios
- Test performance characteristics

## Alternatives Considered

### Monolithic Package
- **Pros**: Simpler structure, single dependency
- **Cons**: Harder to test, less reusable, violates single responsibility
- **Decision**: Rejected - too monolithic

### CLI-Only Implementation
- **Pros**: Simpler, no package management
- **Cons**: Not reusable, harder to test, violates separation of concerns
- **Decision**: Rejected - need programmatic usage

### Different Package Boundaries
- **Pros**: Alternative separation strategies
- **Cons**: Less clear responsibilities, harder to reason about
- **Decision**: Rejected - current boundaries are optimal

## References

- [ADR-0009: Fail-Open Philosophy](./0009-fail-open-philosophy.md)
- [ADR-0010: Deterministic Output Strategy](./0010-deterministic-output-strategy.md)
- [ADR-0011: Token Estimation Strategy](./0011-token-estimation-strategy.md)
- [KB Labs Mind MVP Plan](../kb-labs-mind-mvp.plan.md)
- [KB Labs CLI Architecture](https://github.com/kb-labs/kb-labs-cli)
