# Declarative Flags and Environment Variables

**For Plugin Developers**: Type-safe CLI flags and environment variables with automatic validation.

## Overview

KB Labs provides declarative systems for defining CLI flags and environment variables with:

✅ **Type Safety** — Automatic type inference from schema
✅ **Validation** — Built-in type checking + custom validators
✅ **DX** — 1 line of code instead of 5+
✅ **Self-Documenting** — Schema serves as documentation

## Quick Start

### CLI Flags

```typescript
// In your-plugin-contracts/src/flags.ts
import { defineFlags } from '@kb-labs/sdk';

export const myFlags = defineFlags({
  scope: {
    type: 'string',
    description: 'Limit to package or path',
    examples: ['@kb-labs/core', 'packages/**'],
  },
  'dry-run': {
    type: 'boolean',
    description: 'Preview without applying',
    default: false,
  },
  timeout: {
    type: 'number',
    description: 'Timeout in milliseconds',
    default: 5000,
    validate: (v) => {
      if (v < 0) throw new Error('Timeout must be positive');
    },
  },
});

export type MyFlags = typeof myFlags.type;
// Result: { scope?: string; 'dry-run': boolean; timeout: number }
```

```typescript
// In your command
import { defineCommand } from '@kb-labs/sdk';
import { type MyFlags } from './contracts';

export default defineCommand({
  handler: {
    async execute(ctx, input: MyFlags) {
      const { scope, 'dry-run': dryRun, timeout } = input;
      // ✅ Fully typed, no manual parsing needed
    }
  }
});
```

### Environment Variables

```typescript
// In your-plugin-contracts/src/env.ts
import { defineEnv } from '@kb-labs/sdk';

export const myEnv = defineEnv({
  MY_API_KEY: {
    type: 'string',
    description: 'API key for service',
  },
  MY_ENABLED: {
    type: 'boolean',
    default: true,
    description: 'Enable feature',
  },
  MY_TIMEOUT: {
    type: 'number',
    default: 5000,
    description: 'Timeout in ms',
    validate: (v) => {
      if (v < 0) throw new Error('Timeout must be positive');
    },
  },
});

export type MyEnv = typeof myEnv.type;
// Result: { MY_API_KEY?: string; MY_ENABLED: boolean; MY_TIMEOUT: number }
```

```typescript
// In your command
const env = myEnv.parse(ctx.runtime);
// ✅ One line! Fully typed and validated
// env.MY_API_KEY → string | undefined
// env.MY_ENABLED → boolean
// env.MY_TIMEOUT → number
```

## Flag Types

### String Flags

```typescript
export const flags = defineFlags({
  name: {
    type: 'string',
    description: 'User name',
    examples: ['john', 'jane'],
  },
  email: {
    type: 'string',
    default: 'noreply@example.com',
    validate: (v) => {
      if (!v.includes('@')) throw new Error('Invalid email');
    },
  },
});

type Result = typeof flags.type;
// { name?: string; email: string }
```

**Key points**:
- Without `default`: optional (`string | undefined`)
- With `default`: required (`string`)
- Custom validation via `validate` function

### Boolean Flags

```typescript
export const flags = defineFlags({
  verbose: {
    type: 'boolean',
    description: 'Enable verbose logging',
    default: false,
  },
  force: {
    type: 'boolean',
    description: 'Force operation',
  },
});

type Result = typeof flags.type;
// { verbose: boolean; force?: boolean }
```

**Parsing**:
- `true`, `'true'`, `'1'`, `'yes'` → `true`
- `false`, `'false'`, `'0'`, `'no'` → `false`

### Number Flags

```typescript
export const flags = defineFlags({
  port: {
    type: 'number',
    default: 3000,
    description: 'Server port',
    validate: (v) => {
      if (v < 1024 || v > 65535) {
        throw new Error('Port must be 1024-65535');
      }
    },
  },
  retries: {
    type: 'number',
    description: 'Number of retries',
  },
});

type Result = typeof flags.type;
// { port: number; retries?: number }
```

**Parsing**:
- Numbers: `3000` → `3000`
- Strings: `'3000'` → `3000`
- Invalid: `'abc'` → throws error

## Type Inference

The type system automatically infers correct types:

```typescript
export const flags = defineFlags({
  // Without default → optional
  scope: { type: 'string' },

  // With default → required
  verbose: { type: 'boolean', default: false },
});

type Inferred = typeof flags.type;
// { scope?: string; verbose: boolean }
//   ^^^^^ optional    ^^^^^^^ required
```

### Why This Matters

