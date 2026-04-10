# High-level API

Complete wrapper for building commands with zero boilerplate.

## defineCommand

The `defineCommand` function handles all boilerplate automatically:

- Flag validation
- Logging
- Analytics
- Error handling
- Output formatting
- Timing tracking

### Basic Example

```typescript
import { defineCommand } from '@kb-labs/cli-command-kit';

export const myCommand = defineCommand({
  name: 'my-command',
  flags: {
    scope: { type: 'string', required: true },
    'dry-run': { type: 'boolean', default: false },
  },
  async handler(ctx, argv, flags) {
    ctx.logger?.info('Command started', { scope: flags.scope });
    ctx.tracker.checkpoint('start');
    
    // Business logic
    
    return { ok: true };
  },
});
```

### With Analytics

```typescript
export const myCommand = defineCommand({
  name: 'my-command',
  flags: { /* ... */ },
  analytics: {
    startEvent: 'MY_COMMAND_STARTED',
    finishEvent: 'MY_COMMAND_FINISHED',
    includeFlags: true,
  },
  async handler(ctx, argv, flags) {
    // Analytics events are sent automatically
    return { ok: true };
  },
});
```

### With Custom Formatter

```typescript
export const myCommand = defineCommand({
  name: 'my-command',
  flags: { /* ... */ },
  async handler(ctx, argv, flags) {
    return { ok: true, data: 'result' };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.output?.json(result);
    } else {
      ctx.output?.write(`✓ Success: ${result.data}`);
    }
  },
});
```

## Enhanced Context

The handler receives an enhanced context with:

- `ctx.tracker` - TimingTracker instance
- All original `ctx` properties (logger, output, etc.)

## Return Values

Handler can return:

- `number` - Exit code (0 = success, non-zero = error)
- `{ ok: boolean, ... }` - Result object (ok: true = success, ok: false = error)
- Defaults to `{ ok: true }` if nothing returned

