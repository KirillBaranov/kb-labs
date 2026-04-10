# ADR-0007: Reusable Workflow Strategy for CI Synchronization

**Date:** 2025-09-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

KB Labs maintains multiple repositories (core, cli, shared, products) that require identical CI jobs (lint, type-check, build, test, coverage, release) and service checks (drift-check for DevKit artifacts). Duplicating YAML workflows across repositories leads to drift and manual maintenance overhead.

We need a single source of truth for CI workflows and predictable evolution across all KB Labs projects.

### Problems to Solve

1. **Workflow Drift**: Identical CI logic diverges across repositories over time
2. **Maintenance Overhead**: Changes to CI logic require updates in multiple places
3. **Inconsistent Behavior**: Different repositories may have slightly different CI implementations
4. **Onboarding Complexity**: New repositories need to recreate CI workflows from scratch
5. **Version Management**: No clear strategy for updating CI workflows across repositories

### Current State

- Each repository maintains its own CI workflows
- Manual synchronization of CI changes across repositories
- Inconsistent workflow implementations and configurations
- No systematic approach to CI workflow versioning

## Decision

We will implement a **Reusable Workflow Strategy** that centralizes CI logic in the DevKit and provides thin wrapper workflows for consumer repositories.

### Core Components

#### 1. Centralized Reusable Workflows in DevKit

- **`.github/workflows/ci.yml`** — Complete CI pipeline: validate → build → test → (optional) coverage
- **`.github/workflows/drift-check.yml`** — DevKit synchronization check
- **`.github/workflows/release.yml`** — Automated releases and publishing
- **`.github/workflows/sbom.yml`** — Software Bill of Materials generation

#### 2. Consumer Repository Integration

Consumer repositories use thin wrapper workflows that call DevKit reusable workflows:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  ci:
    uses: kb-labs/devkit/.github/workflows/ci.yml@main
    with:
      node-version: '20'
      run-coverage: true
      enable-drift-check: true
