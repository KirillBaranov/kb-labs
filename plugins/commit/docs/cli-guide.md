# CLI Guide

This guide explains how to add or modify CLI commands in the plugin template.

## Folder structure

```
packages/plugin-template-core/src/cli/
├── commands/
│   ├── run.ts          # Hello command implementation
│   ├── flags.ts        # Command flags definitions
│   └── index.ts        # Barrel export
├── utils.ts            # Command utilities (getCommandId)
└── index.ts            # CLI surface export
```

Each command exports a `run` function using the `defineCommand` pattern from `@kb-labs/cli-command-kit`.

## Creating a new command

### 1. Create command file

Create `src/cli/commands/your-command.ts`:

```typescript
import { defineCommand } from '@kb-labs/cli-command-kit';
import { getCommandId } from '../utils.js';
import type { CliContext } from '@kb-labs/cli-core';

export const run = defineCommand({
  name: getCommandId('template:your-command'),
  flags: {
    input: { type: 'string', required: true },
    verbose: { type: 'boolean', default: false }
  },
  async handler(ctx, argv, flags) {
    // 1. Log command start
    ctx.logger?.info('Command started', { input: flags.input });

    // 2. Call business logic from core/
    const result = await yourBusinessLogic(flags.input);

    // 3. Write output
    ctx.output?.write(`Result: ${result}\n`);

    // 4. Return structured data
    return {
      ok: true,
      result,
      processedAt: new Date().toISOString()
    };
  }
});
```

### 2. Export command

Add to `src/cli/commands/index.ts`:

```typescript
export * from './your-command.js';
```

### 3. Register in manifest

Update `src/manifest.v2.ts`:

```typescript
cli: {
  commands: [
    // ... existing commands
    {
      id: 'template:your-command',
      handler: './cli/commands/your-command.js#run',
      describe: 'Your command description',
      flags: {
        input: {
          type: 'string',
          required: true,
          describe: 'Input parameter'
        },
        verbose: {
          type: 'boolean',
          describe: 'Enable verbose output'
        }
      },
      examples: [
        {
          command: 'kb template:your-command --input "test"',
          description: 'Run with test input'
        }
      ]
    }
  ]
}
```

**💡 Pro tip: Use `generateExamples` for type-safe example generation:**

```typescript
import { generateExamples } from '@kb-labs/plugin-manifest';

cli: {
  commands: [
    {
      id: 'template:your-command',
      handler: './cli/commands/your-command.js#run',
      describe: 'Your command description',
      flags: defineCommandFlags(yourCommandFlags),
      // Type-safe examples generated from flag templates
      examples: generateExamples('your-command', 'template', [
        { description: 'Basic usage', flags: {} },
        { description: 'With input', flags: { input: 'test' } },
        { description: 'Verbose mode', flags: { input: 'test', verbose: true } }
      ])
    }
  ]
}
```

Benefits:
- ✅ Type-safe - no typos in flag names
- ✅ Consistent format - all examples follow CLI syntax
- ✅ Auto-generated - command structure built from templates
- ✅ Maintainable - update once, reflected everywhere

### 4. Add to build config

Ensure `tsup.config.ts` includes command files (usually auto-included via `src/**/*.ts`).

### 5. Write tests

Create `tests/cli/your-command.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { run } from '../../src/cli/commands/your-command.js';

describe('your-command', () => {
  it('should process input correctly', async () => {
    const ctx = {
      logger: { info: vi.fn(), error: vi.fn() },
      output: { write: vi.fn() }
    };

    const result = await run.handler(ctx, {}, { input: 'test' });

    expect(result.ok).toBe(true);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      'Command started',
      { input: 'test' }
    );
  });

  it('should handle errors gracefully', async () => {
    const ctx = {
      logger: { error: vi.fn() },
      output: { write: vi.fn() }
    };

    await expect(
      run.handler(ctx, {}, { input: '' })
    ).rejects.toThrow();
  });
});
```

## Command context (CliContext)

Commands receive a rich context object:

```typescript
interface CliContext {
  // Logging (use this instead of console.log!)
  logger?: {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };

  // Output stream (for user-facing messages)
  output?: {
    write(data: string): void;
  };

  // Runtime utilities (filesystem, config, etc.)
  runtime?: {
    fs?: FileSystem;
    config?: ConfigManager;
    state?: StateBroker;
  };

  // Request metadata
  requestId?: string;
  tenantId?: string;
}
```

## Best practices

### ✅ DO

