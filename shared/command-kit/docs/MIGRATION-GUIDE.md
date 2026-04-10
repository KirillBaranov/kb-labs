# Migration Guide

Guide for migrating existing commands to use Command Kit.

## Low-level Migration

### Before

```typescript
export async function myHandler(
  ctx: CliContext,
  argv: string[],
  rawFlags: Record<string, unknown>
) {
  const jsonMode = !!rawFlags.json;
  const scope = rawFlags.scope as string;
  
  if (!scope) {
    ctx.output?.error('--scope is required');
    return 1;
  }
  
  // business logic
}
```

### After

```typescript
import { defineFlags, validateFlags } from '@kb-labs/cli-command-kit/flags';
import { TimingTracker } from '@kb-labs/cli-command-kit/helpers';
import { trackCommand } from '@kb-labs/cli-command-kit/analytics';
import { formatError } from '@kb-labs/cli-command-kit/errors';

const schema = defineFlags({
  scope: { type: 'string', required: true },
  json: { type: 'boolean', default: false },
});

export async function myHandler(
  ctx: CliContext,
  argv: string[],
  rawFlags: Record<string, unknown>
) {
  const tracker = new TimingTracker();
  
  try {
    const flags = await validateFlags(rawFlags, schema);
    
    const { emit, scope } = trackCommand(ctx.analytics, {
      command: 'my-command',
      startEvent: 'MY_COMMAND_STARTED',
      finishEvent: 'MY_COMMAND_FINISHED',
    });
    
    return await scope(async () => {
      await emit('started', { scope: flags.scope });
      
      // business logic
      
      await emit('finished', { result: 'success' });
      return 0;
    });
  } catch (error) {
    const formatted = formatError(error, { jsonMode: Boolean(rawFlags.json) });
    if (rawFlags.json) {
      ctx.output?.json(formatted.json);
    } else {
      ctx.output?.error(formatted.message);
    }
    return 1;
  }
}
```

## High-level Migration

### Before

```typescript
export const run: Command = {
  name: 'release:run',
  category: 'release',
  describe: 'Execute release process',
  async run(ctx, argv, flags) {
    const jsonMode = !!flags.json;
    // ... lots of boilerplate
  },
};

export async function runCommand(ctx, argv, flags) {
  return run.run(ctx, argv, flags);
}
```

### After

```typescript
import { defineCommand } from '@kb-labs/cli-command-kit';

export const runCommand = defineCommand({
  name: 'release:run',
  flags: {
    scope: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
  analytics: {
    startEvent: 'RELEASE_RUN_STARTED',
    finishEvent: 'RELEASE_RUN_FINISHED',
  },
  async handler(ctx, argv, flags) {
    // flags are typed and validated automatically
    // ctx.tracker is available
    // analytics is handled automatically
    
    ctx.logger?.info('Release started', { scope: flags.scope });
    ctx.tracker.checkpoint('planning');
    
    // business logic
    
    return { ok: true, published: 5 };
  },
});
```

## Key Changes

1. **Remove Command object wrapper** - Export function directly
2. **Use defineFlags** - Get type-safe flags
3. **Use defineCommand** - Get all boilerplate handled automatically
4. **Remove manual validation** - Handled by kit
5. **Remove manual analytics** - Handled by kit
6. **Remove manual error handling** - Handled by kit

