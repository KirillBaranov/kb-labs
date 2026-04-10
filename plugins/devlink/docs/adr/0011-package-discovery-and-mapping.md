# ADR-0011: Package Discovery & Mapping

**Date:** 2025-10-05
**Status:** Proposed
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, architecture]  
**Related:** ADR-0010 Local Linking & Watch Pipeline, ADR-0012 Version & Source Policy, ADR-0013 Safety & Cleanup

## Context

devlink must find local packages, build dependency maps, and understand where to source each package (locally/from npm) without manual markup. The ecosystem includes multiple repositories (core, cli, shared, ...) as well as subpackages (packages/*, apps/*). We need a unified approach for discovery, indexing, and mapping.

## Decision

Introduce a standard for package discovery and mapping:

1. **Roots**: List of root directories (default — current repo; optionally add neighboring kb-labs-* directories)
2. **Globs**: In each root, scan package.json at the root and in all packages/*, apps/*
3. **Index**: Build index { name, version, pathAbs, repo, private, workspace }
4. **Graph**: From each package.json collect dependencies, devDependencies, peerDependencies → multi-layer graph
5. **Source**: Source field determined later by ADR-0012 (local/npm/auto)
6. **State**: Save .kb/devlink/state.json — cache of index and graph (with hash of package.json files)

## Scope

- Auto-discovery of packages and graph building
- Unified data model for subsequent commands (link, watch, status)

## Non-Goals

- Version/source policies (ADR-0012)
- Linking/publishing operations (implements ADR-0010 pipeline)

## Data Model

**State** (file .kb/devlink/state.json):
- `packages[]`: { name, version, pathAbs, repo, private, workspace }
- `deps[]`: { from, to, type: 'prod'|'dev'|'peer' }
- `hashes`: { [pathAbs]: sha1(package.json) }
- `generatedAt`, `devlinkVersion`

**Algorithm** (high level):
- `discoverPackages(roots, globs)` → index
- `buildDependencyGraph(index)` → edges by dependency types
- `persistState(state)` / `loadState()`
- Deduplicate names; if duplicate names found in different locations → warning with priority "closest to current root"

## CLI Implications

- `devlink scan` prints table (pkg → version → path → deps count)
- `--json` outputs state

## Consequences

### Positive

- ✅ Automatic package discovery without manual configuration
- ✅ Unified data model across all devlink operations
- ✅ Efficient caching with incremental updates
- ✅ Clear dependency graph visualization

### Negative

| Risk | Mitigation |
|------|------------|
| Name duplicates | Warn, suggest --prefer <repo>; default to closest root |
| Large repos | Cache + incremental updates by package.json hash |
| Peer deps | Include in graph separately, but don't force link |

## Implementation

### Rollout

1. Implement discover/graph/state
2. Add devlink scan
3. Connect to ADR-0012/0010

### Testing

- Smoke test on several repos
- Fixtures with name collisions
- State.json snapshots

## References

- [ADR-0010: Local Linking & Watch Pipeline](./0010-local-linkind-and-watch-pipelin.md)
- [ADR-0012: Version & Source Policy](./0012-version-and-source-policy.md)
- [ADR-0013: Safety & Cleanup](./0013-safety-and-cleanup.md)