```typescript
function doSomething(input: MyFlags) {
  // ✅ TypeScript knows this might be undefined
  if (input.scope) {
    console.log(input.scope.toUpperCase());
  }

  // ✅ TypeScript knows this is always boolean
  if (input.verbose) {
    console.log('Verbose mode enabled');
  }
}
```

## Validation

### Built-in Type Validation

Automatic for all types:

```typescript
// ❌ Runtime error: "Flag 'port' must be number, got string"
const flags = { port: 'invalid' };
myFlags.parse(flags);
```

### Custom Validation

Add business logic validation:

```typescript
export const flags = defineFlags({
  temperature: {
    type: 'number',
    default: 0.3,
    validate: (v) => {
      if (v < 0 || v > 1) {
        throw new Error('Temperature must be 0-1');
      }
    },
  },
  email: {
    type: 'string',
    validate: (v) => {
      if (!v.includes('@')) {
        throw new Error('Invalid email format');
      }
    },
  },
});
```

**Validation happens**:
- After type coercion
- Before returning to command
- Only if value is present (not for `undefined`)

## Environment Variables

### Basic Usage

```typescript
// In contracts
export const myEnv = defineEnv({
  MY_VAR: { type: 'boolean', default: true },
});

// In command
const env = myEnv.parse(ctx.runtime);
console.log(env.MY_VAR); // boolean
```

### With Validation

```typescript
export const myEnv = defineEnv({
  MY_TEMPERATURE: {
    type: 'number',
    default: 0.3,
    validate: (v) => {
      if (v < 0 || v > 1) {
        throw new Error('MY_TEMPERATURE must be 0-1');
      }
    },
  },
});

// Usage
MY_TEMPERATURE=1.5 pnpm kb my-command
// ❌ Error: MY_TEMPERATURE must be 0-1
```

### Real-World Example

```typescript
// commit-contracts/src/env.ts
export const commitEnv = defineEnv({
  KB_COMMIT_LLM_ENABLED: {
    type: 'boolean',
    default: true,
    description: 'Enable LLM-powered commit analysis',
  },
  KB_COMMIT_LLM_TEMPERATURE: {
    type: 'number',
    default: 0.3,
    description: 'LLM temperature (0-1)',
    validate: (v) => {
      if (v < 0 || v > 1) {
        throw new Error('Temperature must be 0-1');
      }
    },
  },
  KB_COMMIT_LLM_MAX_TOKENS: {
    type: 'number',
    default: 2000,
    description: 'Maximum tokens for LLM',
  },
});

// In command
const env = commitEnv.parse(ctx.runtime);
// env.KB_COMMIT_LLM_ENABLED → boolean
// env.KB_COMMIT_LLM_TEMPERATURE → number (validated 0-1)
// env.KB_COMMIT_LLM_MAX_TOKENS → number
```

## Migration Guide

### Before (Manual)

```typescript
// ❌ OLD: Lots of boilerplate, no type safety
type MyInput = {
  scope?: string;
  'dry-run'?: boolean;
};

const env = {
  MY_ENABLED: ctx.runtime.env('MY_ENABLED'),
  MY_TEMPERATURE: ctx.runtime.env('MY_TEMPERATURE'),
  MY_MAX_TOKENS: ctx.runtime.env('MY_MAX_TOKENS'),
};

// Manual parsing
let enabled = true;
if (env.MY_ENABLED !== undefined) {
  enabled = env.MY_ENABLED === 'true';
}

let temperature = 0.3;
if (env.MY_TEMPERATURE !== undefined) {
  const temp = parseFloat(env.MY_TEMPERATURE);
  if (!isNaN(temp) && temp >= 0 && temp <= 1) {
    temperature = temp;
  }
}

// Use values
const dryRun = input['dry-run'] ?? false;
```

### After (Declarative)

```typescript
// ✅ NEW: Clean, type-safe, validated
export const myFlags = defineFlags({
  scope: { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
});

export const myEnv = defineEnv({
  MY_ENABLED: { type: 'boolean', default: true },
  MY_TEMPERATURE: {
    type: 'number',
    default: 0.3,
    validate: (v) => {
      if (v < 0 || v > 1) throw new Error('Must be 0-1');
    },
  },
});

// In command
const env = myEnv.parse(ctx.runtime);
const { scope, 'dry-run': dryRun } = input;

// ✅ 2 lines instead of 20+, fully typed
```

## Best Practices

### 1. Always Add Descriptions

```typescript
// ✅ GOOD: Self-documenting
export const flags = defineFlags({
  scope: {
    type: 'string',
    description: 'Limit operation to specific scope',
    examples: ['@kb-labs/core', 'packages/**'],
  },
});

// ❌ BAD: No documentation
export const flags = defineFlags({
  scope: { type: 'string' },
});
```

