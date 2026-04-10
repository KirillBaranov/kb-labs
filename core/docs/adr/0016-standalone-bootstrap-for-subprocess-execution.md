# ADR-0016: Standalone Bootstrap for Subprocess Execution

**Date:** 2025-12-17
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-17
**Tags:** [v3-runtime, build, subprocess, production]

## Context

V3 plugin system executes plugins in isolated subprocesses using Node's `fork()` for security and stability. The subprocess entry point (`bootstrap.js`) needs to:

1. **Be accessible** from the production CLI binary (single-file distribution)
2. **Resolve dependencies** without access to parent's `node_modules`
3. **Import types and contracts** needed for plugin execution

### The Problem

When tsup bundles `cli-bin`, it inlines all code into `bin.cjs`. The `bootstrap.js` file needs to be a separate file for `fork()` to work, but when forked as a subprocess, it cannot resolve workspace dependencies like `@kb-labs/plugin-contracts-v3`:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@kb-labs/plugin-contracts-v3'
imported from /path/to/cli-bin/dist/bootstrap.js
```

### Monorepo Challenge

KB Labs uses pnpm workspaces with `workspace:*` protocol. These packages are symlinked, not installed to `node_modules`, making module resolution fragile in forked subprocesses.

### Production Requirement

The CLI will be distributed as a **single binary** to end users. All dependencies must be bundled - no external `node_modules` can be assumed.

## Decision

**Bundle all dependencies into `bootstrap.js` to make it standalone.**

Implementation:

1. **Override tsup externals** in `plugin-runtime-v3/tsup.config.ts`:
   ```typescript
   export default defineConfig({
     ...nodePreset,
     entry: {
       'sandbox/bootstrap': 'src/sandbox/bootstrap.ts',
     },
     // Override nodePreset's /^@kb-labs\// external pattern
     external: [
       /^node:/,  // Keep only Node.js built-ins external
     ],
     noExternal: [
       '@kb-labs/plugin-contracts-v3',  // Explicitly bundle
     ],
   })
   ```

2. **Copy standalone bootstrap** to `cli-bin/dist/` during build:
   ```json
   {
     "scripts": {
       "build": "... && pnpm run copy-bootstrap",
       "copy-bootstrap": "mkdir -p dist && cp ../../../kb-labs-plugin/packages/plugin-runtime-v3/dist/sandbox/bootstrap.js dist/bootstrap.js"
     }
   }
   ```

3. **Multi-location fallback** in `runner.ts` to find bootstrap:
   ```typescript
   const possiblePaths = [
     path.join(currentDir, 'bootstrap.js'),           // Production: cli-bin/dist/
     path.join(currentDir, 'sandbox', 'bootstrap.js'), // Dev: runtime-v3/dist/sandbox/
     path.join(process.cwd(), 'dist', 'bootstrap.js'), // Fallback
   ];
   ```

### Alternatives Considered

**1. Make `plugin-runtime-v3` external** (don't bundle into cli-bin)
- ❌ Rejected: `workspace:*` packages aren't in `node_modules`, `require.resolve()` fails
- ❌ Doesn't work for single-binary production distribution

**2. Pass `NODE_PATH` to subprocess** to resolve workspace packages
- ❌ Rejected: Fragile, environment-dependent
- ❌ Won't work when distributed as single binary

**3. Use `require.resolve()` with package.json exports**
- ❌ Rejected: Still needs package in `node_modules`
- ❌ Added exports but approach abandoned

**4. Bundle dependencies into bootstrap** ✅ **CHOSEN**
- ✅ Self-contained, no external dependencies
- ✅ Works in development (monorepo) and production (single binary)
- ✅ Simple, reliable, no environment assumptions

## Consequences

### Positive

- **Production-ready**: Bootstrap is truly standalone, works as single binary
- **Simple deployment**: No complex module resolution logic needed
- **Development-friendly**: Works in monorepo without changes
- **Reliable**: No dependency on symlinks, NODE_PATH, or workspace structure
- **Small overhead**: ~47KB bundled size (contracts + runtime logic, reduced from 67KB after ADR-0017 simplification)

### Negative

- **Build coupling**: cli-bin build depends on plugin-runtime-v3 being built first
- **Duplication**: Plugin contracts bundled into both cli-bin and bootstrap
- **Manual copy step**: Extra build script to copy bootstrap.js
- **Override nodePreset**: Must override DevKit's default external patterns

### Mitigation

- Document build order in package.json dependencies
- Use `pnpm --filter` to build in correct order
- Consider future: generate bootstrap during cli-bin build (tsup multi-config)

## Implementation

### Files Changed

1. **plugin-runtime-v3/tsup.config.ts**: Override external to bundle contracts
2. **cli-bin/package.json**: Add `copy-bootstrap` script
3. **plugin-runtime-v3/src/sandbox/runner.ts**: Multi-location fallback logic

### Build Process

```bash
# 1. Build plugin-runtime-v3 (generates standalone bootstrap.js)
pnpm --filter @kb-labs/plugin-runtime-v3 run build

# 2. Build cli-bin (copies bootstrap.js to dist/)
pnpm --filter @kb-labs/cli-bin run build
```

### Testing

```bash
# Clear cache
pnpm kb plugins clear-cache

# Test V3 command from root
KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3 --name="V3Test"

# Expected output:
# ✓ [V3] Hello, V3Test!
# [V3] Plugin version: 0.1.0
# [v3-adapter] V3 execution completed with exitCode: 0
```

### Future Improvements

1. **Single tsup config** with multiple entry points (avoid manual copy)
2. **Verify bootstrap is standalone** in CI (check no external imports)
3. **Bundle size monitoring** (ensure bootstrap stays small)
4. **Consider bundling all @kb-labs/* packages** for production binary

## References

- [ADR-0010: Sandbox Execution Model](./0010-sandbox-execution-model.md)
- [ADR-0015: Execution Adapters](./0015-execution-adapters.md)
- User requirement: "это будет потом все упаковываться в один бинарник и поставляться клиентам"

---

**Last Updated:** 2025-12-17
**Next Review:** When implementing production binary packaging
