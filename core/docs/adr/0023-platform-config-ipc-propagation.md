# ADR-0023: Platform Config Propagation to Sandbox Workers via IPC

**Status:** Accepted
**Date:** 2025-12-06
**Author:** KB Labs Team
**Context:** KB Labs Sandbox Worker Isolation, Platform Adapter Availability
**Tags:** `platform`, `ipc`, `sandbox`, `workers`, `serialization`, `adapters`

## Context and Problem Statement

Plugin handlers execute in isolated sandbox worker processes for security. However, platform adapters (storage, LLM, embeddings, cache, etc.) were only initialized in the main CLI process, leaving workers with NoOp fallbacks. This caused features like Mind RAG query history to use in-memory storage instead of persistent file storage, breaking cross-invocation learning.

**Specific problem:**
- MindEngine in worker process: `platform.storage = undefined`
- Main CLI process: `platform.storage = FilesystemAdapter` (from kb.config.json)
- Result: Query history lost on each command invocation

**Root cause:** Platform instances contain functions/methods that cannot be serialized through IPC (Inter-Process Communication).

## Decision Drivers

- **Feature parity**: Workers must have same platform capabilities as main process
- **Security**: Maintain sandbox isolation, don't bypass permissions system
- **Serialization**: Only plain JSON data can cross IPC boundary
- **Clean architecture**: No workarounds, no global state pollution
- **Backward compatibility**: Existing adapters should work without changes

## Considered Options

### Option 1: Serialize Platform Instances ❌

**Approach:** Try to serialize platform adapter instances and send through IPC.

**Pros:**
- Direct approach, minimal code changes
- Workers get exact same instances

**Cons:**
- **Impossible**: Functions/methods cannot be serialized to JSON
- Closures, prototypes, `this` binding all break
- Would require custom serialization protocol (extremely complex)
- Security risk: serializing code across process boundaries

### Option 2: Global Shared State via SharedArrayBuffer ❌

**Approach:** Use SharedArrayBuffer to share platform adapters between processes.

**Pros:**
- Zero serialization overhead
- True shared state

**Cons:**
- **Security violation**: Breaks sandbox isolation completely
- Workers could access main process memory
- Not compatible with execa subprocess model
- Requires SharedArrayBuffer (not available in all environments)
- Extremely complex memory management

### Option 3: Reinitialize Adapters in Worker from Environment ❌

**Approach:** Workers read `process.env` to discover adapter packages and initialize platform independently.

**Pros:**
- No IPC data transfer needed
- Workers fully autonomous

