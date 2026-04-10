# Declarative Flags & Env — Quick Reference

Type-safe CLI flags and environment variables for V3 plugins.

## CLI Flags

```typescript
import { defineFlags } from '@kb-labs/sdk';

export const myFlags = defineFlags({
  scope: {
    type: 'string',
    description: 'Limit to scope',
    examples: ['@kb-labs/core'],
  },
  'dry-run': {
    type: 'boolean',
    description: 'Preview only',
    default: false,
  },
  timeout: {
    type: 'number',
    default: 5000,
    validate: (v) => {
      if (v < 0) throw new Error('Must be positive');
    },
  },
});

export type MyFlags = typeof myFlags.type;
// → { scope?: string; 'dry-run': boolean; timeout: number }
```

**In command**:
```typescript
const { scope, 'dry-run': dryRun, timeout } = input;
// ✅ Fully typed, auto-validated
```

## Environment Variables

```typescript
import { defineEnv } from '@kb-labs/sdk';

export const myEnv = defineEnv({
  MY_API_KEY: {
    type: 'string',
    description: 'API key',
  },
  MY_ENABLED: {
    type: 'boolean',
    default: true,
  },
  MY_TIMEOUT: {
    type: 'number',
    default: 5000,
    validate: (v) => {
      if (v < 0) throw new Error('Must be positive');
    },
  },
});

export type MyEnv = typeof myEnv.type;
// → { MY_API_KEY?: string; MY_ENABLED: boolean; MY_TIMEOUT: number }
```

**In command**:
```typescript
const env = myEnv.parse(ctx.runtime);
// ✅ One line! Fully typed and validated
```

## Type Inference

```typescript
// Without default → optional
{ name: { type: 'string' } }
// → { name?: string }

// With default → required
{ verbose: { type: 'boolean', default: false } }
// → { verbose: boolean }
```

## Validation

**Built-in**: Automatic type checking

**Custom**: Add validation logic
```typescript
{
  port: {
    type: 'number',
    validate: (v) => {
      if (v < 1024 || v > 65535) {
        throw new Error('Port must be 1024-65535');
      }
    },
  }
}
```

## Before/After

```typescript
// ❌ BEFORE: 5+ lines, no type safety
const env = {
  MY_VAR: ctx.runtime.env('MY_VAR'),
  MY_NUM: ctx.runtime.env('MY_NUM'),
  // ...
};

let num = 0;
if (env.MY_NUM) {
  num = parseFloat(env.MY_NUM);
  if (!isNaN(num)) { /* ... */ }
}
```

```typescript
// ✅ AFTER: 1 line, type-safe
const env = myEnv.parse(ctx.runtime);
// env.MY_NUM → number (validated)
```

## Documentation

- **Full Guide**: `kb-labs-shared/docs/DECLARATIVE-FLAGS-AND-ENV.md`
- **ADR**: `kb-labs-shared/docs/adr/0006-declarative-flags-and-env-systems.md`
