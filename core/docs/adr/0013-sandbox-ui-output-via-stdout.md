# ADR-0013: Sandbox UI Output via stdout Piping (Rejecting IPC UI Facade)

**Date:** 2025-12-13
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-13
**Tags:** [architecture, sandbox, ui, output, simplicity]

## Context

KB Labs plugins run in sandbox child processes (via `child_process.fork()`). When sandbox was introduced in November 2025, UI output (sideBox, spinners, formatted messages) from plugins stopped appearing in the terminal.

### Problem

**Before sandbox (system commands in parent process):**
```typescript
// System command - runs in parent process
defineSystemCommand({
  async handler(ctx: SystemContext) {
    ctx.presenter.message('Hello!');
    console.log('Result: ', data);
    // ✅ Output appears directly in terminal
  }
});
```

**After sandbox (plugin commands in child process):**
```typescript
// Plugin command - runs in sandbox child
defineCommand({
  async handler(ctx: PluginContext) {
    console.log('Hello!');
    // ❌ Goes to RingBuffer, NOT terminal!
    // ❌ Only visible with --debug flag
  }
});
```

**Root cause:** In `node-subproc.ts:73-125`, child process stdout/stderr are collected in RingBuffer but **not piped to parent's terminal** by default:

```typescript
function setupLogPipes(child: ChildProcess): RingBuffer {
  child.stdout.on('data', (data) => {
    ringBuffer.append(`[stdout] ${line}`);
    // ❌ NO console.log(line) - output lost!
  });
}
```

Output only included in result if `ctx.debug === true`.

## Decision Drivers

- **Simplicity**: Keep architecture simple and understandable
- **Developer experience**: Plugins should "just work" without special APIs
- **Backward compatibility**: `ctx.output` from core-sys should work everywhere
- **Minimal code**: Prefer solutions that add minimal complexity
- **Standard patterns**: Use stdout/stderr as designed (Unix philosophy)
- **Learning from experience**: IPC UI facade was tried and rejected in practice

## Considered Options

### Option 1: IPC UI Facade ❌ **REJECTED**

**Approach:** Send structured UI messages from child to parent via IPC.

**Implementation:**
```typescript
// Child process (plugin):
ctx.ui.sideBox({ title: 'Result', sections: [...] });
  ↓
process.send({ type: 'UI_EVENT', payload: { ... } });

// Parent process:
child.on('message', (msg) => {
  if (msg.type === 'UI_EVENT') {
    console.log(presenter.sideBox(msg.payload));
  }
});
```

**Pros:**
- ✅ Structured data (parent can transform before display)
- ✅ Parent controls formatting
- ✅ Can filter/enhance UI events

**Cons:**
- ❌ **High complexity**: 300+ lines of code (ipc-presenter.ts, handleUIEvent, protocol)
- ❌ **Protocol overhead**: Need to define UI_EVENT message types
- ❌ **Serialization**: Need to serialize/deserialize UI payloads
- ❌ **ctx.output broken**: Output from core-sys doesn't work (only ctx.ui)
- ❌ **Dual APIs**: Plugins must use ctx.ui for UI, ctx.output won't work
- ❌ **Poor DX**: Developers confused about which API to use
- ❌ **Not flexible**: Adding new UI methods requires protocol changes

**Experience report (2025-12-13):**
> "I tried IPC UI and didn't like it. It felt overengineered. The simple thing (just console.log)
> was hidden behind complex protocols. I want simplicity, not abstractions I have to think about."
> — Project maintainer

### Option 2: stdout Piping ✅ **CHOSEN**

**Approach:** Pipe child stdout/stderr directly to parent's terminal (like stderr already does).

**Implementation:**
```typescript
// In setupLogPipes() - ADD 4 LINES:
child.stdout.on('data', (data) => {
  for (const line of lines) {
    ringBuffer.append(`[stdout] ${line}`);

    // ✅ Pipe to terminal (same as stderr already does)
    const isCLI = ctx.pluginContext?.host === 'cli';
    const isNotJSON = !ctx.jsonMode;
    if (isCLI && isNotJSON) {
      console.log(line);
    }
  }
});
```

**Pros:**
- ✅ **Minimal code**: 4 lines (vs 300+ for IPC)
- ✅ **Works immediately**: All console.log() appears in terminal
- ✅ **ctx.output works**: Output from core-sys works without changes
- ✅ **Standard semantics**: Uses stdout as designed (Unix philosophy)
- ✅ **SDK formatters work**: Any formatter from shared-cli-ui works
- ✅ **Consistent with stderr**: stderr already pipes this way (line 120-122)
- ✅ **No protocol**: No message types, no serialization
- ✅ **Simple mental model**: stdout → terminal (what developers expect)

**Cons:**
- ⚠️ **No parent filtering**: Parent can't transform output before display
  - **Mitigation:** Not needed in practice - child formats correctly
- ⚠️ **No structured data**: Parent receives text, not objects
  - **Mitigation:** If needed, use CommandResult for structured data

**Already works for stderr:**
```typescript
// From node-subproc.ts:120-122
if (isCLI && isNotJSON) {
  console.error(line); // ← stderr already piped!
}
```

We're just doing the same for stdout.

### Option 3: Enable Debug Mode ❌ **REJECTED**

**Approach:** Run plugins with `ctx.debug = true` to include logs in result.

**Pros:**
- ✅ Zero code changes

