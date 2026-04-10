# ADR-0012: Command Type Safety and Type Inference

**Date:** 2025-11-20
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-20
**Reviewers:** KB Labs Team
**Tags:** [cli, typescript, type-safety, developer-experience]

> **Note:** This ADR documents the type safety architecture for CLI commands, including flag validation, result typing, and optional type inference features.

## Context

The KB Labs CLI command system needed a robust type safety mechanism to:

1. **Eliminate runtime type errors**: Commands receive flags and arguments as `Record<string, unknown>`, leading to unsafe type assertions (`as string`, `as number`) throughout the codebase
2. **Enforce result contracts**: Commands should explicitly declare their return types for better API contracts and future validation
3. **Improve developer experience**: TypeScript should provide autocomplete and type checking for flags, arguments, and results
4. **Support optional strict typing**: While most commands use simple types, some need strict tuple typing for arguments (e.g., `['workflow-id', ...string[]]`)

### Previous State

- Flags were typed as `Record<string, unknown>` requiring manual type assertions
- Command results had no type contracts
- No type inference from flag schemas
- Arguments (`argv`) were always `string[]` with no way to type them strictly
- Over 90 instances of unsafe type assertions (`as string | undefined`) across command implementations

### Constraints

- Must work with existing sandbox execution model (`ctx, argv, flags` signature)
- Must be backward compatible with existing commands
- Should provide zero-boilerplate defaults with optional strict typing
- Must integrate with existing `@kb-labs/cli-command-kit` package

## Decision

We implemented a **comprehensive type safety system** with automatic type inference and optional strict typing:

### 1. Optional Result Type Contracts

Commands **can** explicitly declare their result type via generic `TResult` parameter, but it's **optional**:

```typescript
// Minimal - works without explicit types
export const cmd = defineSystemCommand({
  async handler(ctx, argv, flags) {
    return { ok: true };
  },
});

// With explicit result type (recommended for better contracts)
type WorkflowListResult = CommandResult & {
  workflows: Array<{ id: string }>;
  total: number;
};

export const wfList = defineSystemCommand<WorkflowListResult>({
  async handler(ctx, argv, flags) {
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Philosophy: "Want a cactus? Eat it!"**
- All type parameters have defaults - **nothing is mandatory**
- Use explicit types when you want better type safety and API contracts
- Use defaults when you want simplicity and speed
- Both approaches work perfectly fine

**For `defineCommand` (plugin commands):**
- `TResult` defaults to `CommandResult` - **completely optional**
- Use explicit types when you want, skip them when you don't

**For `defineSystemCommand` (system commands):**
- `TResult` defaults to `CommandResult` - **completely optional**
- Use explicit types when you want, skip them when you don't

**Base Result Contract:**
```typescript
export type CommandResult = {
  ok: boolean;           // REQUIRED in handler return
  error?: string;        // RECOMMENDED for error cases
  status?: CommandStatus; // Auto-inferred if not provided
};
```

**What Contributors MUST Provide (Absolute Minimum):**

1. **Handler function returning `{ ok: boolean }`**:
   ```typescript
   async handler(ctx, argv, flags) {
     return { ok: true }; // ok is required in return value
   }
   ```

**Everything Else is OPTIONAL:**

1. **Result Type** (optional):
   ```typescript
   type MyCommandResult = CommandResult & {
     // Your custom fields
   };
   defineCommand<MyCommandResult>({ ... })
   ```

2. **Flag Schema with `satisfies`** (optional):
   ```typescript
   flags: {
     name: { type: 'string' },
   } satisfies FlagSchemaDefinition,
   ```

3. **Strict Argument Typing** (optional):
   ```typescript
   defineCommand<Flags, Result, ['workflow-id', ...string[]]>
   ```

4. **Explicit Flag Types** (optional - usually inferred):
   ```typescript
   defineCommand<{ name: { type: 'string' } }, Result>
   ```

**Philosophy: "Want a cactus? Eat it!"**
- **Absolute minimum**: Just return `{ ok: true }` - everything else is optional
- **Use types when you want**: Add result types and `satisfies` for type safety
- **Use strict typing when needed**: Maximum type safety for complex cases
- **Both approaches work**: Choose what fits your needs

### 2. Optional Flag Type Inference

Flags can be typed automatically from their schema definition using `satisfies FlagSchemaDefinition`, but it's **optional**:

```typescript
// Without satisfies - flags are Record<string, unknown>
export const cmd1 = defineSystemCommand({
  flags: {
    source: { type: 'string', default: 'all' },
  },
  async handler(ctx, argv, flags) {
    const source = flags.source; // unknown - may need type assertion
  },
});