- **Use ctx.logger** for all logging (not console.log)
- **Use ctx.output** for user-facing messages
- **Keep commands thin** - delegate to `core/` business logic
- **Return structured data** - enables JSON output with `--json` flag
- **Validate inputs** - use Zod schemas or ValidationError
- **Handle errors** - catch and format with `formatErrorForLogging`
- **Write tests** - test both success and error cases
- **Add examples** - in manifest for documentation

### ❌ DON'T

- Don't use `console.log` (use `ctx.logger` instead)
- Don't use `createConsoleLogger` (deprecated, use `ctx.logger`)
- Don't put business logic in commands (use `core/`)
- Don't access filesystem directly (use `ctx.runtime.fs`)
- Don't hardcode paths (use config or flags)
- Don't ignore errors (catch and log properly)

## Command patterns

### Simple command with validation

```typescript
import { ValidationError } from '../../utils/errors.js';

export const run = defineCommand({
  name: getCommandId('template:validate'),
  flags: {
    email: { type: 'string', required: true }
  },
  async handler(ctx, argv, flags) {
    // Validate
    if (!isValidEmail(flags.email)) {
      throw new ValidationError('Invalid email format', 'email');
    }

    // Process
    const result = await processEmail(flags.email);

    // Output
    ctx.output?.write(`Email processed: ${result}\n`);

    return { ok: true, result };
  }
});
```

### Command with error handling

```typescript
import { formatErrorForLogging, formatErrorForUser } from '../../utils/errors.js';

export const run = defineCommand({
  name: getCommandId('template:safe'),
  async handler(ctx, argv, flags) {
    try {
      const result = await riskyOperation();
      ctx.logger?.info('Operation succeeded', { result });
      return { ok: true, result };
    } catch (error) {
      // Log full error with stack
      ctx.logger?.error('Operation failed', formatErrorForLogging(error));

      // Show user-friendly message
      ctx.output?.write(`Error: ${formatErrorForUser(error)}\n`);

      return { ok: false, error: formatErrorForUser(error) };
    }
  }
});
```

### Command with business logic separation

```typescript
// src/cli/commands/process.ts
import { processDocument } from '../../core/document-processor.js';

export const run = defineCommand({
  name: getCommandId('template:process'),
  flags: {
    file: { type: 'string', required: true }
  },
  async handler(ctx, argv, flags) {
    ctx.logger?.info('Processing document', { file: flags.file });

    // Business logic lives in core/
    const result = await processDocument(flags.file);

    ctx.output?.write(`Processed ${result.pages} pages\n`);
    return { ok: true, ...result };
  }
});

// src/core/document-processor.ts
export async function processDocument(filePath: string) {
  // Pure business logic, no CLI dependencies
  // Easy to test, reusable from REST/Studio
  return { pages: 10, words: 5000 };
}
```

### Interactive command

```typescript
import { select, input } from '@kb-labs/shared-cli-ui';

export const run = defineCommand({
  name: getCommandId('template:interactive'),
  async handler(ctx, argv, flags) {
    // Prompt user
    const choice = await select({
      message: 'Choose an option',
      choices: [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' }
      ]
    });

    const name = await input({
      message: 'Enter your name',
      validate: (value) => value.length > 0 || 'Name is required'
    });

    ctx.logger?.info('User selections', { choice, name });

    return { ok: true, choice, name };
  }
});
```

## Testing commands

Commands are easy to test by mocking the context:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { run } from '../../src/cli/commands/run.js';

describe('hello command', () => {
  it('should greet user', async () => {
    const mockCtx = {
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      output: {
        write: vi.fn()
      }
    };

    const result = await run.handler(mockCtx, {}, { name: 'World' });

    expect(result).toMatchObject({
      message: 'Hello, World!',
      target: 'World'
    });

    expect(mockCtx.logger.info).toHaveBeenCalledWith(
      'Hello command started',
      { name: 'World' }
    );

    expect(mockCtx.output.write).toHaveBeenCalledWith('Hello, World!\n');
  });

  it('should use default name', async () => {
    const mockCtx = {
      logger: { info: vi.fn() },
      output: { write: vi.fn() }
    };

    const result = await run.handler(mockCtx, {}, {});

    expect(result.target).toBe('World');
  });
});
```

## Related documentation

- [cli/README.md](../packages/plugin-template-core/src/cli/README.md) - Detailed CLI patterns
- [utils/errors.ts](../packages/plugin-template-core/src/utils/errors.ts) - Error handling
- [core/README.md](../packages/plugin-template-core/src/core/README.md) - Business logic separation

## Examples

See the hello command implementation:

- [cli/commands/run.ts](../packages/plugin-template-core/src/cli/commands/run.ts) - Full command example
- [cli/commands/flags.ts](../packages/plugin-template-core/src/cli/commands/flags.ts) - Flags definition
