# @kb-labs/cli-runtime

CLI execution pipeline — middleware chain, output formatters, and runtime context.

## Overview

Wires together the KB Labs CLI execution pipeline. Provides `createCliRuntime()` which sets up the middleware chain and formatter registry used by every command invocation.

## Quick Start

```typescript
import { createCliRuntime } from '@kb-labs/cli-runtime';

const runtime = await createCliRuntime({
  cwd: process.cwd(),
  env: process.env,
});

// Execute command through middleware chain
const result = await runtime.middleware.execute(ctx, () => handler(ctx, argv, flags));

// Format output
const output = runtime.formatters.format(result, 'json');
```

## Middleware

Commands run through a priority-ordered middleware chain. Lower priority number = runs first.

```typescript
import { createCliRuntime, type CommandMiddleware } from '@kb-labs/cli-runtime';

const authMiddleware: CommandMiddleware = {
  name: 'auth',
  priority: 10,
  async execute(ctx, next) {
    if (!ctx.isAuthenticated) throw new Error('Not authenticated');
    return next();
  },
};

const runtime = await createCliRuntime({
  cwd: process.cwd(),
  env: process.env,
  middlewares: [authMiddleware],
});
```

Built-in middleware (always active): timing, execution limits, error normalization.

## Output Formatters

```typescript
import { createCliRuntime, jsonFormatter, tableFormatter } from '@kb-labs/cli-runtime';

const runtime = await createCliRuntime({
  cwd: process.cwd(),
  env: process.env,
  formatters: [tableFormatter, jsonFormatter], // custom order
});

// Select format at runtime (e.g. from --json flag)
runtime.formatters.format(data, flags.json ? 'json' : 'table');
```

Built-in formatters: `jsonFormatter`, `yamlFormatter`, `tableFormatter`, `markdownFormatter`.

## Runtime Context

```typescript
import { createRuntimeContext } from '@kb-labs/cli-runtime';

const ctx = await createRuntimeContext({
  cwd: process.cwd(),
  env: process.env,
  logger,
  platform,
  limits: {
    middlewareTimeout: 5_000,   // ms
    discoveryTimeout: 10_000,
    lifecycleTimeout: 30_000,
  },
});
```

## License

KB Public License v1.1 © KB Labs