// With satisfies - flags are properly typed
export const cmd2 = defineSystemCommand({
  flags: {
    source: { type: 'string', default: 'all' },
    tag: { type: 'string' },
    json: { type: 'boolean' },
  } satisfies FlagSchemaDefinition, // Optional - enables type inference
  
  async handler(ctx, argv, flags) {
    // TypeScript infers:
    // flags.source: string
    // flags.tag: string | undefined
    // flags.json: boolean
    const source = flags.source; // Type-safe!
  },
});
```

**Use `satisfies` when:**
- You want type safety and autocomplete for flags
- You want to avoid type assertions (`as string`)
- Or don't use it - totally up to you!

**Skip `satisfies` when:**
- You prefer simplicity and don't mind type assertions
- You're prototyping quickly
- Or just because you don't feel like it - that's fine too!

**Type Inference Rules:**
- `required: true` → non-nullable type
- `default: value` → non-nullable type (if default matches type)
- `choices: [...]` → union of literal types
- Otherwise → `T | undefined`

### 3. Optional Strict Argument Typing

Arguments (`argv`) default to `string[]` but can be strictly typed when needed:

```typescript
// Default: argv is string[]
export const cmd = defineCommand({
  async handler(ctx, argv, flags) {
    // argv: string[]
  },
});

// Strict typing: argv is tuple ['workflow-id', ...string[]]
export const wfRun = defineCommand<
  Flags,
  Result,
  ['workflow-id', ...string[]] // Optional strict typing
>({
  async handler(ctx, argv, flags) {
    const workflowId = argv[0]; // TypeScript knows it's 'workflow-id'
  },
});
```

### 4. Helper Types and Utilities (Optional)

**Result Helper Types:**
```typescript
// Optional convenience helpers
type MyResult = SuccessResult<{ items: Item[] }>;
type ErrorResult = ErrorResult<{ code: string }>;
type ExtendedResult = ResultWith<{ data: Data }>;
```

**Flag Helper Functions:**
```typescript
// Optional utilities for type-safe flag access
import { getFlag, requireFlag, hasFlag } from '@kb-labs/cli-command-kit';

const name = getFlag<string>(flags, 'name', 'default');
const id = requireFlag<string>(flags, 'id'); // Throws if missing
if (hasFlag(flags, 'dry-run')) { ... }
```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Command Definition                       │
│  defineCommand<TFlags, TResult, TArgv>(config)            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Flag Schema Definition                               │  │
│  │ { name: { type: 'string', required: true } }        │  │
│  │ satisfies FlagSchemaDefinition                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Type Inference (InferFlags<TFlags>)                 │  │
│  │ { name: string }                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Handler Function                                     │  │
│  │ handler(ctx, argv: TArgv, flags: InferFlags<TFlags>)│  │
│  │   → Promise<TResult>                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Formatter Function                                    │  │
│  │ formatter(result: TResult, ctx, flags, argv?: TArgv)│  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Type Safety Flow

1. **Schema Definition** → TypeScript infers `TFlags` from literal types
2. **Flag Validation** → Runtime validation matches TypeScript types
3. **Handler Execution** → Type-safe access to `flags` and `argv`
4. **Result Validation** → TypeScript ensures return type matches `TResult`
5. **Formatter Execution** → Type-safe access to `result` with correct types

## Consequences

### Positive

- **Type Safety**: Eliminates 90+ unsafe type assertions across codebase
- **Developer Experience**: Full autocomplete and type checking in IDE
- **API Contracts**: Explicit result types enable future contract validation
- **Zero Boilerplate**: Default types work without additional configuration
- **Optional Strictness**: Can opt-in to strict typing when needed
- **Backward Compatible**: Existing commands continue to work
- **Live Compile**: TypeScript provides real-time feedback in IDE

### Negative

- **Learning Curve**: Developers need to understand `satisfies FlagSchemaDefinition` pattern
- **Slightly More Verbose**: Must explicitly declare result types (but this is intentional)
- **Type Complexity**: Generic parameters can be intimidating for new contributors
- **Build Time**: More complex types may slightly increase TypeScript compilation time

### Alternatives Considered

1. **Runtime Type Validation**: Rejected - adds runtime overhead, TypeScript provides compile-time safety
2. **Zod Schemas**: Considered but rejected - would duplicate schema definitions, prefer single source of truth
3. **No Result Typing**: Rejected - explicit contracts are essential for API stability
4. **Always Strict Typing**: Rejected - would be too verbose for simple commands, prefer optional strictness
5. **Type Assertions Everywhere**: Rejected - current state, unsafe and error-prone

## Implementation

### Changes Made

1. **Added Generic Parameters**:
   - `TResult extends CommandResult` (required) - result type contract
   - `TArgv extends readonly string[] = string[]` (optional) - argument typing

2. **Type Inference System**:
   - `InferFlags<TFlags>` - converts flag schema to TypeScript types
   - `satisfies FlagSchemaDefinition` - preserves literal types for inference

3. **Helper Types**:
   - `SuccessResult<T>`, `ErrorResult<T>`, `ResultWith<T>` - optional convenience types

4. **Helper Functions**:
   - `getFlag<T>()`, `requireFlag<T>()`, `hasFlag()` - optional type-safe utilities

5. **Updated All Commands**:
   - Migrated 52+ plugin commands to use `defineCommand` with result types
   - Migrated 30+ system commands to use `defineSystemCommand` with result types
   - Added `satisfies FlagSchemaDefinition` to flag schemas

### Migration Guide

**Before:**
```typescript
export const cmd = {
  async run(ctx, argv, flags) {
    const name = flags.name as string | undefined; // Unsafe!
    return { ok: true }; // No type contract
  },
};
```

**After (Absolute Minimum - Everything Optional):**
```typescript
// Works without any types - just return { ok: boolean }
export const cmd = defineCommand({
  flags: {
    name: { type: 'string' },
  },
  async handler(ctx, argv, flags) {
    const name = flags.name as string; // May need type assertion
    return { ok: true };
  },
});
```

**After (Recommended - with type safety):**
```typescript
type CmdResult = CommandResult & { count: number };