### 2. Use Defaults for Required Values

```typescript
// ✅ GOOD: Required boolean with default
export const flags = defineFlags({
  verbose: {
    type: 'boolean',
    default: false, // Always boolean, never undefined
  },
});

// ⚠️ CAUTION: Optional boolean
export const flags = defineFlags({
  verbose: { type: 'boolean' }, // boolean | undefined
});
```

### 3. Validate Business Logic

```typescript
// ✅ GOOD: Domain validation
export const flags = defineFlags({
  port: {
    type: 'number',
    validate: (v) => {
      if (v < 1024 || v > 65535) {
        throw new Error('Port must be 1024-65535');
      }
    },
  },
});

// ❌ BAD: No validation, runtime errors possible
export const flags = defineFlags({
  port: { type: 'number' },
});
```

### 4. Group Related Flags

```typescript
// ✅ GOOD: Organized by feature
export const llmFlags = defineFlags({
  'llm-temperature': { type: 'number', default: 0.3 },
  'llm-max-tokens': { type: 'number', default: 2000 },
  'llm-enabled': { type: 'boolean', default: true },
});

export const gitFlags = defineFlags({
  'git-auto-stage': { type: 'boolean', default: false },
  'git-push': { type: 'boolean', default: false },
});
```

## Error Handling

### Type Errors

```typescript
const flags = defineFlags({
  port: { type: 'number' },
});

// ❌ Error: Flag "port" must be number, got string
flags.parse({ port: 'invalid' });
```

### Validation Errors

```typescript
const flags = defineFlags({
  temperature: {
    type: 'number',
    validate: (v) => {
      if (v < 0 || v > 1) {
        throw new Error('Temperature must be 0-1');
      }
    },
  },
});

// ❌ Error: Temperature must be 0-1
flags.parse({ temperature: 1.5 });
```

### Graceful Handling

```typescript
try {
  const env = myEnv.parse(ctx.runtime);
  // Use env
} catch (error) {
  ctx.ui?.error?.(`Invalid environment: ${error.message}`);
  return { exitCode: 1 };
}
```

## Advanced Patterns

### Combining Flags and Env

```typescript
// Flags for CLI args
export const myFlags = defineFlags({
  scope: { type: 'string' },
  verbose: { type: 'boolean', default: false },
});

// Env for configuration
export const myEnv = defineEnv({
  MY_API_KEY: { type: 'string' },
  MY_ENABLED: { type: 'boolean', default: true },
});

// In command
const env = myEnv.parse(ctx.runtime);
const { scope, verbose } = input;

// Merge: flags override env
const enabled = input.enabled ?? env.MY_ENABLED;
```

### Conditional Validation

```typescript
export const flags = defineFlags({
  mode: { type: 'string', default: 'auto' },
  temperature: {
    type: 'number',
    default: 0.3,
    validate: (v) => {
      // Only validate if mode is 'thinking'
      // (actual check done in command)
      if (v < 0 || v > 1) {
        throw new Error('Temperature must be 0-1');
      }
    },
  },
});
```

### Dynamic Defaults

```typescript
export const flags = defineFlags({
  output: {
    type: 'string',
    // No default here - set dynamically in command
  },
});

// In command
const output = input.output ?? `.kb/output-${Date.now()}.json`;
```

## Reference

### Flag Spec

```typescript
interface StringFlagSpec {
  type: 'string';
  description?: string;
  examples?: string[];
  deprecated?: boolean | string;
  default?: string;
  validate?: (value: string) => void | Promise<void>;
}

interface BooleanFlagSpec {
  type: 'boolean';
  description?: string;
  deprecated?: boolean | string;
  default?: boolean;
}

interface NumberFlagSpec {
  type: 'number';
  description?: string;
  deprecated?: boolean | string;
  default?: number;
  validate?: (value: number) => void | Promise<void>;
}
```

### API

```typescript
// Define flags
const flags = defineFlags({ ... });
// → FlagsDefinition<T>

// Get inferred type
type MyFlags = typeof flags.type;
// → InferFlagsType<T>

// Parse flags
const parsed = flags.parse(input);
// → InferFlagsType<T>

// Define env
const env = defineEnv({ ... });
// → EnvDefinition<T>

// Parse env
const parsed = env.parse(runtime);
// → InferFlagsType<T>
```

## See Also

- [ADR-0006: Declarative Flags and Env Systems](./adr/0006-declarative-flags-and-env-systems.md)
- [V3 Plugin System Spec](../../docs/V3-IMPLEMENTATION-SPEC.md)
