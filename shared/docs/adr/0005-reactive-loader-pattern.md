# ADR-0005: Reactive Loader Pattern for CLI Spinners

**Date:** 2025-12-13
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-13
**Tags:** [ui, architecture, performance, simplicity]

## Context

CLI loaders (spinners) need to update text dynamically while maintaining a single-line animation. The original implementation had issues:

1. **Animation duplication** - When updating text, multiple lines appeared instead of a single updating line
2. **Complex control flow** - Stopping and restarting `setInterval` on each update added unnecessary complexity
3. **Performance overhead** - Clearing intervals and creating new ones every 200ms was wasteful
4. **Child process stdout buffering** - In forked child processes, frequent interval restarts could cause buffering issues

### Initial Approach (Problematic)

```typescript
update(options: Partial<LoaderOptions>): void {
  // Stop current interval
  if (this.intervalId) {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  // Update options
  this.options = { ...this.options, ...options };

  // Restart interval with new text
  this.intervalId = setInterval(() => {
    const text = this.options.text ?? 'Loading...';
    process.stdout.write(`\r${SPINNER_CHARS[frame]} ${text}`);
  }, 200);
}
```

**Problems:**
- ❌ Animation flickers on updates
- ❌ Interval restart overhead every update
- ❌ Race conditions between stop/start
- ❌ Line duplication in child processes

## Decision

Implement a **reactive variable pattern** (Vue-style) where `setInterval` runs continuously and reads a mutable text variable:

```typescript
class Loader {
  private currentText: string;  // ← Reactive variable
  private intervalId?: NodeJS.Timeout;

  start(): void {
    this.isActive = true;

    // Start interval once - reads currentText continuously
    this.intervalId = setInterval(() => {
      if (!this.isActive) {
        this.clearInterval();
        return;
      }

      const char = SPINNER_CHARS[this.frameIndex % SPINNER_CHARS.length];
      process.stdout.write(`\r${char} ${this.currentText}`);  // ← Read reactive text
      this.frameIndex++;
    }, 200);
  }

  update(options: Partial<LoaderOptions>): void {
    this.options = { ...this.options, ...options };

    // Just update the variable - setInterval picks it up on next tick!
    if (options.text !== undefined) {
      this.currentText = options.text;  // ← Simple variable assignment
    }
  }
}
```

**Key insight:** `setInterval` callback has closure access to `this.currentText`. When we update the variable, the next interval tick automatically reads the new value - **no restart needed**.

## Consequences

### Positive

- ✅ **Single-line animation** - No more line duplication
- ✅ **Zero overhead updates** - Just variable assignment (O(1) vs interval restart overhead)
- ✅ **Simple mental model** - "Text is reactive, interval reads it" (Vue-style)
- ✅ **No race conditions** - No concurrent interval management
- ✅ **Child process friendly** - Continuous stdout writes work with piping
- ✅ **Performance** - Eliminates ~50% of interval operations (no stop/start)

### Negative

- ⚠️ **Requires understanding closures** - Developers must understand how setInterval captures `this`
- ⚠️ **Not obvious from API** - `update()` looks like it does nothing, but it's reactive

### Alternatives Considered

**1. Message Queue Pattern**
```typescript
private textQueue: string[] = [];
update(text: string) { this.textQueue.push(text); }
```
❌ Rejected: Adds complexity, doesn't solve fundamental issue

**2. requestAnimationFrame (browser-style)**
❌ Rejected: Not available in Node.js

**3. Observable/RxJS**
❌ Rejected: Overkill dependency for simple text updates

**4. Event Emitter**
```typescript
private emitter = new EventEmitter();
update(text: string) { this.emitter.emit('text', text); }
```
❌ Rejected: More complex than needed, adds event listener overhead

## Implementation

### Files Changed

1. **`kb-labs-shared/packages/shared-cli-ui/src/loader.ts`**
   - Added `private currentText: string` reactive variable
   - Modified `start()` to read `currentText` in interval callback
   - Simplified `update()` to just assign `currentText`

2. **`kb-labs-sdk/packages/sdk/src/ui.ts`**
   - Exported `useLoader` hook for plugin consumption

3. **`kb-labs-plugin/packages/plugin-runtime/src/presenter/presenter-facade.ts`**
   - Removed `spinner()` method from UIFacade interface

### Migration Guide

**Before (deprecated):**
```typescript
const spinner = ctx.ui.spinner('Loading...');
spinner.start();
spinner.update({ text: 'Processing...' });  // ❌ Stop/restart interval
spinner.succeed('Done!');
```

**After (recommended):**
```typescript
import { useLoader } from '@kb-labs/sdk';

const loader = useLoader('Loading...');
loader.start();
loader.update({ text: 'Processing...' });  // ✅ Just update reactive variable
loader.succeed('Done!');
```

### Testing

Verified with `plugin-template:test-loader` command:
- ✅ Single continuous loader (4 updates in 2s) - single line, no duplication
- ✅ Multi-stage progress (3 stages × 4 updates) - clean stage transitions
- ✅ Rapid updates (10 updates in 100ms) - smooth animation
- ✅ Child process execution (verified via PID logging)

### Future Considerations

- Consider TypeScript `readonly` modifier to document reactive variables
- Add JSDoc comment explaining reactive pattern
- Benchmark memory usage vs previous implementation (expected: identical)

## References

- [Vue.js Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html) - Inspiration for pattern
- Implementation: `kb-labs-shared/packages/shared-cli-ui/src/loader.ts`
- Test: `kb-labs-plugin-template/packages/plugin-template-core/src/cli/commands/test-loader.ts`

---

**Last Updated:** 2025-12-13
**Next Review:** 2026-01-13 (1 month - verify no regressions)