export const cmd = defineCommand<CmdResult>({
  flags: {
    name: { type: 'string' },
  } satisfies FlagSchemaDefinition, // Optional but recommended
  
  async handler(ctx, argv, flags) {
    const name = flags.name; // Type-safe!
    return { ok: true, count: 0 };
  },
});
```

**For System Commands (Same Philosophy):**
```typescript
// Minimum - no types required
export const systemCmd = defineSystemCommand({
  name: 'cmd',
  description: 'Description',
  flags: {
    name: { type: 'string' },
  },
  async handler(ctx, argv, flags) {
    return { ok: true };
  },
});

// Recommended - with types
type SystemCmdResult = CommandResult & { status: string };

export const systemCmd = defineSystemCommand<SystemCmdResult>({
  name: 'cmd',
  description: 'Description',
  flags: {
    name: { type: 'string' },
  } satisfies FlagSchemaDefinition, // Optional but recommended
  
  async handler(ctx, argv, flags) {
    return { ok: true, status: 'done' };
  },
});
```

### Required vs Optional for Contributors

**MANDATORY (must provide):**
1. ✅ Handler function that returns `{ ok: boolean, ... }` - that's it!

**OPTIONAL (everything else):**
1. 🔹 Result type definition - use when you want better API contracts
2. 🔹 `satisfies FlagSchemaDefinition` - use when you want type-safe flag access
3. 🔹 Strict argument typing (`TArgv` generic parameter) - use when you need strict argv types
4. 🔹 Explicit flag type (`TFlags` generic parameter) - usually inferred automatically
5. 🔹 Helper functions (`getFlag`, `requireFlag`, etc.) - use when convenient
6. 🔹 Custom formatter function - use when you need custom output formatting

**Philosophy: "Want a cactus? Eat it!"**
- **Everything is optional** except returning `{ ok: boolean }`
- Use types when you want type safety and better DX
- Skip types when you want simplicity and speed
- Both approaches work perfectly - choose what fits your needs
- No pressure, no requirements, just options

### Future Considerations

- **Contract Validation**: Runtime validation of result types against declared contracts
- **Schema Generation**: Generate TypeScript types from JSON schemas
- **Type Testing**: Automated tests to ensure type safety
- **Documentation Generation**: Auto-generate API docs from type definitions

## References

- [TypeScript `satisfies` operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
- [ADR-0006: Legacy Command Migration](./0006-legacy-command-migration-to-manifest-system.md)
- [ADR-0007: System Commands UX/UI Unification](./0007-system-commands-ux-ui-unification.md)
- [Command Kit Documentation](../../packages/command-kit/README.md)
- [Typing Solutions Document](../../packages/command-kit/TYPING_SOLUTIONS.md)

---

**Last Updated:** 2025-11-20  
**Next Review:** 2026-05-20 (6 months)

