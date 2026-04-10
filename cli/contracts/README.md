# @kb-labs/cli-contracts

Type definitions and contracts for KB Labs CLI framework.

## Overview

This package contains **pure TypeScript type definitions** with **ZERO runtime dependencies**. It defines the contracts for:

- **Commands** - `CliCommand` interface for implementing CLI commands
- **Context** - `CliContext`, `Profile` interfaces for execution context
- **Presenters** - `Presenter` interface for output handling

## Installation

```bash
pnpm add @kb-labs/cli-contracts
```

## Usage

### Implementing a CLI Command

```typescript
import type { CliCommand } from '@kb-labs/cli-contracts';

export const myCommand: CliCommand = {
  name: 'my-command',
  description: 'Does something useful',

  registerFlags(builder) {
    // Register command-specific flags
  },

  async run(ctx, argv, flags) {
    ctx.presenter.info('Running my command!');
    return 0; // Exit code
  },
};
```

### Using Context

```typescript
import type { CliContext } from '@kb-labs/cli-contracts';

function doSomething(ctx: CliContext) {
  // Access environment
  const env = ctx.env;

  // Log output
  ctx.presenter.info('Hello!');

  // Access config
  const config = ctx.config;
}
```

## Versioning

This package follows a versioned contract pattern (V1, V2, etc.) for API evolution:

```typescript
import type { CliCommandV1 } from '@kb-labs/cli-contracts';
// Future: CliCommandV2, etc.
```

Default exports always point to the latest stable version.

## Architecture

This is a **contracts package** - it contains only type definitions and has zero runtime dependencies. This pattern:

- ✅ Breaks circular dependencies between packages
- ✅ Provides stable API contracts
- ✅ Enables independent versioning
- ✅ Supports gradual migration (V1 → V2)

## License

MIT
