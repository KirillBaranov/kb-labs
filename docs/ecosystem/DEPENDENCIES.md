# KB Labs Ecosystem Dependencies

> **Dependency graph and relationships between KB Labs products**  
> **Last Updated:** 2025-01-28

## Dependency Overview

This document maps dependencies between products in the KB Labs ecosystem. Understanding these relationships is crucial for understanding the architecture and making informed changes.

## Core Platform Dependencies

### Foundation Layer (No Dependencies)

| Product | Dependencies | Notes |
|---------|--------------|-------|
| [@kb-labs/core](../products/core.md) | None | Foundation of ecosystem |
| [@kb-labs/shared](../products/shared.md) | None | Pure utilities, no side effects |
| [@kb-labs/devkit](../products/devkit.md) | None | Tooling package |
| [@kb-labs/profile-schemas](../products/profile-schemas.md) | None | Schema definitions |

### Core Platform Internal Dependencies

```
@kb-labs/cli
  └─ depends on: @kb-labs/core
```

## Product Dependencies

### AI Products

```
@kb-labs/ai-review
  └─ depends on: @kb-labs/core, @kb-labs/shared

@kb-labs/analytics
  └─ depends on: @kb-labs/core, @kb-labs/shared

@kb-labs/mind
  └─ depends on: @kb-labs/core, @kb-labs/shared
```

### Tools & Infrastructure

```
@kb-labs/audit
  └─ depends on: @kb-labs/core, @kb-labs/shared, @kb-labs/devlink, @kb-labs/mind

@kb-labs/rest-api
  └─ depends on: @kb-labs/cli, @kb-labs/audit, @kb-labs/release-manager, @kb-labs/devlink, @kb-labs/mind, @kb-labs/analytics

@kb-labs/studio
  └─ depends on: @kb-labs/ui, @kb-labs/rest-api

@kb-labs/ui
  └─ depends on: None (foundation UI library)

@kb-labs/devlink
  └─ depends on: @kb-labs/core, @kb-labs/shared

@kb-labs/release-manager
  └─ depends on: @kb-labs/core, @kb-labs/shared, @kb-labs/audit, @kb-labs/devlink, @kb-labs/mind

@kb-labs/tox
  └─ depends on: None (standalone format library)
```

### Templates

```
@kb-labs/product-template
  └─ depends on: @kb-labs/devkit, @kb-labs/core, @kb-labs/shared
```

## Dependency Layers

### Layer 1: Foundation (No Dependencies)
- @kb-labs/core
- @kb-labs/shared
- @kb-labs/devkit
- @kb-labs/profile-schemas
- @kb-labs/ui
- @kb-labs/tox

### Layer 2: Core Platform
- @kb-labs/cli → @kb-labs/core

### Layer 3: AI Products & Tools
- @kb-labs/ai-review → @kb-labs/core, @kb-labs/shared
- @kb-labs/analytics → @kb-labs/core, @kb-labs/shared
- @kb-labs/mind → @kb-labs/core, @kb-labs/shared
- @kb-labs/devlink → @kb-labs/core, @kb-labs/shared

### Layer 4: Infrastructure
- @kb-labs/audit → @kb-labs/core, @kb-labs/shared, @kb-labs/devlink, @kb-labs/mind
- @kb-labs/release-manager → @kb-labs/core, @kb-labs/shared, @kb-labs/audit, @kb-labs/devlink, @kb-labs/mind

### Layer 5: Applications
- @kb-labs/rest-api → @kb-labs/cli, @kb-labs/audit, @kb-labs/release-manager, @kb-labs/devlink, @kb-labs/mind, @kb-labs/analytics
- @kb-labs/studio → @kb-labs/ui, @kb-labs/rest-api

## Import Boundaries

### Allowed
- Products → Shared → Core (downward dependencies)
- Tools can depend on AI Products if needed
- Applications can depend on any layer

### Forbidden
- Reverse dependencies (core → shared, shared → products)
- Circular dependencies
- Cross-product dependencies without shared layer

**Enforced via:** ESLint rules (no-restricted-imports)

**Related:** [ADR-0005: Layering & Stability Policy](../adr/0005-layering-stability-policy.md)

## Version Pinning

### Core Platform
- **@kb-labs/core:** Slow-moving, maximum stability
- **@kb-labs/shared:** More frequent minors, `@stable` APIs remain intact
- **@kb-labs/devkit:** Tooling updates independently

### Products
- **AI Products:** Fast-moving, pinned against major versions of core and shared
- **Tools:** Similar to AI Products

**Related:** [ADR-0005: Layering & Stability Policy](../adr/0005-layering-stability-policy.md)

## Dependency Management

### DevKit Sync
All projects use `@kb-labs/devkit` for shared tooling configurations:
- TypeScript configs
- ESLint configurations
- Prettier settings
- Vitest configs
- GitHub Actions workflows

**Related:** `@kb-labs/devkit`

### Meta-Workspace
PNPM meta-workspace enables cross-repository dependency management while maintaining separate repositories.

**Related:** [ADR-0012: PNPM Meta-Workspace Setup](../adr/0012-meta-workspace.md)

## Breaking Changes

### Major Versions
Breaking changes only in major releases. All breaking changes require:
1. ADR documenting the change
2. Migration guide (if applicable)
3. Deprecation notices in previous versions

### Minor Versions
Minor releases cannot break `@stable` APIs. New features and non-breaking changes only.

### Deprecations
Deprecated APIs must:
1. Use `@deprecated` marker
2. Remain supported for at least 2 minor releases
3. Provide migration path

**Related:** [ADR-0004: Versioning and Release Policy](../adr/0004-versioning-and-release-policy.md)

---

*For detailed product information, see [Products Overview](../products/README.md).*


