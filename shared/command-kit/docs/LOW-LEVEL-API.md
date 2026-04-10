# Low-level API

Atomic utilities for building commands manually.

## Flag Validation

### defineFlags

Define a flag schema with automatic type inference.

```typescript
import { defineFlags } from '@kb-labs/cli-command-kit/flags';

const schema = defineFlags({
  scope: {
    type: 'string',
    required: true,
    pattern: /^[@a-z0-9-/]+$/i,
  },
  'dry-run': {
    type: 'boolean',
    default: false,
  },
});

type Flags = typeof schema.infer;
```

### validateFlags

Validate flags against schema.

```typescript
import { validateFlags } from '@kb-labs/cli-command-kit/flags';

const flags = await validateFlags(rawFlags, schema);
```

### validateFlagsSafe

Safe version that doesn't throw.

```typescript
import { validateFlagsSafe } from '@kb-labs/cli-command-kit/flags';

const result = await validateFlagsSafe(rawFlags, schema);
if (!result.success) {
  // Handle errors
}
```

## Analytics

### trackCommand

Wrapper around analytics SDK.

```typescript
import { trackCommand } from '@kb-labs/cli-command-kit/analytics';

const { emit, scope } = trackCommand(ctx.analytics, {
  command: 'my-command',
  startEvent: 'MY_COMMAND_STARTED',
  finishEvent: 'MY_COMMAND_FINISHED',
});

return await scope(async () => {
  await emit('started', { flags });
  // business logic
  await emit('finished', { result: 'success' });
});
```

## Error Formatting

### formatError

Format errors for display.

```typescript
import { formatError } from '@kb-labs/cli-command-kit/errors';

const formatted = formatError(error, {
  jsonMode: Boolean(flags.json),
  showStack: Boolean(flags.debug),
  timingMs: tracker.total(),
});
```

## Timing

### TimingTracker

Re-exported from `@kb-labs/shared-cli-ui`.

```typescript
import { TimingTracker } from '@kb-labs/cli-command-kit/helpers';

const tracker = new TimingTracker();
tracker.checkpoint('start');
// ...
tracker.checkpoint('complete');
const total = tracker.total();
```

