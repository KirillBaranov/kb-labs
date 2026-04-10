# ADR-0021: Console Log and Command Output Separation

**Date:** 2025-11-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-27
**Tags:** [logging, platform, sandbox, subprocess]

## Context

The KB Labs platform uses `KB_LOG_LEVEL` environment variable to control logging verbosity across all CLI commands and plugins. However, a critical issue was discovered where **command output was being suppressed** along with debug logs in silent mode.

### Problem

When `KB_LOG_LEVEL=silent` was set (the default), the console interception system in the subprocess sandbox was suppressing **both**:
1. Platform debug logs (desired behavior) ✅
2. **Command output/results** (undesired behavior) ❌

For example, Mind's `rag-query --agent` command outputs JSON results via `console.log()`, but these results were being suppressed in silent mode, showing only platform status messages like "OK Command completed successfully" instead of the actual query results.

### Root Cause

The console interception system in `@kb-labs/sandbox` treated `console.log()` as debug logging that should be suppressed in silent mode. However:

- `console.debug()` → debug/trace logging (should be suppressed in silent mode)
- **`console.log()` → actual command output/results** (should NEVER be suppressed!)

This distinction was not properly implemented in the console interception logic.

### Impact

This affected ALL plugins that use `console.log()` for output:
- Mind plugin (`rag-query --agent` returns JSON via `console.log`)
- Any plugin using `console.log` for results
- Agent-mode commands that output structured JSON

Users were unable to see command results, only status messages, making commands appear broken.

## Decision

**Separate console.log (command output) from console.debug (debug logging) at the platform level.**

### Key Changes

#### 1. Console Interception Enhancement

Modified `kb-labs-core/packages/sandbox/src/runner/logging/console-interceptor.ts`:

**Before:**
```typescript
case 'silent':
  // Suppress debug/log, allow warn/error
  return level === 'debug' || level === 'log';
```

**After:**
```typescript
case 'silent':
  // ONLY suppress console.debug (debug logs)
  // console.log is for command output and must ALWAYS pass through!
  return level === 'debug';
```

#### 2. Clear Documentation

Added explicit comments and documentation:

```typescript
/**
 * CRITICAL DISTINCTION:
 * - console.debug → debug logging (suppress in silent mode)
 * - console.log → actual command output/results (NEVER suppress in silent mode!)
 */
```

### Behavior Matrix

| KB_LOG_LEVEL | console.debug | console.log | console.warn | console.error |
|--------------|---------------|-------------|--------------|---------------|
| **silent**   | ❌ Suppress    | ✅ **Allow** | ✅ Allow      | ✅ Allow      |
| **error**    | ❌ Suppress    | ❌ Suppress  | ❌ Suppress   | ✅ Allow      |
| **warn**     | ❌ Suppress    | ❌ Suppress  | ✅ Allow      | ✅ Allow      |
| **info**     | ❌ Suppress    | ✅ Allow     | ✅ Allow      | ✅ Allow      |
| **debug**    | ✅ Allow       | ✅ Allow     | ✅ Allow      | ✅ Allow      |

**Key insight:** In `silent` mode, `console.log` is now **allowed** because it represents command output, not debug logging.

## Consequences

### Positive

- ✅ **Command output works correctly** - Results are visible in silent mode
- ✅ **Platform debug logs still suppressed** - No spam in silent mode
- ✅ **Clear semantic distinction** - `console.log` = output, `console.debug` = logging
- ✅ **Minimal code changes** - Single-line fix with high impact
- ✅ **Backward compatible** - No breaking changes to existing commands
- ✅ **Platform-level enforcement** - Plugins can't bypass this rule

### Negative

- ⚠️ Plugins using `console.log` for debug messages will still see output in silent mode
  - **Mitigation:** Plugins should migrate to `console.debug()` for debug logs
  - **Long-term:** Platform-wide audit to ensure correct console method usage

### Alternatives Considered

#### Alternative 1: New Environment Variable

**Rejected:** Adding `KB_COMMAND_OUTPUT=true/false` to separately control command output.

**Why rejected:**
- Adds unnecessary complexity
- `console.log` already has the correct semantic meaning for "output"
- The platform already has `KB_LOG_LEVEL` - no need for another variable

#### Alternative 2: Special Output Channel

**Rejected:** Creating a dedicated output channel separate from console (e.g., `ctx.output.result()`).

**Why rejected:**
- Requires changes to ALL plugins
- High migration cost
- `console.log` is the standard Node.js way to output results
- Not backward compatible

#### Alternative 3: Custom Log Levels

**Rejected:** Adding a new log level like `output` between `silent` and `error`.

**Why rejected:**
- Overcomplicates the log level hierarchy
- `silent` should mean "no debug logs, show results only" - which is what we now have
- The fix is simpler: just don't suppress `console.log` in silent mode

## Implementation

### Files Modified

1. **`kb-labs-core/packages/sandbox/src/runner/logging/console-interceptor.ts`**
   - Changed `shouldSuppress()` logic for `silent` mode
   - Added documentation comments
   - Updated behavior for all log levels

### Migration Path

**Immediate (Completed):**
- ✅ Console interception updated
- ✅ Sandbox package rebuilt
- ✅ Tested with Mind `rag-query --agent`
- ✅ Tested with other platform commands

**Future (Optional):**
- 🔄 Audit all plugins for `console.log` usage
- 🔄 Ensure plugins use `console.debug()` for debug messages
- 🔄 Update plugin development guidelines

### Testing

**Verified working:**
```bash
# Default (silent) - shows results, no debug logs ✅
pnpm kb mind rag-query --text "test" --agent

# Debug mode - shows both results and debug logs ✅
KB_LOG_LEVEL=debug pnpm kb mind rag-query --text "test" --agent

# Plugins list - clean output ✅
pnpm kb plugins list

# Plugins list with debug - shows platform internals ✅
KB_LOG_LEVEL=debug pnpm kb plugins list
```

## References

- Related work: [Platform-Wide Logging Consistency Fix](../../.claude/plans/jazzy-strolling-hennessy.md)
- Previous ADRs: None directly related (first ADR for console interception semantics)
- Implementation PR: (to be added)

---

**Last Updated:** 2025-11-27
**Next Review:** 2026-02-27 (3 months - revisit if console usage patterns change)