```

#### 3. Workflow Templates

DevKit provides workflow templates in `workflows-templates/` for easy setup:

- **`ci.yml`** — Basic CI workflow template
- **`drift-check.yml`** — DevKit drift check template
- **`release.yml`** — Release workflow template
- **`sbom.yml`** — SBOM generation template

#### 4. Static Asset Synchronization

Use `kb-devkit-sync` to synchronize static assets (agents, `.cursorrules`, VS Code settings, optional workflow templates) while keeping core CI logic in DevKit.

#### 5. Versioning Strategy

- Consumer repositories reference specific DevKit versions: `@v1` (or `@main` during bootstrap)
- DevKit uses semantic versioning for breaking changes
- Clear migration path for workflow updates

#### 6. Security and Performance

- **DevKit Action**: `setup-node-pnpm` uses corepack approach without early cache
- **Minimal Permissions**: Principle of least privilege at job level
- **Secrets Management**: Consumer repositories manage their own secrets

## Rationale

- **Single Source of Truth**: Centralized CI logic eliminates drift and simplifies updates
- **Thin Wrappers**: Consumer repositories have minimal YAML, faster onboarding
- **Reproducibility**: Explicit DevKit version in `uses:` ensures consistent behavior
- **Scalability**: CI improvements benefit all repositories immediately
- **Maintainability**: Changes to CI logic require updates in one place

## Consequences

### Positive

1. **Centralized Updates**: CI changes scale instantly across all repositories
2. **Reduced Maintenance**: Single place to update CI logic
3. **Consistent Behavior**: All repositories follow the same CI patterns
4. **Faster Onboarding**: New repositories get CI with minimal configuration
5. **Unified Caching**: Consistent cache strategies and build order
6. **Quality Assurance**: DevKit fixtures validate CI workflows before release

### Negative

1. **Single Point of Failure**: DevKit CI errors affect all repositories
2. **Versioning Discipline**: Requires careful versioning and release notes
3. **Dependency Management**: Consumer repositories depend on DevKit availability
4. **Learning Curve**: Developers need to understand reusable workflow patterns

### Risks

1. **Breaking Changes**: DevKit workflow changes may break consumer repositories
2. **Version Drift**: Consumer repositories may not update to latest DevKit versions
3. **Performance Impact**: Additional layer of indirection may affect CI performance
4. **Complexity**: More sophisticated workflow management

### Mitigation Strategies

1. **Comprehensive Testing**: DevKit fixtures validate workflows before release
2. **Semantic Versioning**: Clear versioning strategy for breaking changes
3. **Migration Guides**: Detailed documentation for workflow updates
4. **Gradual Rollout**: Incremental adoption of reusable workflows
5. **Monitoring**: Track workflow performance and failure rates

## Operational Notes

### Workflow Execution Order

1. **Validate**: checkout → setup-node/pnpm → install → lint → type-check (optional `|| true`)
2. **Build**: install → build (workspace) → upload build artifacts
3. **Test**: download artifacts → vitest --run
4. **Coverage**: (optional by input) similar to test, but with test:coverage

### Drift Check Implementation

- Separate workflow that runs `kb-devkit-sync --check --json`
- Fails PR if DevKit assets are out of sync
- Can be integrated into main CI or run separately

### Secrets Management

- Consumer repositories store their own secrets
- DevKit workflows do not embed secrets
- Clear documentation for required secrets

### Performance Considerations

- Use `corepack` approach without early cache
- Enable pnpm cache after installation
- Optimize workflow execution order
- Consider workflow concurrency limits

## Implementation

### Phase 1: Core Infrastructure ✅

- [x] Implement reusable workflows in DevKit
- [x] Create workflow templates
- [x] Update `setup-node-pnpm` action
- [x] Add DevKit fixtures for validation

### Phase 2: Consumer Integration

- [ ] Migrate existing repositories to reusable workflows
- [ ] Add drift check workflows
- [ ] Update documentation and examples
- [ ] Create migration guides

### Phase 3: Advanced Features

- [ ] Security/dependency audit workflows
- [ ] Matrix jobs for multiple Node.js versions
- [ ] Artifact caching between jobs
- [ ] Performance monitoring and optimization

## Migration Plan

### For Existing Repositories

1. **Replace Local CI**: Replace complex local CI with DevKit reusable workflows
2. **Add Drift Check**: Include `drift-check.yml` in each repository
3. **Update Documentation**: Document new CI approach and requirements
4. **Version Pinning**: Move from `@main` to `@v1` after stabilization

### For New Repositories

1. **Copy Templates**: Use workflow templates from `workflows-templates/`
2. **Customize Configuration**: Adjust inputs and parameters as needed
3. **Add Drift Check**: Include DevKit synchronization check
4. **Document Dependencies**: Document DevKit version requirements

## Alternatives Considered

### Copy YAML to Each Repository
- **Rejected**: Leads to drift and high maintenance cost
- **Reason**: Violates DRY principle and creates maintenance burden

### Partial Shared CI + Local Logic
- **Rejected**: Blurs responsibility boundaries
- **Reason**: Creates confusion about what's shared vs. local

### External CI Service
- **Rejected**: Adds external dependency and complexity
- **Reason**: GitHub Actions provide sufficient functionality

## Future Work

### Short Term
- [ ] Security/dependency audit as separate reusable workflow
- [ ] Matrix jobs for Node.js 18/20/22 based on flag
- [ ] Artifact caching between jobs for large packages

### Long Term
- [ ] Automated workflow updates across repositories
- [ ] Performance benchmarking and optimization
- [ ] Advanced security scanning integration
- [ ] Cross-platform testing support

## Success Criteria

1. **Zero Drift**: All repositories use identical CI logic
2. **Fast Updates**: CI changes propagate to all repositories within 24 hours
3. **High Reliability**: CI workflows have >99% success rate
4. **Easy Onboarding**: New repositories can set up CI in <10 minutes
5. **Clear Documentation**: Comprehensive guides for all workflow scenarios

## References

- [ADR 0001: Repository Synchronization via DevKit](./0001-repo-synchronization-via-devkit.md)
- [ADR 0005: Build & Types Strategy for KB Labs Monorepos](./0005-build-strategy.md)
- [ADR 0006: Sequential Build & Type Safety in KB Labs Monorepos](./0006-monorepo-build-and-types.md)
- [DevKit README](../README.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
