# ADR-0005: Use DevKit for Shared Tooling

**Date:** 2025-09-15
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

The **kb-labs** ecosystem consists of multiple projects (core, cli, product-template, etc.).  
Each project requires identical tooling configuration: ESLint, Prettier, Vitest, TSConfig, GitHub Actions, etc.

If these configurations are stored separately in each repository:

- Code and rule duplication occurs
- Maintaining consistent style becomes difficult (changes need to be applied manually to all projects)
- Risk of desynchronization increases (e.g., different versions of eslint-config or tsconfig)

## Decision

We are extracting all base configurations and actions into a separate package **@kb-labs/devkit**.  
The project template (`kb-labs-product-template`) includes devkit, with local configs serving only as "thin wrappers" over it.

This approach provides:

- Centralized logic and rules in `kb-labs-devkit`
- Fastest possible new project creation (setup through template and devkit)
- Single-point maintenance for rule/infrastructure changes that apply to all projects

## Consequences

### Positive

- Consistent code style and testing across all repositories
- Minimal boilerplate in new projects
- Simplified maintenance and updates

### Negative

- Dependency on `@kb-labs/devkit` (projects cannot build without it)
- DevKit bugs or errors affect all projects simultaneously
- Requires discipline when updating DevKit versions across all dependent projects

## Alternatives Considered

- **Keep configs within each project** — Rejected due to high maintenance cost
- **Use external shared configs** (e.g., `eslint-config-standard`) without custom devkit — Rejected as more custom rules and integrations (tsup, GitHub Actions) are required