**Cons:**
- **Fragile**: Requires environment variables for all adapter configs
- Complex serialization of adapterOptions to env vars
- Violates separation of concerns (config shouldn't be in env)
- Different initialization path than main process (maintenance burden)

### Option 4: Pass PlatformConfig via IPC, Initialize in Worker ✅ **CHOSEN**

**Approach:** Serialize PlatformConfig (plain JSON) through IPC, workers call `initPlatform(config)` locally.

**Pros:**
- **Clean separation**: Config (data) vs instances (code)
- **Security preserved**: Workers use same safe initialization as main process
- **DRY principle**: Single `initPlatform()` implementation shared by main + workers
- **Serialization safe**: PlatformConfig is plain JSON (strings, numbers, objects)
- **Explicit flow**: Clear data propagation through ExecutionContext
- **Graceful fallback**: Workers can fall back to NoOp if initialization fails

**Cons:**
- Requires adding `platformConfig` field to ExecutionContext (minor schema change)
- Workers must import `@kb-labs/core-runtime` (dependency addition)
- Slight initialization overhead in worker (acceptable ~10-50ms one-time cost)

## Decision

**We chose Option 4: Pass PlatformConfig via IPC, Initialize in Worker**

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Main CLI Process                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  bootstrap.ts                                                    │
│  ├─ platformConfig = initializePlatform(cwd)                    │
│  │  └─ Loads kb.config.json                                     │
│  │     Resolves adapter packages                                │
│  │     Returns PlatformConfig { adapters, adapterOptions }      │
│  │                                                               │
│  └─ globalThis.__KB_PLATFORM_CONFIG__ = platformConfig          │
│                                                                  │
│  CLI Handler (adapters/cli/handler.ts)                          │
│  └─ execCtx.platformConfig = globalThis.__KB_PLATFORM_CONFIG__  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (SerializableContext)
                              │ platformConfig: {
                              │   adapters: { storage: "@kb-labs/adapters-fs", ... },
                              │   adapterOptions: { ... }
                              │ }
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Sandbox Worker Process                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  context-recreator.ts                                            │
│  └─ if (serializedCtx.platformConfig) {                         │
│       const { initPlatform } = await import('@kb-labs/core-...) │
│       await initPlatform(platformConfig, cwd)                    │
│     }                                                            │
│                                                                  │
│  MindEngine (mind-engine/src/index.ts)                          │
│  └─ import { platform } from '@kb-labs/core-runtime'            │
│     const resolved = rawOptions.platform ?? platform            │
│     // ✅ platform.storage available!                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation Details

#### 1. ExecutionContext Schema Extension

**Files:** `core-sandbox/src/types/index.ts`, `plugin-runtime/src/types.ts`

```typescript
export interface ExecutionContext {
  // ... existing fields

  /** Platform configuration for worker initialization */
  platformConfig?: any; // PlatformConfig from @kb-labs/core-runtime
                        // Using 'any' to avoid circular dependency
}
```

**Rationale:** Using `any` instead of importing `PlatformConfig` type avoids circular dependency between `core-sandbox` and `core-runtime`.

#### 2. IPC Serialization

**File:** `core-sandbox/src/runner/ipc-serializer.ts`

```typescript
interface SerializableContext {
  // ... existing fields
  platformConfig?: any; // PlatformConfig
}

function serializeContext(ctx: ExecutionContext): SerializableContext {
  // ... existing serialization

  // Include platform config if available (for worker initialization)
  if (ctx.platformConfig) {
    serializable.platformConfig = ctx.platformConfig;
  }

  return serializable;
}
```

**Security note:** PlatformConfig contains only:
- Adapter package names (strings): `"@kb-labs/adapters-fs"`
- Config options (plain objects): `{ url: "http://localhost:6333" }`
- No functions, no closures, no code → safe to serialize

#### 3. Platform Initialization Return Value

**File:** `cli-bin/src/runtime/platform-init.ts`

```typescript
// Before: export async function initializePlatform(cwd: string): Promise<void>
// After:
export async function initializePlatform(cwd: string): Promise<PlatformConfig> {
  const configPath = path.join(cwd, '.kb', 'kb.config.json');
  const config = await loadConfig(configPath);
  const platformConfig = config.platform ?? { adapters: {} };

  await initPlatform(platformConfig, cwd);

  return platformConfig; // ← Return for propagation to workers
}
```

#### 4. Global Storage in Bootstrap

**File:** `cli-bin/src/runtime/bootstrap.ts`

```typescript
const platformConfig = await initializePlatform(cwd);

// Store globally so CLI adapter can access it
(globalThis as any).__KB_PLATFORM_CONFIG__ = platformConfig;
```

**Rationale:** Uses `globalThis` instead of `global` to avoid TDZ (Temporal Dead Zone) errors in ESM.

#### 5. CLI Handler Propagation

**File:** `adapters/cli/src/handler.ts`

```typescript
const execCtx: ExecutionContext = {
  // ... existing fields
};

// Add platformConfig from global (set by CLI bootstrap)
if ((globalThis as any).__KB_PLATFORM_CONFIG__) {
  execCtx.platformConfig = (globalThis as any).__KB_PLATFORM_CONFIG__;
}
```

#### 6. Worker Initialization

**File:** `core-sandbox/src/runner/context/context-recreator.ts`

```typescript
// Initialize platform in worker if config provided
if (serializedCtx.platformConfig) {
  try {
    // Dynamic import to avoid circular dependencies
    const { initPlatform } = await import('@kb-labs/core-runtime');

    const cwd = serializedCtx.workdir || serializedCtx.pluginRoot || process.cwd();
    await initPlatform(serializedCtx.platformConfig, cwd);

    if (debugMode) {
      sandboxOutput.debug('Platform initialized in worker', {
        adapters: Object.keys(serializedCtx.platformConfig.adapters ?? {}),
      });
    }
  } catch (error) {
    sandboxOutput.warn('Failed to initialize platform in worker, using NoOp adapters', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Fallback to NoOp adapters
    try {
      const { initPlatform } = await import('@kb-labs/core-runtime');
      await initPlatform({ adapters: {} });
    } catch {
      // Ignore fallback errors - platform will use NoOp by default
    }
  }
}
```

**Dependency addition:** `core-sandbox/package.json` now includes:
```json
{
  "dependencies": {
    "@kb-labs/core-runtime": "workspace:*"
  }
}
```

#### 7. MindEngine Global Platform Fallback

**File:** `mind-engine/src/index.ts`

```typescript
import { platform as globalPlatform } from '@kb-labs/core-runtime';

// In constructor:
const platform = rawOptions.platform ?? globalPlatform;
```

**Dependency addition:** `mind-engine/package.json` now includes:
```json
{
  "dependencies": {
    "@kb-labs/core-runtime": "workspace:*"
  }
}
```

**Rationale:** MindEngine can receive platform explicitly through options OR use the global singleton initialized by worker's `initPlatform()`.

## Consequences

### Positive

✅ **Workers have full platform capabilities**
- Mind RAG query history persists to `.kb/mind/learning/history/` files
- LLM, embeddings, cache, storage all available in sandbox workers
- No feature degradation between main process and workers

✅ **Security preserved**
- Sandbox isolation unchanged (separate subprocess via execa)
- Permissions system still enforced (adapters work through runtime API)
- Resource quotas still apply (adapters respect tenant limits)
- Config file protected by FS permissions (plugins can't write `.kb/kb.config.json`)

✅ **Clean architecture**
- Single source of truth: `initPlatform(config)` used by both main + workers
- DRY principle: No duplicate initialization logic
- Explicit data flow: platformConfig through ExecutionContext → IPC → worker
- No global state pollution (only bootstrap sets `globalThis.__KB_PLATFORM_CONFIG__`)

✅ **Maintainability**
- New adapters automatically work in workers (no special handling needed)
- Clear separation: config (data) vs instances (code)
- Easy to debug: platformConfig visible in ExecutionContext

✅ **Performance**
- One-time initialization cost in worker (~10-50ms)
- No ongoing IPC overhead (config sent once per execution)
- Adapters perform same as in main process

### Negative

⚠️ **Schema change**
- ExecutionContext extended with `platformConfig` field
- Requires rebuilding core-sandbox, plugin-runtime, CLI

⚠️ **Dependency additions**
- `core-sandbox` now depends on `core-runtime` (was independent)
- `mind-engine` now depends on `core-runtime` (was independent)
- Acceptable: These are workspace dependencies (no external packages)

⚠️ **Worker initialization overhead**
- Workers call `initPlatform()` on startup (~10-50ms)
- Acceptable: One-time cost, happens in parallel with handler loading
- Future optimization: Could cache initialized platform per worker pool

### Neutral

🔄 **Backward compatibility**
- Existing code continues to work (platformConfig is optional)
- Workers without platformConfig fall back to NoOp adapters (existing behavior)
- No breaking changes for plugins

## Security Analysis

### What We Pass Through IPC

```json
{
  "adapters": {
    "storage": "@kb-labs/adapters-fs",
    "llm": "@kb-labs/adapters-openai"
  },
  "adapterOptions": {
    "vectorStore": { "url": "http://localhost:6333" }
  }
}
```

**Data types:**
- Adapter names: Strings (package names)
- Config options: Plain objects (URLs, paths, numbers)
- **NO functions, NO closures, NO code**

### Attack Surface Analysis

**Scenario 1: Config Tampering**
- Attacker modifies `.kb/kb.config.json` to inject malicious adapter
- **Mitigation:** Already protected by FS permissions
  - Plugins CANNOT write to `.kb/kb.config.json` (deny rules)
  - If attacker has write access to `.kb/`, system already compromised

**Scenario 2: Adapter Package Injection**
- Config specifies `"storage": "malicious-package"`
- **Mitigation:**
  - Worker uses Node's standard module resolution (same as main process)
  - Malicious packages must be in `node_modules/` (requires npm install)
  - If attacker can install packages, system already compromised
  - Optional: Add whitelist validation for `@kb-labs/*` packages only

**Scenario 3: Secrets in Config**
- API keys accidentally stored in `adapterOptions`
- **Mitigation:**
  - Adapters MUST read secrets from `process.env`, NOT from config
  - Example: `process.env.OPENAI_API_KEY`, not `config.apiKey`
  - Documented in adapter guidelines

**Scenario 4: SSRF via adapterOptions**
- Config contains `{ url: "http://attacker.com" }`
- **Mitigation:**
  - Adapters responsible for validating URLs
  - Network permissions still enforced by runtime API
  - Plugins can only access `allowedHosts` from manifest

### What We DON'T Break

✅ **Permissions System**
- Platform adapters work THROUGH runtime API (ctx.runtime.fs, ctx.runtime.fetch)
- Runtime API enforces manifest permissions
- Workers cannot bypass permissions by using platform directly

✅ **Resource Limits**
- Tenant quotas apply to platform adapters
- Storage bytes, LLM tokens, API requests all counted
- Platform respects ResourceManager limits

✅ **Sandbox Isolation**
- Workers still in separate subprocess (execa)
- No shared memory, no cross-process access
- Can be killed on timeout, memory exceeded, etc.

## Alternatives Considered (Summary)

| Option | Approach | Verdict |
|--------|----------|---------|
| Serialize instances | Send platform adapters through IPC | ❌ Impossible (functions not serializable) |
| SharedArrayBuffer | Share memory between processes | ❌ Breaks sandbox isolation |
| Env vars | Workers read from process.env | ❌ Fragile, complex, different init path |
| **Pass config** | Send PlatformConfig, init in worker | ✅ **CHOSEN** - Clean, safe, maintainable |

## Implementation Checklist

- [x] Add `platformConfig` to ExecutionContext (core-sandbox, plugin-runtime)
- [x] Serialize platformConfig in IPC (ipc-serializer.ts)
- [x] Return PlatformConfig from initializePlatform (platform-init.ts)
- [x] Store in globalThis (bootstrap.ts)
- [x] Read from globalThis in CLI handler (handler.ts)
- [x] Initialize platform in worker (context-recreator.ts)
- [x] Add core-runtime dependency to core-sandbox
- [x] Add core-runtime dependency to mind-engine
- [x] Use global platform in MindEngine
- [x] Remove temporary DEBUG logs
- [x] Test: Verify history files created in `.kb/mind/learning/history/`
- [x] Test: Verify platform.storage available in worker
- [x] Document security considerations

## Related Work

- **ADR-0037:** State Broker for Persistent Cache (similar daemon pattern)
- **ADR-0022:** Platform Core Adapter Architecture (defines platform singleton)
- **Mind ADR-0019:** Self-Learning System (requires persistent storage)

## References

- Platform config schema: `kb-labs-core/packages/core-runtime/src/config.ts`
- ExecutionContext definition: `kb-labs-core/packages/core-sandbox/src/types/index.ts`
- IPC serializer: `kb-labs-core/packages/core-sandbox/src/runner/ipc-serializer.ts`
- Worker context recreator: `kb-labs-core/packages/core-sandbox/src/runner/context/context-recreator.ts`
- Mind engine platform usage: `kb-labs-mind/packages/mind-engine/src/index.ts`

## Notes

This ADR documents the solution to platform adapter availability in sandbox workers, implemented on 2025-12-06. The approach maintains sandbox security while providing workers with full platform capabilities through clean config propagation via IPC.

Key insight: **Separate config (data) from instances (code)**. Config is serializable and can cross IPC boundaries; instances are created locally in each process using the same initialization logic.
