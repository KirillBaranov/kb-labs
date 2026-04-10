# ADR-0003: Validation Fixtures Strategy

**Date:** 2025-09-20
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, testing]

## Context

The `@kb-labs/devkit` provides shared presets for TypeScript, ESLint, Prettier, Vitest, and Tsup configurations. As the DevKit evolves, we need a reliable way to ensure that changes don't break downstream consumers.

### Problems to Solve

1. **Breaking Changes Detection**: How do we catch breaking changes in DevKit presets before they affect real projects?
2. **Real-world Validation**: How do we test DevKit presets in realistic scenarios beyond unit tests?
3. **Regression Prevention**: How do we prevent regressions when updating dependencies or configuration logic?
4. **Documentation by Example**: How do we provide concrete examples of DevKit usage?

### Previous Approaches

- **Unit tests only**: Limited to testing preset exports, not real-world usage
- **Manual testing**: Time-consuming and error-prone
- **External project testing**: Requires maintaining separate test repositories

## Decision

We will implement a **Validation Fixtures Strategy** using minimal, self-contained consumer projects that demonstrate real-world DevKit usage patterns.

### Core Principles

1. **Minimal but Realistic**: Fixtures should be minimal but represent actual usage patterns
2. **Self-contained**: Each fixture should be a complete, runnable project
3. **Comprehensive Coverage**: Cover all major DevKit presets and common project types
4. **Automated Validation**: Full CI/CD integration with automated checks
5. **Documentation by Example**: Serve as living documentation for DevKit usage

### Fixture Types

We will maintain fixtures for these project archetypes:

#### 1. Library Fixture (`fixtures/lib/`)
- **Purpose**: Simple TypeScript library
- **Presets Used**: `tsconfig/node.json`, `eslint/node`, `vitest/node`, `tsup/node`
- **Validation**: Compilation, linting, testing, bundling, type generation

#### 2. CLI Fixture (`fixtures/cli/`)
- **Purpose**: Command-line application
- **Presets Used**: `tsconfig/cli.json`, `eslint/node`, `vitest/node`, `tsup/node`
- **Validation**: CLI execution, argument parsing, build artifacts
- **Special**: Requires build before testing (CLI must be executable)

#### 3. Web Fixture (`fixtures/web/`)
- **Purpose**: Web application with DOM APIs
- **Presets Used**: `tsconfig/lib.json` (with DOM), `eslint/node`, `vitest/node` (jsdom), `tsup/node`
- **Validation**: DOM manipulation, fetch API, browser-compatible builds

#### 4. Monorepo Fixture (`fixtures/monorepo/`)
- **Purpose**: Multi-package workspace
- **Structure**: `packages/shared` (library) + `packages/app` (consumer)
- **Presets Used**: All presets across different packages
- **Validation**: Inter-package dependencies, workspace builds, shared configurations

### Validation Pipeline

Each fixture runs a comprehensive validation pipeline:

```bash
# Full validation (used in CI)
pnpm fixtures:check

# Individual steps
pnpm fixtures:lint      # ESLint validation
pnpm fixtures:type-check # TypeScript validation  
pnpm fixtures:test      # Test execution
pnpm fixtures:build     # Build validation
```

### Implementation Details

#### Fixture Structure
```
fixtures/
├── lib/           # Simple library
├── cli/           # CLI application  
├── web/           # Web application
├── monorepo/      # Multi-package workspace
└── README.md      # Fixture documentation
```

#### Package.json Integration
Each fixture has its own `package.json` that:
- Extends DevKit presets via imports/extends (no relative paths)
- Includes realistic dependencies for the project type
- Defines standard npm scripts (lint, test, build, etc.)

#### Automation Script
- **`scripts/fixtures.js`**: Centralized fixture management
- **Reduced package.json complexity**: From 32 commands to 8 commands
- **Flexible execution**: Individual fixtures or all fixtures
- **Error handling**: Proper exit codes and error reporting

## Consequences

### Positive

1. **Early Breaking Change Detection**: Catch issues before they reach consumers
2. **Real-world Validation**: Test presets in realistic scenarios
3. **Living Documentation**: Fixtures serve as usage examples
4. **CI/CD Integration**: Automated validation in every PR
5. **Reduced Maintenance**: Centralized fixture management
6. **Developer Confidence**: Safe to make DevKit changes

### Negative

1. **Additional Maintenance**: Need to maintain fixture projects
2. **Build Time**: Additional CI time for fixture validation
3. **Complexity**: More moving parts in the DevKit repository

### Risks

1. **Fixture Drift**: Fixtures may become outdated if not maintained
2. **False Positives**: Fixtures may fail due to external factors
3. **Coverage Gaps**: May not cover all usage patterns

### Mitigation Strategies

1. **Automated Updates**: Scripts to update fixture dependencies
2. **Clear Documentation**: Comprehensive README for each fixture
3. **Regular Review**: Periodic review of fixture relevance
4. **Error Handling**: Robust error reporting and debugging info

## Implementation

### Phase 1: Core Fixtures ✅
- [x] Library fixture with basic validation
- [x] CLI fixture with Commander.js
- [x] Web fixture with DOM APIs
- [x] Monorepo fixture with inter-package dependencies

### Phase 2: Automation ✅
- [x] Centralized fixture management script
- [x] Package.json optimization (32 → 8 commands)
- [x] CI/CD integration with `pnpm fixtures:check`

### Phase 3: Documentation ✅
- [x] Comprehensive README for each fixture
- [x] Scripts documentation
- [x] Main README updates

### Future Considerations

1. **Additional Fixtures**: Vue, React, or other framework-specific fixtures
2. **Performance Testing**: Add performance benchmarks to fixtures
3. **Security Testing**: Add security validation to fixtures
4. **Cross-platform Testing**: Test fixtures on different operating systems

## References

- [ADR 0001: Repository Synchronization via DevKit](./0001-repo-synchronization-via-devkit.md)
- [ADR 0002: ESM-only and NodeNext](./0002-esm-only-and-nodenext.md)
- [DevKit README](../README.md)
- [Scripts Documentation](../scripts/README.md)
