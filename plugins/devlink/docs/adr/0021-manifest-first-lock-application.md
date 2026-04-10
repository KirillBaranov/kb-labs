# ADR-0021: Manifest-First Lock Application

**Date:** 2025-10-17
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]  
**Related:** ADR-0014 (Preflight Checks), ADR-0012 (Version & Source Policy)

## Context

The original `applyLockFile` implementation in DevLink used a "pnpm-first" approach where the core layer directly executed `pnpm add` commands to apply locked versions. This approach had several critical issues:

- **Workspace conflicts**: `pnpm add` commands in monorepos often failed with `ERR_PNPM_ADDING_TO_ROOT` errors
- **Inconsistent behavior**: Different pnpm versions and workspace configurations led to unpredictable results
- **Poor separation of concerns**: Core business logic was tightly coupled with package manager specifics
- **Limited control**: No fine-grained control over which files were modified or how
- **CI/CD issues**: Package manager operations in CI environments were unreliable
- **Debugging complexity**: Hard to understand what changes were actually made

The core layer should focus on business logic (reading lock files, updating manifests) while delegating package manager operations to the CLI layer.

## Decision

Implement a **Manifest-First** approach for lock file application that separates concerns between core business logic and package manager operations:

### 1. Core Layer Responsibilities (`api/apply-lock.ts`)

- **Read lock file**: Parse `.kb/devlink/lock.json` and extract package versions
- **Discover manifests**: Find all `package.json` files in workspace (root + packages/* + apps/*)
- **Update manifests**: Modify dependency versions in `package.json` files according to lock
- **Track changes**: Return detailed information about what was modified
- **Create backups**: Automatically backup files before modification
- **Preflight integration**: Respect preflight checks and cancellation

### 2. CLI Layer Responsibilities

- **Execute core logic**: Call `applyLockFile()` API
- **Package manager operations**: Run `pnpm install` if `needsInstall: true`
- **User experience**: Handle progress indicators, error messages, and confirmations
- **Environment handling**: Manage different package manager configurations

### 3. New API Contract

```typescript
interface ApplyLockFileResult {
  ok: boolean;
  executed: Array<{
    manifest: string; // relative path to package.json
    changes: Array<{ 
      name: string; 
      from: string; 
      to: string; 
      section: "dependencies"|"devDependencies" 
    }>;
  }>;
  needsInstall: boolean; // hint for CLI layer
  preflight: { cancelled: boolean; warnings: string[] };
  diagnostics: string[];
  warnings?: string[];
}
```

### 4. Implementation Details

- **Manifest discovery**: Use existing `walkPatterns()` to find package.json files
- **Version comparison**: Only update versions that differ from lock file
- **Atomic writes**: Use `fs.writeFile()` with proper JSON formatting
- **Backup integration**: Leverage existing backup system before modifications
- **Dry run support**: Show changes without writing to disk

## Consequences

### Positive

- ✅ **Eliminates pnpm workspace errors**: No more `ERR_PNPM_ADDING_TO_ROOT` or similar issues
- ✅ **Predictable behavior**: Core logic is independent of package manager quirks
- ✅ **Better debugging**: Clear visibility into what files were modified and how
- ✅ **Improved CI/CD reliability**: No package manager operations in core layer
- ✅ **Flexible CLI integration**: CLI can choose when and how to run package manager
- ✅ **Consistent with existing patterns**: Follows same backup/preflight patterns as other operations
- ✅ **Better error handling**: Granular error reporting per manifest file
- ✅ **Performance**: Faster execution without package manager overhead in core

### Negative

- ⚠️ **Two-phase operation**: CLI must handle both manifest updates and package manager execution
- ⚠️ **Potential inconsistency**: If CLI fails to run package manager, manifests and node_modules may be out of sync
- ⚠️ **Additional complexity**: CLI layer needs to understand `needsInstall` hint

### Alternatives Considered

1. **Keep pnpm-first approach**: Rejected due to workspace conflicts and reliability issues
2. **Hybrid approach**: Core handles some packages, CLI handles others - rejected as too complex
3. **Package manager abstraction**: Create abstraction layer for different package managers - rejected as over-engineering for current needs

## Implementation

### Core Changes

- **Modified**: `packages/core/src/api/apply-lock.ts` - Complete rewrite to Manifest-First approach
- **Added**: `collectManifestPaths()` - Discovers all package.json files in workspace
- **Added**: `processManifest()` - Updates individual manifest files according to lock
- **Updated**: Result interface to include detailed change tracking and `needsInstall` hint

### CLI Integration Required

- **New**: CLI layer must call `applyLockFile()` and check `needsInstall` flag
- **New**: If `needsInstall: true`, CLI should run `pnpm install` after manifest updates
- **New**: CLI should handle progress indication for both phases
- **New**: CLI should provide clear error messages if package manager fails

### Backward Compatibility

- **API contract**: New result format is not backward compatible
- **Behavior**: Core behavior changes from pnpm operations to manifest updates
- **CLI impact**: Existing CLI implementations will need updates

## Testing

- **Unit tests**: Core logic tested with mock file system operations
- **Integration tests**: End-to-end testing with real lock files and manifests
- **Dry run validation**: Verify changes are shown correctly without disk writes
- **Backup verification**: Ensure backups are created before modifications

## Future Considerations

- **Package manager support**: Could be extended to support npm, yarn, or other package managers
- **Selective updates**: Could add options to update only specific packages or sections
- **Validation**: Could add validation to ensure updated versions are valid
- **Rollback**: Could integrate with existing rollback system for failed operations

## References

- [Implementation PR](https://github.com/kirill-baranov/kb-labs-devlink/pull/xxx)
- [Related ADR-0014: Preflight Checks and Backup System](./0014-preflight-checks-and-backup-system.md)
- [Related ADR-0012: Version & Source Policy](./0012-version-and-source-policy.md)
