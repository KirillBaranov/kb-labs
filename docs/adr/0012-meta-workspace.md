# ADR-0012: PNPM Meta-Workspace Setup

**Date:** 2025-10-04  
**Status:** Accepted  
**Deciders:** KB Labs Team  

## Context

The KB Labs ecosystem consists of multiple repositories:
- **kb-labs-core** (core packages: config, sys, profiles, …)
- **kb-labs-cli** (CLI entrypoint)
- **kb-labs-ai-review** (AI Review product)
- **kb-labs-profile-schemas** (schemas & presets)
- **kb-labs-shared** (shared utilities)
- **kb-labs-devkit** (developer toolkit)
- **kb-labs-product-template** (starter template)

Previously, these packages were linked via GitHub URLs or yalc, which led to several issues:
- Manual updates between repositories
- Duplicated package installations
- Dependency drift across repositories
- Complex local development workflow

A meta-workspace with PNPM was introduced to unify local development and resolve these issues.

## Decision

We establish a PNPM meta-workspace to manage the entire KB Labs ecosystem:

### 1. Meta-Workspace Configuration
Created meta-workspace in root folder `kb-labs/` with `pnpm-workspace.yaml`:

```yaml
packages:
  - "kb-labs-*"
  - "kb-labs-*/packages/*"
  - "kb-labs-*/apps/*"
  - "!**/package-name"   # exclude template placeholders
```

### 2. Package Renaming
Resolved naming conflicts by renaming packages:
- `@kb-labs/root` → `@kb-labs/workspace-root`
- Internal CLI `@kb-labs/cli` → `@kb-labs/cli-bin`

### 3. Dependency Management
- Removed cyclic dependency in kb-labs-ai-review (`@kb-labs/ai-review-provider-types` self-reference)
- All cross-repo dependencies now use `workspace:*` instead of GitHub URLs
- Unified dependency resolution across all repositories

### 4. Validation
- `pnpm -w install` completes without errors
- `pnpm list --depth=0` shows correct resolution
- 72 internal links working correctly

## Rationale

- **Unified Development**: Single workspace for all KB Labs repositories
- **Dependency Consistency**: Eliminates version drift and manual updates
- **Developer Experience**: Simplified local development workflow
- **Build Efficiency**: Shared dependencies reduce installation time
- **Maintenance**: Easier to manage cross-repository dependencies

## Consequences

**Positive:**
- Unified dependency graph across all repositories
- Local development speedup (single install for all projects)
- Consistent versions and no dependency drift
- Simplified developer onboarding
- Better tooling integration (IDEs, linters, etc.)

**Negative:**
- Requires build (`pnpm -r run build`) before usage if package exposes dist/
- Developers must be aware of renamed packages (cli-bin, workspace-root)
- Initial setup complexity for new contributors
- Larger workspace size

## Implementation

### Workspace Commands
- `pnpm -w install` - Install all dependencies across workspace
- `pnpm -r run build` - Build all packages in workspace
- `pnpm -r run test` - Run tests across all packages
- `pnpm -r run lint` - Lint all packages in workspace

### Package Structure
- All `kb-labs-*` repositories are included in workspace
- Package patterns support nested packages and apps
- Template placeholders are excluded from workspace

## Alternatives Considered

- **GitHub URLs** — rejected (manual updates, version drift)
- **Yalc linking** — rejected (complex workflow, duplication)
- **Separate repositories** — rejected (dependency management issues)
- **Lerna** — rejected (PNPM provides better performance)

## Follow-ups

- Document workspace commands in README
- Create workspace-specific CI/CD pipelines
- Add workspace validation scripts
- Update developer onboarding documentation
- Monitor workspace performance and optimization opportunities

---

*Last updated: October 04, 2025*  
*Next review: December 22, 2025*