**Cons:**
- ❌ Shows ALL debug logs (noisy)
- ❌ Not selective (can't filter UI vs debug)
- ❌ Hacky workaround

## Decision

**We choose Option 2: stdout Piping**

### Rationale

1. **Simplicity wins**: 4 lines vs 300+ lines
2. **Standard Unix philosophy**: stdout is for output, use it
3. **Developer expectations**: `console.log()` should just work
4. **Proven pattern**: stderr already pipes this way successfully
5. **Real-world validation**: IPC UI was tried and rejected as overengineered
6. **ADR-0021 alignment**: Establishes `console.log` is for command output

### Consistency with ADR-0021

[ADR-0021: Console Log and Command Output Separation](../../../kb-labs-core/docs/adr/0021-console-log-command-output-separation.md) establishes:

> **Key insight:** `console.log` = command output (not debug logging)

Our decision aligns perfectly:
- `console.log()` → stdout → **piped to terminal** (command output)
- `console.debug()` → stdout → **suppressed in silent mode** (debug logging)

## Implementation

### Changes Required

**File:** `kb-labs-plugin/packages/plugin-runtime/src/sandbox/node-subproc.ts`

**Modification:**
```diff
function setupLogPipes(child: ChildProcess, ctx: ExecutionContext): RingBuffer {
  // ... existing code ...

  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      const MAX_DATA_LENGTH = 100000;
      const truncated = data.length > MAX_DATA_LENGTH
        ? data.substring(0, MAX_DATA_LENGTH) + '\n[TRUNCATED]'
        : data;

      const lines = truncated.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        ringBuffer.append(`[stdout] ${line}`);

+       // Pipe stdout to terminal (same as stderr does)
+       const isCLI = ctx.pluginContext?.host === 'cli';
+       const isNotJSON = !ctx.jsonMode;
+       if (isCLI && isNotJSON) {
+         console.log(line);
+       }
      }
    });
  }

  // stderr already has this logic (lines 120-122) - we're just matching it
}
```

### Cleanup (Optional, Future)

**If desired**, remove IPC UI code (not strictly necessary, can coexist):

1. **Delete IPC presenter** (~240 lines):
   - `kb-labs-plugin/packages/plugin-runtime/src/presenter/ipc-presenter.ts`

2. **Remove IPC handling** (~50 lines):
   - `handleUIEvent()` in `node-subproc.ts`
   - `UI_EVENT` message handling

3. **Update exports**:
   - Remove `createIPCUIFacade` from `presenter/index.ts`

**Impact:** -300 lines of code, simpler architecture.

**Note:** Cleanup is optional. The pipes work regardless of whether IPC UI exists.

## Consequences

### Positive

- ✅ **Simple**: 4 lines of code vs 300+
- ✅ **Works everywhere**: `ctx.output` from core-sys works in sandbox
- ✅ **Standard semantics**: Uses stdout as designed
- ✅ **SDK compatibility**: All shared-cli-ui formatters work
- ✅ **Mental model**: stdout → terminal (what developers expect)
- ✅ **Proven**: stderr already pipes this way successfully
- ✅ **Maintainable**: Less code = less bugs

### Negative

- ⚠️ **No parent filtering**: Can't transform output in parent
  - **Impact:** Minimal - child formats correctly
  - **Workaround:** If structured data needed, use CommandResult

- ⚠️ **IPC UI wasted effort**: ~300 lines written then abandoned
  - **Impact:** None (code can be deleted)
  - **Lesson:** Validate with real usage before building complex abstractions

### Migration Path

**Immediate:**
1. ✅ Add stdout piping (4 lines in node-subproc.ts)
2. ✅ Test with plugin-template hello command
3. ✅ Verify release-manager commands show output

**Short-term (optional):**
- 🔄 Delete IPC UI code if desired (-300 lines)
- 🔄 Update plugin guides to recommend `ctx.output`

**Long-term:**
- 🔄 Audit all plugins for console usage
- 🔄 Ensure `console.log` used for output, `console.debug` for debug

## Alternatives Rejected

### Why not keep IPC UI as option?

Could support both stdout piping AND IPC UI, letting plugins choose.

**Rejected because:**
- Adds complexity (two ways to do the same thing)
- Confuses developers ("which one do I use?")
- Maintenance burden (two code paths to test)
- **YAGNI**: No evidence IPC UI benefits are needed in practice

If filtering/transformation is ever needed, can add it at formatting layer (before console.log), not transport layer (IPC).

## References

- **Related ADRs:**
  - [ADR-0021: Console Log and Command Output Separation](../../../kb-labs-core/docs/adr/0021-console-log-command-output-separation.md)
  - [ADR-0023: Runtime Adapter Pattern](../../../kb-labs-mind/docs/adr/0023-runtime-adapter-pattern.md) (sandbox context)

- **Related Tasks:**
  - [TASK-002: UI Output Architecture for Sandbox](../../../docs/tasks/TASK-002-ui-output-architecture-for-sandbox.md)

- **Code References:**
  - [node-subproc.ts:73-125](../../packages/plugin-runtime/src/sandbox/node-subproc.ts#L73-L125) - Log pipes setup
  - [plugin-template run.ts](../../../kb-labs-plugin-template/packages/plugin-template-core/src/cli/commands/run.ts) - Example using ctx.output

---

**Last Updated:** 2025-12-13
**Next Review:** 2026-03-13 (3 months - revisit if UI requirements change)
