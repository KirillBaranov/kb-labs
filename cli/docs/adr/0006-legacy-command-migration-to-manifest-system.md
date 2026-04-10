# ADR-0006: Legacy Command Migration to Manifest System

**Date:** 2025-10-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [cli, architecture, migration]

## Context

The KB Labs CLI was initially built with a mixed architecture where some commands were registered directly in the core CLI package (`kb-labs-cli`) while others used a manifest-based plugin system. This created several problems:

- **Inconsistent Architecture** - Some commands (profiles, bundle, init, mind) were hardcoded in CLI core
- **Tight Coupling** - Business logic was mixed with CLI infrastructure
- **Maintenance Burden** - Changes to business commands required CLI package updates
- **Code Duplication** - Similar commands across different packages had different implementations
- **Poor Separation of Concerns** - CLI infrastructure and business logic were intertwined

## Decision

We will migrate all business logic commands from direct registration to a **manifest-based plugin system**, keeping only system commands in the CLI core.

### System Commands (Stay in CLI Core)

These commands are infrastructure-related and belong in the CLI core:

- `hello` - Basic CLI functionality test
- `version` - CLI version information
- `diagnose` - Environment diagnostics
- `plugins list` - Plugin discovery and listing
- `plugins cache clear` - Cache management

### Business Commands (Move to Manifest System)

These commands contain business logic and should be plugin-based:

- `profiles:*` - Profile management (init, resolve, validate)
- `bundle:*` - Bundle operations (print, explain)
- `init:*` - Workspace initialization (workspace, profile, policy, setup)
- `mind:*` - Mind operations (init, update, pack, feed)
- `policy:*` - Policy management (validate, explain)

### Technical Implementation

**CLI Core Changes:**
```typescript
// packages/commands/src/utils/register.ts
export async function registerBuiltinCommands() {
  // Only register system commands
  registry.register(hello);
  registry.register(version);
  registry.register(diagnose);
  registry.register(pluginsList);
  registry.register(pluginsCacheClear);
  
  // Discover and register manifest-based commands
  const discovered = await discoverManifests(process.cwd(), noCache);
  registerManifests(discovered, registry);
}
```

**Manifest-Based Registration:**
```typescript
// In each business package (e.g., @kb-labs/core)
export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: 'profiles:init',
    group: 'profiles',
    describe: 'Initialize or link a profile',
    requires: ['@kb-labs/core-profiles'],
    loader: async () => import('./cli/profiles/init'),
  },
  // ... more commands
];
```

**Package Structure:**
```
kb-labs-core/packages/core/
├── src/
│   ├── cli/
│   │   ├── profiles/     # profiles:* commands
│   │   ├── bundle/      # bundle:* commands  
│   │   ├── init/       # init:* commands
│   │   └── policy/     # policy:* commands
│   └── cli.manifest.ts # Command manifests
└── package.json        # kb.commandsManifest entry
```

## Consequences

### Positive

- **Clean Architecture** - Clear separation between CLI infrastructure and business logic
- **Consistent Pattern** - All business commands follow the same manifest-based pattern
- **Better Maintainability** - Business logic changes don't require CLI package updates
- **Improved Reusability** - Business commands can be reused across different CLI tools
- **Reduced Coupling** - CLI core is no longer tightly coupled to business domains
- **Easier Testing** - Business logic can be tested independently of CLI infrastructure

### Negative

- **Migration Effort** - Significant refactoring required to move commands
- **Discovery Complexity** - Commands are discovered at runtime rather than compile time
- **Dependency Management** - Need to ensure business packages are available
- **Documentation Updates** - All command documentation needs updating

### Risks

- **Runtime Failures** - Commands may fail to load if dependencies are missing
- **Version Mismatches** - Business packages may be incompatible with CLI version
- **Performance Impact** - Runtime discovery adds overhead

### Mitigation

- **Graceful Degradation** - Commands show helpful error messages when dependencies are missing
- **Version Constraints** - Use semantic versioning to ensure compatibility
- **Caching** - Cache discovered manifests to reduce discovery overhead
- **Comprehensive Testing** - Test all command combinations and failure scenarios

## Implementation Details

### Phase 1: CLI Core Cleanup
- Remove legacy command groups from `packages/commands/src/commands/`
- Remove smoke tests for legacy commands
- Update command registration to use manifest system only
- Keep only system commands in CLI core

### Phase 2: Business Package Creation
- Create `@kb-labs/core` package with manifest-based commands
- Implement profiles, bundle, init, policy commands
- Follow `@kb-labs/devlink` pattern for consistency
- Use `@kb-labs/shared-cli-ui` for unified UX

### Phase 3: Testing and Validation
- Ensure all commands work via manifest system
- Verify error handling for missing dependencies
- Test command discovery and registration
- Validate performance impact

## Examples

**Before (Legacy):**
```typescript
// Hardcoded in CLI core
import { profilesGroup } from "../commands/profiles";
registry.registerGroup(profilesGroup);
```

**After (Manifest):**
```typescript
// Discovered from @kb-labs/core package
const manifests = await discoverManifests(process.cwd());
registerManifests(manifests, registry);
```

**Command Implementation:**
```typescript
// @kb-labs/core/src/cli/profiles/init.ts
// (Removed in Profiles v2 — profiles are now configured via kb.config.json and plugin setup handlers)
export const run = undefined;
```

## References

- [ADR-0002: Plugins and Extensibility](./0002-plugins-and-extensibility.md)
- [ADR-0005: Unified CLI Output Formatting](./0005-unified-cli-output-formatting.md)
- [Command Registration Guide](../COMMAND_REGISTRATION.md)
- [CLI Style Guide](../guides/cli-style.md)
